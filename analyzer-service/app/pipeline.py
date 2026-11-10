import logging
import os
import shutil
import stat
import subprocess
import tempfile
import time
from datetime import datetime, timezone

from app import llm_service, scanner
from app.db import supabase

log = logging.getLogger("centinela.pipeline")
LOTE = 500


def _ahora():
    return datetime.now(timezone.utc).isoformat()


def _actualizar(analisis_id, **campos):
    supabase.table("analisis").update(campos).eq("id", analisis_id).execute()


def _quitar_solo_lectura(funcion, ruta, _error):
    # En Windows git deja archivos de solo lectura que rmtree no puede borrar.
    os.chmod(ruta, stat.S_IWRITE)
    funcion(ruta)


def ejecutar(analisis_id, clone_url, rama):
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

        bandit = scanner.ejecutar_bandit(destino)
        scripts = os.path.join(carpeta, "inline")
        os.makedirs(scripts)
        scanner.extraer_scripts(destino, scripts)
        semgrep = scanner.ejecutar_semgrep(destino, scripts)
        hallazgos = [scanner.a_hallazgo(r) for r in bandit.get("results", [])]
        hallazgos += [scanner.a_hallazgo_semgrep(r, destino) for r in semgrep.get("results", [])]

        resumen, modelo = None, None
        if hallazgos:
            try:
                resumen, modelo = llm_service.interpretar(hallazgos)
            except Exception:
                # Si la IA falla se guardan igual los hallazgos de Bandit.
                log.exception("La IA no pudo interpretar el análisis %s", analisis_id)
        else:
            resumen = "Bandit y Semgrep no encontraron vulnerabilidades en este repositorio."

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
