"""Hallazgo -> incidencia. Un hallazgo es lo que encontró un análisis; una incidencia es el problema que
persiste entre análisis de la misma rama. Se reconocen por la huella, que no depende del número de línea."""
import hashlib
import os
from collections import Counter
from datetime import datetime, timedelta, timezone

from app import github_service
from app.db import supabase
from app.scanner import _lineas

ABIERTAS = ("abierta", "en_correccion", "en_revision")
LOTE = 500
# shortcut: una consulta a GitHub por archivo nuevo; con más archivos el resto queda sin sugerencia.
MAX_SUGERENCIAS = 30


def asignar_huellas(hallazgos, ruta):
    """huella = regla + archivo + código exacto normalizado + n.º de aparición (dos líneas iguales en un archivo)."""
    vistos = Counter()
    for h in hallazgos:
        fin = h.pop("_fin", None) or h["linea"]
        codigo = _lineas(ruta, h["archivo"], h["linea"], fin) if h["linea"] else None
        base = f'{h["regla_id"]}|{h["archivo"]}|{" ".join((codigo or h.get("fragmento_codigo") or "").split())}'
        vistos[base] += 1
        h["huella"] = hashlib.sha256(f"{base}|{vistos[base]}".encode()).hexdigest()


def _todas(consulta):
    """Todas las filas de una consulta (Supabase devuelve como máximo 1000 por petición)."""
    filas, desde = [], 0
    while True:
        lote = consulta().range(desde, desde + 999).execute().data
        filas += lote
        if len(lote) < 1000:
            return filas
        desde += 1000


def explicaciones_previas(repositorio_id, hallazgos):
    """Explicaciones de la IA ya guardadas para estas huellas en cualquier rama del repositorio."""
    huellas = list({h["huella"] for h in hallazgos})
    previas = {}
    for i in range(0, len(huellas), 200):
        filas = (
            supabase.table("incidencias").select("huella, explicacion_ia, recomendacion_ia")
            .eq("repositorio_id", repositorio_id).in_("huella", huellas[i:i + 200])
            .not_.is_("explicacion_ia", "null").execute().data
        )
        previas.update({f["huella"]: f for f in filas})
    return previas


def aplicar_explicaciones(hallazgos, previas):
    for h in hallazgos:
        p = previas.get(h["huella"])
        if p:
            h["explicacion_ia"], h["recomendacion_ia"] = p["explicacion_ia"], p["recomendacion_ia"]


def _plazos(equipo_id):
    """Días para corregir por severidad, configurados por el equipo (None = sin plazo)."""
    e = (supabase.table("equipos").select("plazo_alta_dias, plazo_media_dias, plazo_baja_dias")
         .eq("id", equipo_id).single().execute().data)
    return {"alto": e["plazo_alta_dias"], "medio": e["plazo_media_dias"], "bajo": e["plazo_baja_dias"]}


def _evento(incidencia_id, tipo, anterior, nuevo, nota=None):
    return {"incidencia_id": incidencia_id, "tipo": tipo, "estado_anterior": anterior, "estado_nuevo": nuevo, "nota": nota}


def _sugerencias(vigilada, nuevas):
    """Responsable sugerido por archivo: el colaborador que lo modificó por última vez en esa rama."""
    miembros = (
        supabase.table("miembros_equipo").select("usuario_id, github_usuario")
        .eq("equipo_id", vigilada["equipo_id"]).eq("rol", "colaborador")
        .not_.is_("github_usuario", "null").execute().data
    )
    # Solo quien trabaja en esta rama: su rama elegida, o la principal si no tiene (igual que rama_permitida en la base).
    elegidas = {
        f["usuario_id"]: f["ramas_vigiladas"]["rama"]
        for f in supabase.table("miembro_ramas").select("usuario_id, ramas_vigiladas(rama)")
        .eq("repositorio_id", vigilada["repositorio_id"]).execute().data
    }
    miembros = [m for m in miembros
                if elegidas.get(m["usuario_id"], vigilada["rama"] if vigilada["es_principal"] else None) == vigilada["rama"]]
    por_login = {m["github_usuario"].lower(): m["usuario_id"] for m in miembros}
    if not por_login:
        return {}
    sugeridos = {}
    for archivo in list(dict.fromkeys(h["archivo"] for h in nuevas))[:MAX_SUGERENCIAS]:
        login = github_service.autor_ultimo_commit(vigilada["owner"], vigilada["repo"], vigilada["rama"], archivo)
        if login and login.lower() in por_login:
            sugeridos[archivo] = por_login[login.lower()]
    return sugeridos


