-- =====================================================================
-- Migración 008 · Asistente IA del equipo (solo administrador)
-- Guarda la conversación del administrador con la IA sobre su equipo.
-- Solo agrega. Se puede ejecutar más de una vez. Requiere 002 a 007.
-- Cómo usarla: Supabase > SQL Editor > New query > pegar todo > Run
-- =====================================================================

create table if not exists chat_equipo (
  id          uuid primary key default gen_random_uuid(),
  equipo_id   uuid not null references equipos(id) on delete cascade,
  usuario_id  uuid references perfiles(id) on delete set null,   -- quién preguntó (null en las respuestas)
  autor       autor_mensaje not null,                             -- usuario · ia
  contenido   text not null check (length(contenido) between 1 and 6000),
  creado_en   timestamptz not null default now()
);
create index if not exists chat_equipo_equipo on chat_equipo (equipo_id, creado_en);

-- Lo escribe el servicio (clave secreta); el navegador solo lee, y solo el administrador.
alter table chat_equipo enable row level security;
drop policy if exists "chat_equipo_admin" on chat_equipo;
create policy "chat_equipo_admin" on chat_equipo for select to authenticated
  using (es_administrador());
