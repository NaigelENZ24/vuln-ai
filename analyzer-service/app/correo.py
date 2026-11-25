from html import escape

import httpx

from app.config import BREVO_API_KEY, CORREO_REMITENTE

API_BREVO = "https://api.brevo.com/v3/smtp/email"


class CorreoNoEnviado(Exception):
    pass


def configurado():
    return bool(BREVO_API_KEY and CORREO_REMITENTE)


def mensaje_invitacion(equipo, rol, enlace):
    """Asunto, texto y HTML de la invitación. Nunca lleva código del repositorio: solo el equipo y el enlace."""
    equipo = " ".join(equipo.split())  # sin saltos de línea en el asunto
    e = escape(equipo)
    return {
        "subject": f"Te invitaron al equipo {equipo} en Centinela",
        "textContent": (
            f"Hola,\n\nTe invitaron al equipo «{equipo}» en Centinela como {rol}.\n\n"
            f"Acepta la invitación aquí (vence en 7 días y solo sirve para este correo):\n{enlace}\n\n"
            "Si no esperabas esta invitación, ignora este correo.\n"
        ),
        "htmlContent": f"""<div style="font-family:system-ui,Segoe UI,Roboto,sans-serif;max-width:520px;color:#1f2328">
  <p style="font-weight:700;color:#1a6b50">Centinela</p>
  <p>Hola,</p>
  <p>Te invitaron al equipo <strong>{e}</strong> como <strong>{escape(rol)}</strong>.</p>
  <p><a href="{escape(enlace)}" style="display:inline-block;padding:12px 20px;background:#1a6b50;color:#ffffff;
     border-radius:8px;text-decoration:none;font-weight:700">Aceptar invitación</a></p>
  <p style="font-size:13px;color:#57606a">El enlace vence en 7 días y solo sirve para este correo.
     Si no esperabas esta invitación, ignora este mensaje.</p>
</div>""",
    }


INTEGRANTES = {"2-4": "2 a 4 personas", "5-10": "5 a 10 personas", "mas-10": "Más de 10 personas"}


def mensaje_solicitud(nombre, correo_solicitante, solicitud, enlace):
    """Aviso al administrador de una solicitud nueva para ser líder de equipo. Todo el texto del usuario va escapado."""
    equipo = " ".join(solicitud["nombre_equipo"].split())
    n = solicitud["equipos_solicitados"]
    datos = [
        ("Solicitante", f"{nombre} ({correo_solicitante})"),
        ("Equipo", equipo),
        ("Integrantes", INTEGRANTES[solicitud["integrantes"]]),
        ("Equipos que necesita", str(n)),
        ("Descripción", solicitud.get("descripcion") or "—"),
    ]
    filas = "".join(f'<tr><td style="padding:4px 12px 4px 0;color:#57606a">{escape(k)}</td><td><strong>{escape(v)}</strong></td></tr>'
                    for k, v in datos)
    return {
        "subject": f"Nueva solicitud de equipo: {equipo}",
        "textContent": "Nueva solicitud para crear equipos en Centinela:\n\n"
                       + "\n".join(f"{k}: {v}" for k, v in datos)
                       + f"\n\nRevísala en el panel: {enlace}\n",
        "htmlContent": f"""<div style="font-family:system-ui,Segoe UI,Roboto,sans-serif;max-width:560px;color:#1f2328">
  <p style="font-weight:700;color:#1a6b50">Centinela</p>
  <p>Hay una solicitud nueva para crear {"un equipo" if n == 1 else f"{n} equipos"} de trabajo:</p>
  <table style="font-size:14px;margin:8px 0 16px">{filas}</table>
  <p><a href="{escape(enlace)}" style="display:inline-block;padding:12px 20px;background:#1a6b50;color:#ffffff;
     border-radius:8px;text-decoration:none;font-weight:700">Revisar solicitud</a></p>
  <p style="font-size:12px;color:#57606a">Si la apruebas, esa persona podrá crear y gestionar solo sus propios equipos.</p>
</div>""",
    }


ETIQUETA = {"alto": ("Alta", "#bc4c00", "#fff1e5"), "medio": ("Media", "#7d4e00", "#fff8c5"), "bajo": ("Baja", "#0550ae", "#ddf4ff")}


