import hashlib
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from uuid import UUID

from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from app import asistente, correo, github_service, llm_service, pipeline, programador, recordatorios
from app.auth import usuario_actual
from app.config import ALLOWED_ORIGIN
from app.db import supabase

logging.basicConfig(level=logging.INFO)
EN_CURSO = ["pendiente", "en_proceso"]
MAX_PREGUNTAS = 30  # por conversación, para acotar el gasto en la IA
HISTORIAL_CHAT = 10
MAX_ASISTENTE_DIA = 20  # preguntas al asistente del equipo por día: cada una gasta una petición a la IA


@asynccontextmanager
async def ciclo_de_vida(_app):
    # shortcut: las tareas viven en memoria; si el servicio se reinicia se pierden. Cola persistente si hay varios servidores.
    supabase.table("analisis").update(
        {"estado": "error", "error_mensaje": "El servicio de análisis se reinició antes de terminar."}
    ).in_("estado", EN_CURSO).execute()
    programador.iniciar()  # métricas, análisis diario de ramas con cambios y recordatorios
    yield


app = FastAPI(title="Centinela - servicio de análisis", lifespan=ciclo_de_vida)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[ALLOWED_ORIGIN],
    allow_methods=["POST"],
    allow_headers=["Authorization", "Content-Type"],
)


class SolicitudAnalisis(BaseModel):
    repo_url: str = Field(max_length=300)


class SolicitudChat(BaseModel):
    analisis_id: UUID
    pregunta: str = Field(min_length=1, max_length=1000)


class RepoEquipo(BaseModel):
    repo_url: str = Field(max_length=300)
    ramas: list[str] = Field(default_factory=list, max_length=10)  # además de la principal


class PreguntaEquipo(BaseModel):
    pregunta: str = Field(min_length=1, max_length=1000)


class EnvioInvitacion(BaseModel):
    equipo_id: UUID
    codigo: str = Field(pattern=r"^[0-9a-f]{48}$")  # el que devuelve crear_invitacion en la base


@app.get("/health")
def salud():
    return {"ok": True}


@app.post("/analyses", status_code=201)
def crear_analisis(datos: SolicitudAnalisis, tareas: BackgroundTasks, usuario_id: str = Depends(usuario_actual)):
    repo = github_service.obtener_repo(datos.repo_url)

    repos_usuario = supabase.table("repositorios").select("id").eq("usuario_id", usuario_id).execute().data
    if repos_usuario:
        activos = (
            supabase.table("analisis").select("id")
            .in_("repositorio_id", [r["id"] for r in repos_usuario])
            .in_("estado", EN_CURSO).limit(1).execute().data
        )
        if activos:
            raise HTTPException(409, "Ya tienes un análisis en curso. Espera a que termine.")

    fila_repo = (
        supabase.table("repositorios")
        .upsert(
            {"usuario_id": usuario_id, "url": repo["url"], "nombre": repo["nombre"], "rama": repo["rama"]},
            on_conflict="usuario_id,url",
        )
        .execute().data[0]
    )
    analisis = (
        supabase.table("analisis")
        .insert({"repositorio_id": fila_repo["id"], "solicitado_por": usuario_id})
        .execute().data[0]
    )
    tareas.add_task(pipeline.ejecutar, analisis["id"], repo["clone_url"], repo["rama"])
    return {"id": analisis["id"]}


def _es_admin(usuario_id):
    perfil = supabase.table("perfiles").select("rol").eq("id", usuario_id).maybe_single().execute()
    return bool(perfil and perfil.data and perfil.data["rol"] == "administrador")


@app.post("/equipos/{equipo_id}/repositorios", status_code=201)
def vincular_repositorio(equipo_id: UUID, datos: RepoEquipo, usuario_id: str = Depends(usuario_actual)):
    """Vincula un repositorio público a un equipo y deja vigiladas su rama principal y las ramas elegidas."""
    if not _es_admin(usuario_id):
        raise HTTPException(403, "Solo el administrador puede vincular repositorios.")
    equipo = supabase.table("equipos").select("id").eq("id", str(equipo_id)).maybe_single().execute()
    if not equipo or not equipo.data:
        raise HTTPException(404, "No existe ese equipo.")

    repo = github_service.obtener_repo(datos.repo_url)
    owner, nombre = github_service.parsear_url(repo["url"])
    ramas = list(dict.fromkeys([repo["rama"], *(r.strip() for r in datos.ramas if r.strip())]))
    for rama in ramas[1:]:
        github_service.validar_rama(owner, nombre, rama)

    previo = (
        supabase.table("repositorios").select("equipo_id")
        .eq("usuario_id", usuario_id).eq("url", repo["url"]).limit(1).execute().data
    )
    if previo and previo[0]["equipo_id"] not in (None, str(equipo_id)):
        raise HTTPException(409, "Ese repositorio ya está vinculado a otro equipo.")
    fila = (
        supabase.table("repositorios")
        .upsert({"usuario_id": usuario_id, "url": repo["url"], "nombre": repo["nombre"], "rama": repo["rama"],
                 "equipo_id": str(equipo_id)}, on_conflict="usuario_id,url")
        .execute().data[0]
    )
    supabase.table("ramas_vigiladas").upsert(
        [{"repositorio_id": fila["id"], "rama": r, "es_principal": r == repo["rama"]} for r in ramas],
        on_conflict="repositorio_id,rama",
    ).execute()
    return {"repositorio_id": fila["id"], "ramas": ramas}


