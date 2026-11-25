import logging
import os
import shutil
import stat
import subprocess
import tempfile
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

from app import incidencias, llm_service, scanner
from app.db import supabase

log = logging.getLogger("centinela.pipeline")
LOTE = 500
# shortcut: cola en memoria, un análisis a la vez (Docker tiene 1 CPU por contenedor); si el servicio se
# reinicia, los pendientes se marcan como error. Cola persistente en la base si hay varios servidores.
_turno = threading.Lock()


def _ahora():
    return datetime.now(timezone.utc).isoformat()


def _actualizar(analisis_id, **campos):
    supabase.table("analisis").update(campos).eq("id", analisis_id).execute()


def _quitar_solo_lectura(funcion, ruta, _error):
    # En Windows git deja archivos de solo lectura que rmtree no puede borrar.
    os.chmod(ruta, stat.S_IWRITE)
    funcion(ruta)


CAMPOS_RAMA = "id, rama, es_principal, ultimo_sha, repositorio_id, repositorios(url, equipo_id)"


def nuevo_analisis_rama(fila, solicitado_por):
    """Crea el análisis de una rama vigilada (fila con CAMPOS_RAMA) y devuelve (analisis_id, argumentos de ejecutar)."""
    from app.github_service import parsear_url  # import local: github_service importa FastAPI
    owner, nombre = parsear_url(fila["repositorios"]["url"])
    analisis = (
        supabase.table("analisis")
        .insert({"repositorio_id": fila["repositorio_id"], "solicitado_por": solicitado_por,
                 "rama": fila["rama"], "rama_vigilada_id": fila["id"]})
        .execute().data[0]
    )
    vigilada = {"id": fila["id"], "repositorio_id": fila["repositorio_id"], "equipo_id": fila["repositorios"]["equipo_id"],
                "rama": fila["rama"], "es_principal": fila["es_principal"], "ultimo_sha": fila["ultimo_sha"],
                "owner": owner, "repo": nombre}
    return analisis["id"], (analisis["id"], f"https://github.com/{owner}/{nombre}.git", fila["rama"], vigilada)


def ejecutar(analisis_id, clone_url, rama, vigilada=None):
    """vigilada: rama de un equipo ({id, repositorio_id, equipo_id, rama, owner, repo}); None en un análisis personal."""
    with _turno:
        _ejecutar(analisis_id, clone_url, rama, vigilada)


def _ejecutar(analisis_id, clone_url, rama, vigilada):
    """Clona el repo, corre Bandit y Semgrep, pide la interpretación a la IA y guarda todo. Corre en segundo plano."""
    inicio = time.monotonic()
    carpeta = tempfile.mkdtemp(prefix="centinela-")
    try:
        _actualizar(analisis_id, estado="en_proceso")
        destino = os.path.join(carpeta, "repo")
        subprocess.run(
            ["git", "clone", "--depth", "1", "--single-branch", "--branch", rama, "--", clone_url, destino],
            check=True, capture_output=True, timeout=180,
            # Sin descargar archivos de Git LFS: GitHub no los cuenta en el tamaño y podrían llenar el disco.
            env={**os.environ, "GIT_TERMINAL_PROMPT": "0", "GIT_LFS_SKIP_SMUDGE": "1"},
        )
        commit = subprocess.run(["git", "-C", destino, "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip()

        # Bandit y Semgrep son contenedores independientes: correrlos a la vez ahorra casi todo el tiempo del más corto.
        scripts = os.path.join(carpeta, "inline")
        os.makedirs(scripts)
        with ThreadPoolExecutor(max_workers=1) as hilo:
            futuro_bandit = hilo.submit(scanner.ejecutar_bandit, destino)
            scanner.extraer_scripts(destino, scripts)
            semgrep = scanner.ejecutar_semgrep(destino, scripts)
            bandit = futuro_bandit.result()
        hallazgos = [scanner.a_hallazgo(r) for r in bandit.get("results", [])]
        hallazgos += [scanner.a_hallazgo_semgrep(r, destino) for r in semgrep.get("results", [])]
        incidencias.asignar_huellas(hallazgos, destino)

        # En una rama de equipo se reutilizan las explicaciones de la IA de las incidencias ya conocidas.
        previas = incidencias.explicaciones_previas(vigilada["repositorio_id"], hallazgos) if vigilada and hallazgos else {}
        resumen, modelo = None, None
        if not hallazgos:
            resumen = "Bandit y Semgrep no encontraron vulnerabilidades en este repositorio."
        elif all(h["huella"] in previas for h in hallazgos):
            resumen = (f"No hay vulnerabilidades nuevas respecto al análisis anterior de esta rama. "
                       f"Siguen {len(hallazgos)} ya conocidas; cada una conserva su explicación.")
        else:
            try:
                resumen, modelo = llm_service.interpretar(hallazgos)
            except Exception:
                # Si la IA falla se guardan igual los hallazgos de Bandit.
                log.exception("La IA no pudo interpretar el análisis %s", analisis_id)
        incidencias.aplicar_explicaciones(hallazgos, previas)  # la misma explicación de siempre para lo ya conocido

        if vigilada:
            incidencias.conciliar(analisis_id, vigilada, hallazgos, destino, commit)

        filas = [{**h, "analisis_id": analisis_id} for h in hallazgos]
        for i in range(0, len(filas), LOTE):
            supabase.table("hallazgos").insert(filas[i:i + LOTE]).execute()

        _actualizar(
            analisis_id,
            estado="completado",
            commit_sha=commit or None,
            version_bandit=scanner.versiones(),  # la columna guarda las versiones de ambos analizadores
            modelo_llm=modelo,
            resumen_ia=resumen,
            segundos=round(time.monotonic() - inicio, 1),
            finalizado_en=_ahora(),
            **scanner.metricas(destino, bandit, semgrep),
        )
        if vigilada:
            supabase.table("ramas_vigiladas").update({"ultimo_sha": commit or None}).eq("id", vigilada["id"]).execute()
    except Exception as error:
        log.exception("Falló el análisis %s", analisis_id)
        if isinstance(error, subprocess.CalledProcessError):
            mensaje = "No se pudo clonar el repositorio."
        elif isinstance(error, subprocess.TimeoutExpired):
            mensaje = "El análisis tardó demasiado y se canceló."
        elif isinstance(error, FileNotFoundError):
            mensaje = "Falta git o Docker en el servidor de análisis."
        else:
            mensaje = f"Error durante el análisis: {error}"[:500]
        _actualizar(analisis_id, estado="error", error_mensaje=mensaje, finalizado_en=_ahora())
    finally:
        shutil.rmtree(carpeta, onexc=_quitar_solo_lectura)
