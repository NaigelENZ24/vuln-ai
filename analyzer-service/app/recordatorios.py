"""Recordatorios por correo según las reglas del equipo, y escalamiento al administrador.
Cada envío (o la razón para no enviar) queda en la tabla notificaciones."""
import logging
from datetime import datetime, timedelta, timezone

from app import correo
from app.config import ALLOWED_ORIGIN
from app.db import supabase

log = logging.getLogger("centinela.recordatorios")
ABIERTAS = ["abierta", "en_correccion", "en_revision"]
DIAS_PAUSA = 3  # lo que se está corrigiendo no se recuerda durante estos días desde su último cambio


def _fecha(texto):
    return datetime.fromisoformat(texto.replace("Z", "+00:00")) if texto else None


def _item(i, ahora):
    limite = _fecha(i["fecha_limite"])
    dias = (limite - ahora).days if limite else None
    plazo = "" if dias is None else (f"vencida hace {-dias} día{'s' if dias < -1 else ''}" if limite < ahora
                                     else "vence hoy" if dias == 0 else f"vence en {dias} día{'s' if dias > 1 else ''}")
    return {"severidad": i["severidad"], "titulo": i["titulo"] or i["regla_id"],
            "ubicacion": f'{i["archivo"]}:{i["linea_actual"]} · {i["rama"]}' if i["linea_actual"] else f'{i["archivo"]} · {i["rama"]}',
            "plazo": plazo, "vencida": bool(limite and limite < ahora)}


def _registrar(equipo_id, usuario_id, destino, tipo, resultado, asunto=None, resumen=None, detalle=None):
    supabase.table("notificaciones").insert({
        "equipo_id": equipo_id, "usuario_id": usuario_id, "correo": destino, "tipo": tipo,
        "asunto": asunto, "resumen": resumen, "resultado": resultado, "detalle": detalle,
    }).execute()


def _enviar(equipo_id, usuario_id, destino, tipo, mensaje, resumen):
    if not correo.configurado():
        _registrar(equipo_id, usuario_id, destino, tipo, "fallido", mensaje["subject"], resumen, "El envío de correos no está configurado.")
        return "fallidos"
    try:
        correo.enviar(destino, mensaje)
    except correo.CorreoNoEnviado as error:
        log.warning("No se pudo enviar %s a %s: %s", tipo, destino, error)
        _registrar(equipo_id, usuario_id, destino, tipo, "fallido", mensaje["subject"], resumen, str(error)[:300])
        return "fallidos"
    _registrar(equipo_id, usuario_id, destino, tipo, "enviado", mensaje["subject"], resumen)
    return "enviados"