def _puede_analizar(usuario_id, vigilada, equipo_id):
    """Admin; o colaborador en su rama de trabajo (la principal si no tiene otra) o donde tenga algo que verificar."""
    if _es_admin(usuario_id):
        return True
    if not (supabase.table("miembros_equipo").select("usuario_id").eq("equipo_id", equipo_id)
            .eq("usuario_id", usuario_id).eq("rol", "colaborador").limit(1).execute().data):
        return False
    elegida = (supabase.table("miembro_ramas").select("rama_vigilada_id").eq("usuario_id", usuario_id)
               .eq("repositorio_id", vigilada["repositorio_id"]).limit(1).execute().data)
    if (elegida[0]["rama_vigilada_id"] == vigilada["id"]) if elegida else vigilada["es_principal"]:
        return True
    return bool(
        supabase.table("incidencias").select("id").eq("asignado_a", usuario_id)
        .eq("repositorio_id", vigilada["repositorio_id"]).eq("rama", vigilada["rama"])
        .in_("estado", ["abierta", "en_correccion", "en_revision"]).limit(1).execute().data
    )


@app.post("/ramas/{rama_id}/analizar")
def analizar_rama(rama_id: UUID, tareas: BackgroundTasks, usuario_id: str = Depends(usuario_actual)):
    """Re-analiza una rama vigilada. Lo puede pedir el administrador o un colaborador del equipo."""
    r = (
        supabase.table("ramas_vigiladas").select(pipeline.CAMPOS_RAMA)
        .eq("id", str(rama_id)).maybe_single().execute()
    )
    vigilada = r.data if r else None
    equipo_id = vigilada and vigilada["repositorios"]["equipo_id"]
    if not equipo_id or not _puede_analizar(usuario_id, vigilada, equipo_id):
        raise HTTPException(404, "No existe esa rama.")

    # Si ya hay uno en curso (dos personas pidieron verificar a la vez), se reutiliza.
    activo = (
        supabase.table("analisis").select("id").eq("rama_vigilada_id", vigilada["id"])
        .in_("estado", EN_CURSO).limit(1).execute().data
    )
    if activo:
        return {"id": activo[0]["id"], "en_curso": True}

    analisis_id, argumentos = pipeline.nuevo_analisis_rama(vigilada, usuario_id)
    tareas.add_task(pipeline.ejecutar, *argumentos)
    return {"id": analisis_id, "en_curso": False}


@app.post("/equipos/{equipo_id}/recordatorios/ejecutar")
def ejecutar_recordatorios(equipo_id: UUID, usuario_id: str = Depends(usuario_actual)):
    """«Enviar recordatorios ahora» (también corren solos cada día a la hora del equipo)."""
    if not _es_admin(usuario_id):
        raise HTTPException(403, "Solo el administrador puede enviar recordatorios.")
    return recordatorios.ejecutar(str(equipo_id), forzar=True)


@app.post("/invitaciones/enviar")
def enviar_invitacion(datos: EnvioInvitacion, usuario_id: str = Depends(usuario_actual)):
    if not correo.configurado():
        raise HTTPException(503, "El envío de correos no está configurado. Copia el enlace y envíalo tú.")
    if not _es_admin(usuario_id):
        raise HTTPException(403, "Solo el administrador puede enviar invitaciones.")

    # Solo se envía a una invitación pendiente de ese equipo: el servicio no sirve para escribir a cualquiera.
    filas = (
        supabase.table("invitaciones").select("correo, rol, equipos(nombre)")
        .eq("equipo_id", str(datos.equipo_id))
        .eq("codigo_hash", hashlib.sha256(datos.codigo.encode()).hexdigest())
        .is_("aceptada_en", "null").is_("revocada_en", "null")
        .gt("vence_en", datetime.now(timezone.utc).isoformat())
        .limit(1).execute().data
    )
    if not filas:
        raise HTTPException(404, "La invitación no existe o ya no está pendiente.")
    inv = filas[0]
    enlace = f"{ALLOWED_ORIGIN}/invitacion/{datos.codigo}"
    try:
        correo.enviar(inv["correo"], correo.mensaje_invitacion(inv["equipos"]["nombre"], inv["rol"], enlace))
    except correo.CorreoNoEnviado:
        logging.exception("No se pudo enviar la invitación a %s", inv["correo"])
        raise HTTPException(502, "No se pudo enviar el correo. Copia el enlace y envíalo tú.")
    return {"enviado_a": inv["correo"]}


