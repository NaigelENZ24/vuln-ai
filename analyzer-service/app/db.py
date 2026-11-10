from supabase import create_client

from app.config import SUPABASE_SERVICE_KEY, SUPABASE_URL

# Clave service_role: se salta RLS. Solo vive en el backend.
supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