def _filas(items):
    """items: {severidad, titulo, ubicacion, plazo, vencida}. Solo texto: nunca código del repositorio."""
    filas = []
    for i in items:
        etiqueta, color, fondo = ETIQUETA[i["severidad"]]
        plazo = f'<span style="color:{"#cf222e" if i["vencida"] else "#57606a"}">{escape(i["plazo"])}</span>' if i["plazo"] else ""
        filas.append(
            f'<div style="padding:10px 12px;border:1px solid #e1e4e8;border-radius:8px;margin:6px 0">'
            f'<span style="font-size:11px;font-weight:700;padding:1px 8px;border-radius:999px;background:{fondo};color:{color}">{etiqueta}</span> '
            f'<strong>{escape(i["titulo"])}</strong><br>'
            f'<span style="font-family:monospace;font-size:12px;color:#57606a">{escape(i["ubicacion"])}</span> {plazo}</div>'
        )
    return "".join(filas)


def _texto(items):
    return "\n".join(f'- [{ETIQUETA[i["severidad"]][0]}] {i["titulo"]} ({i["ubicacion"]}) {i["plazo"]}' for i in items)


def _plantilla(parrafos, items, boton, enlace, pie):
    cuerpo = "".join(f"<p>{p}</p>" for p in parrafos)
    return f"""<div style="font-family:system-ui,Segoe UI,Roboto,sans-serif;max-width:560px;color:#1f2328">
  <p style="font-weight:700;color:#1a6b50">Centinela</p>
  {cuerpo}
  {_filas(items)}
  <p><a href="{escape(enlace)}" style="display:inline-block;padding:12px 20px;background:#1a6b50;color:#ffffff;
     border-radius:8px;text-decoration:none;font-weight:700">{escape(boton)}</a></p>
  <p style="font-size:12px;color:#57606a">{pie}</p>
</div>"""


def mensaje_recordatorio(nombre, equipo, items, enlace):
    """Un solo correo agrupado con lo pendiente de la persona."""
    equipo = " ".join(equipo.split())
    vencidas = sum(i["vencida"] for i in items)
    asunto = (f"Tienes {vencidas} vulnerabilidad{'es' if vencidas > 1 else ''} vencida{'s' if vencidas > 1 else ''} en {equipo}"
              if vencidas else f"Tienes {len(items)} vulnerabilidad{'es' if len(items) > 1 else ''} pendiente{'s' if len(items) > 1 else ''} en {equipo}")
    saludo = f"Hola {escape(nombre)}, esto es lo que tienes pendiente en el equipo <strong>{escape(equipo)}</strong>:"
    pie = ("Por seguridad este correo no incluye código del repositorio. Recibes como máximo un correo al día; "
           "lo que estás corrigiendo no se recuerda durante los primeros días.")
    return {
        "subject": asunto,
        "textContent": f"Hola {nombre},\n\nPendiente en {equipo}:\n{_texto(items)}\n\nAbre tu trabajo: {enlace}\n",
        "htmlContent": _plantilla([saludo], items, "Abrir Mi trabajo", enlace, pie),
    }


def mensaje_escalamiento(equipo, items, enlace):
    """Aviso al administrador de lo vencido, sin atender o estancado."""
    equipo = " ".join(equipo.split())
    asunto = f"{len(items)} incidencia{'s' if len(items) > 1 else ''} necesita{'n' if len(items) > 1 else ''} tu atención en {equipo}"
    parrafo = (f"Estas incidencias del equipo <strong>{escape(equipo)}</strong> están vencidas, llevan mucho tiempo "
               "sin atención o están estancadas en corrección. Considera reasignarlas.")
    return {
        "subject": asunto,
        "textContent": f"{asunto}:\n{_texto(items)}\n\nAbre el equipo: {enlace}\n",
        "htmlContent": _plantilla([parrafo], items, "Abrir el equipo", enlace, "Correo automático de Centinela."),
    }


def enviar(destino, mensaje):
    """Envía con la API de Brevo (plan gratuito). Lanza CorreoNoEnviado si Brevo no lo acepta."""
    try:
        r = httpx.post(
            API_BREVO,
            headers={"api-key": BREVO_API_KEY, "accept": "application/json"},
            json={"sender": {"name": "Centinela", "email": CORREO_REMITENTE}, "to": [{"email": destino}], **mensaje},
            timeout=20,
        )
    except httpx.HTTPError as error:
        raise CorreoNoEnviado(str(error)) from error
    if r.status_code >= 300:
        raise CorreoNoEnviado(f"Brevo respondió {r.status_code}: {r.text[:300]}")