@app.post("/equipos/{equipo_id}/asistente")
def asistente_equipo(equipo_id: UUID, datos: PreguntaEquipo, usuario_id: str = Depends(usuario_actual)):
    """Asistente IA del equipo: solo el administrador (compara a las personas)."""
    if not _es_admin(usuario_id):
        raise HTTPException(403, "Solo el administrador puede usar el asistente del equipo.")
    equipo = str(equipo_id)
    hoy = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    preguntas_hoy = (
        supabase.table("chat_equipo").select("id", count="exact").eq("equipo_id", equipo)
        .eq("autor", "usuario").gte("creado_en", hoy).execute().count or 0
    )
    if preguntas_hoy >= MAX_ASISTENTE_DIA:
        raise HTTPException(429, f"Llegaste al límite de {MAX_ASISTENTE_DIA} preguntas de hoy para este equipo.")

    mensajes = (
        supabase.table("chat_equipo").select("autor, contenido").eq("equipo_id", equipo)
        # Pregunta y respuesta se insertan juntas con la misma hora; el enum ordena usuario antes que ia.
        .order("creado_en", desc=True).order("autor", desc=True).limit(HISTORIAL_CHAT).execute().data
    )
    historial = [{"role": "user" if m["autor"] == "usuario" else "assistant", "content": m["contenido"]} for m in reversed(mensajes)]
    pregunta = datos.pregunta.strip()
    try:
        respuesta = llm_service.responder_equipo(asistente.cargar(equipo), historial, pregunta)
    except Exception:
        logging.exception("Falló el asistente del equipo %s", equipo)
        raise HTTPException(502, "La IA no pudo responder. Inténtalo de nuevo.")
    supabase.table("chat_equipo").insert([
        {"equipo_id": equipo, "usuario_id": usuario_id, "autor": "usuario", "contenido": pregunta},
        {"equipo_id": equipo, "autor": "ia", "contenido": respuesta[:6000]},
    ]).execute()
    return {"respuesta": respuesta}


@app.post("/chat")
def chat(datos: SolicitudChat, usuario_id: str = Depends(usuario_actual)):
    analisis_id = str(datos.analisis_id)
    analisis = (
        supabase.table("analisis").select("estado, resumen_ia, repositorios(usuario_id)")
        .eq("id", analisis_id).maybe_single().execute()
    )
    analisis = analisis.data if analisis else None
    if not analisis or analisis["repositorios"]["usuario_id"] != usuario_id:
        raise HTTPException(404, "No existe ese análisis.")
    if analisis["estado"] != "completado":
        raise HTTPException(409, "El chat se habilita cuando el análisis termina.")

    conversaciones = (
        supabase.table("conversaciones").select("id")
        .eq("analisis_id", analisis_id).eq("usuario_id", usuario_id).limit(1).execute().data
    )
    if conversaciones:
        conversacion_id = conversaciones[0]["id"]
    else:
        conversacion_id = (
            supabase.table("conversaciones")
            .insert({"analisis_id": analisis_id, "usuario_id": usuario_id}).execute().data[0]["id"]
        )

    mensajes = (
        supabase.table("mensajes").select("autor, contenido")
        # Pregunta y respuesta se insertan juntas con la misma hora; el enum ordena usuario antes que ia.
        .eq("conversacion_id", conversacion_id).order("creado_en").order("autor").execute().data
    )
    if sum(m["autor"] == "usuario" for m in mensajes) >= MAX_PREGUNTAS:
        raise HTTPException(429, f"Llegaste al límite de {MAX_PREGUNTAS} preguntas para este análisis.")

    # Ordenado en la base (el enum va bajo < medio < alto) para no perder los graves por el tope de filas de Supabase.
    resultado = (
        supabase.table("hallazgos").select("*", count="exact").eq("analisis_id", analisis_id)
        .order("severidad", desc=True).order("confianza", desc=True).limit(llm_service.MAX_INDICE_CHAT).execute()
    )
    hallazgos, total = resultado.data, resultado.count or len(resultado.data)
    historial = [
        {"role": "user" if m["autor"] == "usuario" else "assistant", "content": m["contenido"]}
        for m in mensajes[-HISTORIAL_CHAT:]
    ]
    try:
        respuesta = llm_service.responder_chat(analisis["resumen_ia"], hallazgos, total, historial, datos.pregunta.strip())
    except Exception:
        logging.exception("Falló el chat del análisis %s", analisis_id)
        raise HTTPException(502, "La IA no pudo responder. Inténtalo de nuevo.")

    supabase.table("mensajes").insert([
        {"conversacion_id": conversacion_id, "autor": "usuario", "contenido": datos.pregunta.strip()},
        {"conversacion_id": conversacion_id, "autor": "ia", "contenido": respuesta},
    ]).execute()
    return {"respuesta": respuesta}
