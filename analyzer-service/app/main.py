import logging
from contextlib import asynccontextmanager
from uuid import UUID

from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from app import github_service, llm_service, pipeline
from app.auth import usuario_actual
from app.config import ALLOWED_ORIGIN
from app.db import supabase

logging.basicConfig(level=logging.INFO)
EN_CURSO = ["pendiente", "en_proceso"]
MAX_PREGUNTAS = 30  # por conversación, para acotar el gasto en la IA
HISTORIAL_CHAT = 10


@asynccontextmanager
async def ciclo_de_vida(_app):
    # shortcut: las tareas viven en memoria; si el servicio se reinicia se pierden. Cola persistente si hay varios servidores.
    supabase.table("analisis").update(
        {"estado": "error", "error_mensaje": "El servicio de análisis se reinició antes de terminar."}
    ).in_("estado", EN_CURSO).execute()
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
