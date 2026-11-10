from fastapi import Header, HTTPException

from app.db import supabase


def usuario_actual(authorization: str = Header(default="")):
    """Valida el token de Supabase que envía el frontend y devuelve el id del usuario."""
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(401, "Debes iniciar sesión.")
    try:
        respuesta = supabase.auth.get_user(token)
    except Exception:
        raise HTTPException(401, "La sesión no es válida o expiró.")
    if not respuesta or not respuesta.user:
        raise HTTPException(401, "La sesión no es válida o expiró.")
    return respuesta.user.id