def conciliar(analisis_id, vigilada, hallazgos, ruta, commit):
    """Crea, actualiza, reabre y resuelve las incidencias de la rama. Deja incidencia_id en cada hallazgo."""
    rid, rama = vigilada["repositorio_id"], vigilada["rama"]
    existentes = {
        f["huella"]: f
        for f in _todas(lambda: supabase.table("incidencias")
                        .select("id, huella, estado, archivo, veces_reabierta, motivo_cierre, descarte_solicitado")
                        .eq("repositorio_id", rid).eq("rama", rama))
    }
    ahora = datetime.now(timezone.utc)
    corto = (commit or "")[:7]
    eventos, nuevas, vistas = [], [], set()

    for h in hallazgos:
        e = existentes.get(h["huella"])
        if not e:
            nuevas.append(h)
            continue
        vistas.add(e["id"])
        h["incidencia_id"] = e["id"]
        cambios = {"ultimo_analisis_id": analisis_id, "linea_actual": h["linea"],
                   "fragmento_codigo": h["fragmento_codigo"], "actualizada_en": ahora.isoformat()}
        # El admin la cerró como "no es una vulnerabilidad", o la revisión de esa solicitud está pendiente:
        # el código sigue igual a propósito, así que el análisis no la reabre ni la da por fallida.
        if e["motivo_cierre"] == "descartada" or e["descarte_solicitado"]:
            pass
        elif e["estado"] == "resuelta":
            cambios |= {"estado": "abierta", "motivo_cierre": None, "resuelta_en": None,
                        "commit_correccion": None, "veces_reabierta": e["veces_reabierta"] + 1}
            eventos.append(_evento(e["id"], "reabierta", "resuelta", "abierta", f"Volvió a aparecer en el commit {corto}."))
        elif e["estado"] == "en_revision":
            cambios["estado"] = "en_correccion"
            eventos.append(_evento(e["id"], "verificacion_fallida", "en_revision", "en_correccion",
                                   f"El re-análisis del commit {corto} todavía lo encuentra en la línea {h['linea']}."))
        supabase.table("incidencias").update(cambios).eq("id", e["id"]).execute()

    sugeridos = _sugerencias(vigilada, nuevas) if nuevas else {}
    plazos = _plazos(vigilada["equipo_id"]) if nuevas else {}
    filas = [{
        "repositorio_id": rid, "rama": rama, "huella": h["huella"], "regla_id": h["regla_id"],
        "titulo": h["titulo"], "categoria": h["categoria"], "cwe_id": h["cwe_id"], "archivo": h["archivo"],
        "linea_actual": h["linea"], "fragmento_codigo": h["fragmento_codigo"], "severidad": h["severidad"],
        "explicacion_ia": h.get("explicacion_ia"), "recomendacion_ia": h.get("recomendacion_ia"),
        "sugerido_a": sugeridos.get(h["archivo"]),
        "fecha_limite": (ahora + timedelta(days=plazos[h["severidad"]])).isoformat() if plazos[h["severidad"]] else None,
        "primer_analisis_id": analisis_id, "ultimo_analisis_id": analisis_id,
    } for h in nuevas]
    por_huella = {h["huella"]: h for h in nuevas}
    for i in range(0, len(filas), LOTE):
        for creada in supabase.table("incidencias").insert(filas[i:i + LOTE]).execute().data:
            por_huella[creada["huella"]]["incidencia_id"] = creada["id"]
            eventos.append(_evento(creada["id"], "detectada", None, "abierta", f"Detectada en el commit {corto}."))

    autores = None  # se consulta a GitHub una sola vez, y solo si algo se resolvió
    for e in existentes.values():
        if e["id"] in vistas or e["estado"] not in ABIERTAS:
            continue
        if autores is None:
            anterior = vigilada.get("ultimo_sha")
            autores = (github_service.autores_entre(vigilada["owner"], vigilada["repo"], anterior, commit)
                       if anterior and commit and anterior != commit else [])
        # "Corregida de verdad" solo si el archivo sigue existiendo y la huella ya no aparece.
        motivo = "verificada" if os.path.isfile(os.path.join(ruta, e["archivo"])) else "archivo_eliminado"
        supabase.table("incidencias").update({
            "estado": "resuelta", "motivo_cierre": motivo, "resuelta_en": ahora.isoformat(),
            "commit_correccion": commit, "actualizada_en": ahora.isoformat(), "descarte_solicitado": False,
            "corregida_por": ", ".join(autores) or None,
        }).eq("id", e["id"]).execute()
        por = f" por @{', @'.join(autores)}" if autores else ""
        nota = (f"Ya no aparece en el commit {corto}{por}." if motivo == "verificada"
                else f"El archivo ya no existe en el commit {corto}.")
        eventos.append(_evento(e["id"], "resuelta", e["estado"], "resuelta", nota))

    for i in range(0, len(eventos), LOTE):
        supabase.table("incidencia_eventos").insert(eventos[i:i + LOTE]).execute()

