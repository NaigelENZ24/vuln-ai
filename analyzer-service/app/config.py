import os

from dotenv import load_dotenv

load_dotenv()


def _requerida(nombre):
    valor = os.getenv(nombre)
    if not valor:
        raise RuntimeError(f"Falta la variable {nombre} en analyzer-service/.env")
    return valor


SUPABASE_URL = _requerida("SUPABASE_URL")
SUPABASE_SERVICE_KEY = _requerida("SUPABASE_SERVICE_KEY")
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "anthropic")
LLM_API_KEY = _requerida("LLM_API_KEY")
LLM_MODEL = os.getenv("LLM_MODEL", "claude-opus-5-5")
ALLOWED_ORIGIN = os.getenv("ALLOWED_ORIGIN", "http://localhost:5173")
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")  # opcional: sin él, GitHub permite 60 consultas por hora
