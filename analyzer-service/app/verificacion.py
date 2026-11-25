"""«Ya la corregí, verificar»: revisa solo el archivo de la incidencia, no todo el repositorio.
Bandit y las reglas de Semgrep que usamos trabajan archivo por archivo, así que el resultado es el mismo que daría
el análisis completo para ese archivo. Sin IA: no hay nada nuevo que explicar."""
import logging
import os
import re
import shutil
import tempfile
from datetime import datetime, timezone

from app import github_service, incidencias, scanner
from app.db import supabase

log = logging.getLogger("centinela.verificacion")
REGLA_BANDIT = re.compile(r"^B\d{3}$")


def ruta_segura(carpeta, archivo):
    """Ruta local del archivo dentro de la carpeta temporal; rechaza rutas que intenten salir de ella."""
    destino = os.path.normpath(os.path.join(carpeta, archivo))
    if os.path.isabs(archivo) or not destino.startswith(os.path.normpath(carpeta) + os.sep):
        raise ValueError(f"Ruta de archivo no válida: {archivo}")
    return destino


def analizar_archivo(carpeta, regla_id):
    """Corre solo el analizador que detectó la incidencia sobre la carpeta (que contiene un único archivo)."""
    if REGLA_BANDIT.match(regla_id):
        return [scanner.a_hallazgo(r) for r in scanner.ejecutar_bandit(carpeta).get("results", [])]
    scripts = tempfile.mkdtemp(prefix="centinela-inline-")
    try:
        scanner.extraer_scripts(carpeta, scripts)  # por si es un .html con <script>
        return [scanner.a_hallazgo_semgrep(r, carpeta) for r in scanner.ejecutar_semgrep(carpeta, scripts).get("results", [])]
    finally:
        shutil.rmtree(scripts, ignore_errors=True)


def _cerrar(inc, cambios, evento):
    ahora = datetime.now(timezone.utc).isoformat()
    supabase.table("incidencias").update({**cambios, "actualizada_en": ahora}).eq("id", inc["id"]).execute()
    supabase.table("incidencia_eventos").insert({"incidencia_id": inc["id"], "estado_anterior": "en_revision", **evento}).execute()


def _resolver(inc, motivo, sha, autor, nota):
    ahora = datetime.now(timezone.utc).isoformat()
    _cerrar(inc, {"estado": "resuelta", "motivo_cierre": motivo, "resuelta_en": ahora, "commit_correccion": sha,
                  "descarte_solicitado": False, "corregida_por": autor},
            {"tipo": "resuelta", "estado_nuevo": "resuelta", "nota": nota})


def ejecutar(inc, owner, repo):
    """inc: id, huella, archivo, regla_id, rama. Corre en segundo plano; deja la incidencia resuelta o en corrección."""
    carpeta = tempfile.mkdtemp(prefix="centinela-verif-")
    try:
        sha = github_service.validar_rama(owner, repo, inc["rama"])
        corto, archivo = sha[:7], inc["archivo"]
        contenido = github_service.descargar_archivo(owner, repo, sha, archivo)
        if contenido is None:
            _resolver(inc, "archivo_eliminado", sha, None, f"El archivo {archivo} ya no existe en el commit {corto}.")
            return

        destino = ruta_segura(carpeta, archivo)
        os.makedirs(os.path.dirname(destino), exist_ok=True)
        with open(destino, "wb") as f:
            f.write(contenido)

        hallazgos = [h for h in analizar_archivo(carpeta, inc["regla_id"]) if h["archivo"] == archivo]
        incidencias.asignar_huellas(hallazgos, carpeta)  # misma huella que el análisis completo
        sigue = next((h for h in hallazgos if h["huella"] == inc["huella"]), None)
        if sigue:
            _cerrar(inc, {"estado": "en_correccion", "linea_actual": sigue["linea"], "fragmento_codigo": sigue["fragmento_codigo"]},
                    {"tipo": "verificacion_fallida", "estado_nuevo": "en_correccion",
                     "nota": f"La verificación del commit {corto} todavía lo encuentra en la línea {sigue['linea']} de {archivo}."})
        else:
            autor = github_service.autor_ultimo_commit(owner, repo, inc["rama"], archivo)
            por = f" por @{autor}" if autor else ""
            _resolver(inc, "verificada", sha, autor, f"Ya no aparece en {archivo} en el commit {corto}{por}.")
    except Exception as error:
        log.exception("No se pudo verificar la incidencia %s", inc["id"])
        detalle = getattr(error, "detail", None) or str(error)
        _cerrar(inc, {"estado": "en_correccion"},
                {"tipo": "verificacion_error", "estado_nuevo": "en_correccion",
                 "nota": f"No se pudo verificar: {detalle}"[:300] + ". Inténtalo de nuevo."})
    finally:
        shutil.rmtree(carpeta, ignore_errors=True)
