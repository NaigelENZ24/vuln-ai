"""Asistente IA del equipo (solo administrador). El sistema calcula las cifras; la IA solo las redacta.
La IA nunca consulta la base: recibe este resumen, así que no puede ver datos de otro equipo."""
from collections import Counter
from datetime import datetime, timedelta, timezone

from app.db import supabase
from app.recordatorios import _fecha, _item

ABIERTAS = ("abierta", "en_correccion", "en_revision")
MAX_DETALLE = 150      # incidencias abiertas listadas una por una
MAX_RESUELTAS = 50


def construir_contexto(equipo, miembros, ramas, incidencias, ahora=None):
    """Cifras del equipo para la IA. Datos ya leídos de la base: aquí no hay consultas (se puede probar)."""
    ahora = ahora or datetime.now(timezone.utc)
    nombres = {m["usuario_id"]: (m.get("perfiles") or {}).get("nombre") or "—" for m in miembros}
    abiertas = [i for i in incidencias if i["estado"] in ABIERTAS]
    resueltas = [i for i in incidencias if i["estado"] == "resuelta" and i.get("resuelta_en")
                 and _fecha(i["resuelta_en"]) >= ahora - timedelta(days=30)]
    vencida = lambda i: bool(i.get("fecha_limite")) and _fecha(i["fecha_limite"]) < ahora
    estancada = lambda i: (i["estado"] == "en_correccion"
                           and _fecha(i["actualizada_en"]) < ahora - timedelta(days=equipo["dias_estancada"]))
    nombre_repo = {r["repositorio_id"]: (r.get("repositorios") or {}).get("nombre") for r in ramas}
    principal = {r["repositorio_id"]: r["rama"] for r in ramas if r["es_principal"]}

    personas = []
    for m in miembros:
        mias = [i for i in abiertas if i["asignado_a"] == m["usuario_id"]]
        elegidas = {x["repositorio_id"]: (x.get("ramas_vigiladas") or {}).get("rama") for x in m.get("miembro_ramas") or []}
        sev = Counter(i["severidad"] for i in mias)
        personas.append({
            "nombre": nombres[m["usuario_id"]], "rol": m["rol"], "github": m.get("github_usuario"),
            "trabaja_en": [f"{nombre_repo[r]} · {elegidas.get(r) or principal[r]}" for r in principal] if m["rol"] == "colaborador" else [],
            "asignadas": len(mias), "altas": sev["alto"], "medias": sev["medio"], "bajas": sev["bajo"],
            "vencidas": sum(vencida(i) for i in mias),
            "altas_vencidas": sum(vencida(i) for i in mias if i["severidad"] == "alto"),
            "en_correccion": sum(i["estado"] == "en_correccion" for i in mias),
            "estancadas": sum(estancada(i) for i in mias),
            "resueltas_30_dias": sum(i["asignado_a"] == m["usuario_id"] for i in resueltas),
        })

    def huellas(repo, rama):
        return {i["huella"] for i in abiertas if i["repositorio_id"] == repo and i["rama"] == rama}

    por_rama = []
    for r in ramas:
        de_rama = [i for i in abiertas if i["repositorio_id"] == r["repositorio_id"] and i["rama"] == r["rama"]]
        sev = Counter(i["severidad"] for i in de_rama)
        fila = {"repositorio": nombre_repo[r["repositorio_id"]], "rama": r["rama"], "principal": r["es_principal"],
                "abiertas_alta": sev["alto"], "abiertas_media": sev["medio"], "abiertas_baja": sev["bajo"],
                "vencidas": sum(vencida(i) for i in de_rama)}
        if not r["es_principal"] and r["repositorio_id"] in principal:  # semáforo de fusión, por huella
            propias, base = huellas(r["repositorio_id"], r["rama"]), huellas(r["repositorio_id"], principal[r["repositorio_id"]])
            nuevas = [i for i in de_rama if i["huella"] not in base]
            fila["frente_a_la_principal"] = {"nuevas": len(nuevas), "nuevas_altas": sum(i["severidad"] == "alto" for i in nuevas),
                                            "corregidas": len(base - propias)}
        por_rama.append(fila)

    def linea(i):
        return {"titulo": i.get("titulo") or i["regla_id"], "severidad": i["severidad"], "estado": i["estado"],
                "repositorio": nombre_repo.get(i["repositorio_id"]), "rama": i["rama"], "archivo": i["archivo"],
                "responsable": nombres.get(i["asignado_a"], "sin asignar") if i["asignado_a"] else "sin asignar",
                "plazo": _item(i, ahora)["plazo"] or "sin plazo",
                "dias_sin_cambios": (ahora - _fecha(i["actualizada_en"])).days,
                "pide_revision_no_es_vulnerabilidad": bool(i.get("descarte_solicitado"))}

    orden = {"alto": 0, "medio": 1, "bajo": 2}
    detalle = sorted(abiertas, key=lambda i: (not vencida(i), orden[i["severidad"]]))
    sev = Counter(i["severidad"] for i in abiertas)
    return {
        "equipo": equipo["nombre"],
        "fecha_de_hoy": ahora.date().isoformat(),
        "limite_en_correccion_por_persona": equipo["limite_en_correccion"],
        "totales": {"abiertas_alta": sev["alto"], "abiertas_media": sev["medio"], "abiertas_baja": sev["bajo"],
                    "en_correccion": sum(i["estado"] == "en_correccion" for i in abiertas),
                    "en_revision": sum(i["estado"] == "en_revision" for i in abiertas),
                    "vencidas": sum(vencida(i) for i in abiertas),
                    "sin_asignar": sum(not i["asignado_a"] for i in abiertas),
                    "resueltas_30_dias": len(resueltas)},
        "personas": personas,
        "ramas": por_rama,
        "incidencias_abiertas": [linea(i) for i in detalle[:MAX_DETALLE]],
        "incidencias_abiertas_no_listadas": max(0, len(detalle) - MAX_DETALLE),
        "resueltas_recientes": [{"titulo": i.get("titulo") or i["regla_id"], "severidad": i["severidad"], "rama": i["rama"],
                                 "responsable": nombres.get(i["asignado_a"], "sin asignar") if i["asignado_a"] else "sin asignar",
                                 "corregida_por_github": i.get("corregida_por"), "como": i.get("motivo_cierre"),
                                 "fecha": i["resuelta_en"][:10]}
                                for i in sorted(resueltas, key=lambda i: i["resuelta_en"], reverse=True)[:MAX_RESUELTAS]],
    }


