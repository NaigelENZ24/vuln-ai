"""Tareas diarias en segundo plano: análisis de ramas con commits nuevos y recordatorios.
shortcut: hilo dentro del servicio con memoria de "ya se hizo hoy"; tras un reinicio se repite, pero cada tarea es
segura de repetir (el análisis se omite si la rama no cambió y el recordatorio si ya se envió hoy).
Con varios servidores, pasar a un cron externo."""
import logging
import threading
import time
from datetime import datetime

from app import github_service, pipeline, recordatorios
from app.db import supabase

log = logging.getLogger("centinela.programador")
HORA_ANALISIS = 6        # hora local del servidor
INTERVALO = 15 * 60      # cada cuánto se revisa si toca algo
_hechos = {}


def _toca_hoy(clave, hora):
    ahora = datetime.now()
    if ahora.hour < hora or _hechos.get(clave) == ahora.date():
        return False
    _hechos[clave] = ahora.date()
    return True


def _analisis_diario():
    """Re-analiza las ramas vigiladas que tienen commits nuevos (solo las que ya se analizaron alguna vez)."""
    ramas = (
        supabase.table("ramas_vigiladas")
        .select("id, rama, es_principal, ultimo_sha, repositorio_id, repositorios!inner(url, equipo_id, equipos(creado_por))")
        .not_.is_("repositorios.equipo_id", "null").not_.is_("ultimo_sha", "null").execute().data
    )
    for fila in ramas:
        try:
            owner, nombre = github_service.parsear_url(fila["repositorios"]["url"])
            if github_service.validar_rama(owner, nombre, fila["rama"]) == fila["ultimo_sha"]:
                continue  # sin commits nuevos: no gasta Docker ni IA
            if (supabase.table("analisis").select("id").eq("rama_vigilada_id", fila["id"])
                    .in_("estado", ["pendiente", "en_proceso"]).limit(1).execute().data):
                continue
            _, argumentos = pipeline.nuevo_analisis_rama(fila, fila["repositorios"]["equipos"]["creado_por"])
            pipeline.ejecutar(*argumentos)
        except Exception:
            log.exception("No se pudo analizar la rama %s", fila["id"])


def _recordatorios():
    equipos = supabase.table("equipos").select("id, hora_recordatorios").eq("recordatorios_activos", True).execute().data
    for e in equipos:
        if _toca_hoy(f"recordatorios-{e['id']}", e["hora_recordatorios"]):
            try:
                log.info("Recordatorios del equipo %s: %s", e["id"], recordatorios.ejecutar(e["id"]))
            except Exception:
                log.exception("Fallaron los recordatorios del equipo %s", e["id"])


def _bucle():
    while True:
        try:
            if _toca_hoy("analisis", HORA_ANALISIS):
                _analisis_diario()
            _recordatorios()
        except Exception:
            log.exception("Falló una tarea programada")
        time.sleep(INTERVALO)


def iniciar():
    threading.Thread(target=_bucle, name="programador", daemon=True).start()
