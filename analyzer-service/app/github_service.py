import re

import httpx
from fastapi import HTTPException

from app.config import GITHUB_TOKEN

# Solo owner/repo con los caracteres que GitHub permite: evita inyectar argumentos en git.
PATRON_URL = re.compile(r"^https?://(?:www\.)?github\.com/([\w.-]+)/([\w.-]+?)(?:\.git)?/?$")
# GitHub informa el tamaño con todo el historial; el clon (--depth 1) pesa mucho menos.
TAMANO_MAXIMO_KB = 500_000  # 500 MB
CABECERAS = {"Accept": "application/vnd.github+json"}
if GITHUB_TOKEN:
    CABECERAS["Authorization"] = f"Bearer {GITHUB_TOKEN}"
LENGUAJES_SOPORTADOS = {"Python", "JavaScript", "TypeScript"}  # Bandit: Python. Semgrep: JS/TS, React y Django.


def parsear_url(url):
    coincidencia = PATRON_URL.match(url.strip())
    if not coincidencia:
        raise HTTPException(422, "La URL debe ser de un repositorio de GitHub: https://github.com/usuario/repositorio")
    return coincidencia.group(1), coincidencia.group(2)


def _lenguajes(url):
    try:
        r = httpx.get(url, headers=CABECERAS, timeout=15)
    except httpx.HTTPError:
        raise HTTPException(502, "No se pudo consultar GitHub. Inténtalo de nuevo.")
    if r.status_code != 200:
        raise HTTPException(502, "GitHub no respondió correctamente (puede ser el límite de consultas). Inténtalo más tarde.")
    return r.json()


def obtener_repo(url):
    """Comprueba en la API de GitHub que el repositorio exista, sea público y tenga código analizable."""
    owner, repo = parsear_url(url)
    try:
        r = httpx.get(
            f"https://api.github.com/repos/{owner}/{repo}",
            headers=CABECERAS,
            timeout=15,
        )
    except httpx.HTTPError:
        raise HTTPException(502, "No se pudo consultar GitHub. Inténtalo de nuevo.")
    if r.status_code == 404:
        raise HTTPException(404, "El repositorio no existe o es privado.")
    if r.status_code != 200:
        raise HTTPException(502, "GitHub no respondió correctamente (puede ser el límite de consultas). Inténtalo más tarde.")

    datos = r.json()
    if datos.get("private"):
        raise HTTPException(422, "Solo se pueden analizar repositorios públicos.")
    if datos.get("size", 0) > TAMANO_MAXIMO_KB:
        raise HTTPException(422, "El repositorio es demasiado grande para analizarlo (máximo 500 MB).")
    # Basta con que tenga código de algún lenguaje soportado, aunque el principal sea otro (HTML, CSS...).
    if not LENGUAJES_SOPORTADOS & set(_lenguajes(datos["languages_url"])):
        raise HTTPException(422, "El repositorio no contiene código Python, JavaScript ni TypeScript, que es lo que analiza Centinela.")

    return {
        "nombre": datos["full_name"],
        "url": datos["html_url"],
        "rama": datos["default_branch"],
        "clone_url": f"https://github.com/{datos['full_name']}.git",
    }