def cargar(equipo_id):
    """Lee de la base lo que necesita construir_contexto."""
    desde = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    equipo = (supabase.table("equipos").select("nombre, limite_en_correccion, dias_estancada")
              .eq("id", equipo_id).single().execute().data)
    miembros = (supabase.table("miembros_equipo")
                .select("usuario_id, rol, github_usuario, perfiles(nombre), miembro_ramas(repositorio_id, ramas_vigiladas(rama))")
                .eq("equipo_id", equipo_id).execute().data)
    ramas = (supabase.table("ramas_vigiladas").select("repositorio_id, rama, es_principal, repositorios!inner(nombre, equipo_id)")
             .eq("repositorios.equipo_id", equipo_id).execute().data)
    incidencias = (supabase.table("incidencias")
                   .select("titulo, regla_id, severidad, estado, rama, repositorio_id, archivo, linea_actual, fecha_limite, "
                           "actualizada_en, asignado_a, resuelta_en, motivo_cierre, corregida_por, huella, descarte_solicitado, "
                           "repositorios!inner(equipo_id)")
                   .eq("repositorios.equipo_id", equipo_id)
                   .or_(f'estado.in.(abierta,en_correccion,en_revision),resuelta_en.gte."{desde}"')
                   .limit(3000).execute().data)
    return construir_contexto(equipo, miembros, ramas, incidencias)