def ejecutar(equipo_id, forzar=False):
    """Envía los recordatorios que tocan hoy. Devuelve cuántos se enviaron, omitieron y fallaron.
    forzar (botón «Enviar ahora»): a todo el que tenga pendientes, sin frecuencia, pausa ni límite diario."""
    ahora = datetime.now(timezone.utc)
    hoy = ahora.replace(hour=0, minute=0, second=0, microsecond=0)
    equipo = supabase.table("equipos").select("*, perfiles!creado_por(nombre, correo)").eq("id", equipo_id).single().execute().data
    colaboradores = (
        supabase.table("miembros_equipo").select("usuario_id, perfiles(nombre, correo)")
        .eq("equipo_id", equipo_id).eq("rol", "colaborador").execute().data
    )
    incidencias = (
        supabase.table("incidencias")
        .select("id, titulo, regla_id, archivo, linea_actual, rama, severidad, estado, fecha_limite, creada_en, "
                "actualizada_en, asignado_a, repositorios!inner(equipo_id)")
        .eq("repositorios.equipo_id", equipo_id).in_("estado", ABIERTAS).limit(2000).execute().data
    )
    registro = (
        supabase.table("notificaciones").select("usuario_id, tipo, resultado, creado_en")
        .eq("equipo_id", equipo_id).gte("creado_en", (ahora - timedelta(days=31)).isoformat()).execute().data
    )
    ultimo_envio, con_registro_hoy = {}, set()
    for n in registro:
        cuando = _fecha(n["creado_en"])
        if cuando >= hoy:
            con_registro_hoy.add((n["usuario_id"], n["tipo"]))
        if n["resultado"] == "enviado":
            clave = (n["usuario_id"], n["tipo"])
            ultimo_envio[clave] = max(cuando, ultimo_envio.get(clave, cuando))

    frecuencia = {"alto": equipo["frecuencia_alta_dias"], "medio": equipo["frecuencia_media_dias"], "bajo": equipo["frecuencia_baja_dias"]}
    resultado = {"enviados": 0, "omitidos": 0, "fallidos": 0}

    for c in colaboradores:
        uid, persona = c["usuario_id"], c["perfiles"] or {}
        mias = [i for i in incidencias if i["asignado_a"] == uid and i["estado"] != "en_revision"]
        if not mias:
            if forzar:  # a mano sí se explica por qué no le llegó nada
                _registrar(equipo_id, uid, persona.get("correo"), "recordatorio", "omitido",
                           detalle="No tiene incidencias asignadas pendientes.")
                resultado["omitidos"] += 1
            continue
        previo = ultimo_envio.get((uid, "recordatorio"))
        dias = (ahora - previo).days if previo else None

        def toca(i):
            f = frecuencia[i["severidad"]]
            pausada = (equipo["pausa_en_correccion"] and i["estado"] == "en_correccion"
                       and _fecha(i["actualizada_en"]) > ahora - timedelta(days=DIAS_PAUSA))
            return bool(f) and not pausada and (dias is None or dias >= f)

        lista = mias if forzar else [i for i in mias if toca(i)] if not (previo and previo >= hoy) else []
        if not lista:
            # Una sola marca de "omitido" al día para no llenar el registro si se pulsa "Enviar ahora" varias veces.
            if (uid, "recordatorio") not in con_registro_hoy:
                motivo = ("Ya recibió un recordatorio hoy." if previo and previo >= hoy
                          else "Nada que recordar hoy: está corrigiendo o aún no toca según la frecuencia.")
                _registrar(equipo_id, uid, persona.get("correo"), "recordatorio", "omitido", detalle=motivo)
                resultado["omitidos"] += 1
            continue
        items = [_item(i, ahora) for i in sorted(lista, key=lambda i: (not _item(i, ahora)["vencida"], i["severidad"] != "alto"))]
        resumen = f"{len(items)} pendientes · {sum(x['vencida'] for x in items)} vencidas"
        mensaje = correo.mensaje_recordatorio(persona.get("nombre") or "", equipo["nombre"], items[:15], f"{ALLOWED_ORIGIN}/mi-trabajo")
        resultado[_enviar(equipo_id, uid, persona.get("correo"), "recordatorio", mensaje, resumen)] += 1

    # Escalamiento: vencidas, sin atender hace mucho, o estancadas en corrección.
    admin = equipo["perfiles"] or {}
    criticas = [i for i in incidencias if i["estado"] != "en_revision" and (
        (i["fecha_limite"] and _fecha(i["fecha_limite"]) < ahora)
        or (i["estado"] == "abierta" and _fecha(i["creada_en"]) < ahora - timedelta(days=equipo["dias_escalamiento"]))
        or (i["estado"] == "en_correccion" and _fecha(i["actualizada_en"]) < ahora - timedelta(days=equipo["dias_estancada_admin"]))
    )]
    if criticas and admin.get("correo") and (forzar or (None, "escalamiento") not in con_registro_hoy):
        items = [_item(i, ahora) for i in criticas]
        mensaje = correo.mensaje_escalamiento(equipo["nombre"], items[:20], f"{ALLOWED_ORIGIN}/admin/equipos/{equipo_id}")
        resultado[_enviar(equipo_id, None, admin["correo"], "escalamiento", mensaje, f"{len(items)} incidencias")] += 1
    return resultado
