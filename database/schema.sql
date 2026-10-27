-- =====================================================================
-- Aplicativo web con IA para identificación de vulnerabilidades
-- Esquema para Supabase (PostgreSQL)
-- Cómo usarlo: Supabase > SQL Editor > New query > pegar todo > Run
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Tipos enumerados ----------
create type rol_usuario     as enum ('desarrollador', 'administrador');
create type estado_analisis as enum ('pendiente', 'en_proceso', 'completado', 'error');
create type nivel           as enum ('bajo', 'medio', 'alto');   -- severidad, confianza y prioridad
create type estado_hallazgo as enum ('abierto', 'en_revision', 'resuelto', 'descartado');
create type autor_mensaje   as enum ('usuario', 'ia');

-- ---------- Tablas ----------

-- Extiende auth.users (las credenciales las maneja Supabase Auth)
create table perfiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  nombre     text not null,
  correo     text not null unique,
  rol        rol_usuario not null default 'desarrollador',
  creado_en  timestamptz not null default now()
);

create table repositorios (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null references perfiles(id) on delete cascade,
  url         text not null,
  nombre      text not null,
  rama        text not null default 'main',
  es_publico  boolean not null default true,
  creado_en   timestamptz not null default now(),
  unique (usuario_id, url)
);

create table analisis (
  id              uuid primary key default gen_random_uuid(),
  repositorio_id  uuid not null references repositorios(id) on delete cascade,
  solicitado_por  uuid not null references perfiles(id),
  consulta_nl     text,                 -- lo que el usuario pidió en lenguaje natural
  alcance         text,                 -- módulo o archivo objetivo (opcional)
  commit_sha      text,
  version_bandit  text,
  modelo_llm      text,
  estado          estado_analisis not null default 'pendiente',
  resumen_ia      text,
  iniciado_en     timestamptz not null default now(),
  finalizado_en   timestamptz
);

create table hallazgos (
  id                uuid primary key default gen_random_uuid(),
  analisis_id       uuid not null references analisis(id) on delete cascade,
  regla_id          text not null,      -- id de la regla de Bandit
  cwe_id            text,               -- por ejemplo CWE-78
  archivo           text not null,
  linea             integer,
  fragmento_codigo  text,
  severidad         nivel not null,     -- la reporta Bandit
  confianza         nivel not null,     -- la reporta Bandit
  prioridad         nivel not null,     -- la asigna el sistema
  explicacion_ia    text,
  recomendacion_ia  text,
  estado            estado_hallazgo not null default 'abierto'
);

create table conversaciones (
  id           uuid primary key default gen_random_uuid(),
  analisis_id  uuid not null references analisis(id) on delete cascade,
  usuario_id   uuid not null references perfiles(id) on delete cascade,
  creado_en    timestamptz not null default now()
);

create table mensajes (
  id               uuid primary key default gen_random_uuid(),
  conversacion_id  uuid not null references conversaciones(id) on delete cascade,
  hallazgo_id      uuid references hallazgos(id) on delete set null,  -- opcional
  autor            autor_mensaje not null,
  contenido        text not null,
  creado_en        timestamptz not null default now()
);

-- Para la validación del objetivo específico 4 (evaluación del sistema)
create table validaciones (
  id                     uuid primary key default gen_random_uuid(),
  hallazgo_id            uuid not null references hallazgos(id) on delete cascade,
  revisor                text not null,
  es_verdadero_positivo  boolean,
  puntaje_coherencia     smallint check (puntaje_coherencia between 1 and 5),
  puntaje_utilidad       smallint check (puntaje_utilidad between 1 and 5),
  observacion            text,
  creado_en              timestamptz not null default now()
);

-- ---------- Índices ----------
create index on repositorios (usuario_id);
create index on analisis (repositorio_id);
create index on hallazgos (analisis_id);
create index on conversaciones (analisis_id);
create index on mensajes (conversacion_id);
create index on validaciones (hallazgo_id);

-- ---------- Perfil automático al registrarse ----------
create or replace function crear_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into perfiles (id, nombre, correo)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1)),
    new.email
  );
  return new;
end;
$$;

create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function crear_perfil();

-- ---------- Funciones auxiliares para RLS ----------
create or replace function es_administrador()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfiles where id = auth.uid() and rol = 'administrador');
$$;

create or replace function es_dueno_analisis(p_analisis uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from analisis a
    join repositorios r on r.id = a.repositorio_id
    where a.id = p_analisis and r.usuario_id = auth.uid()
  );
$$;

-- ---------- Row Level Security ----------
-- Nota: el microservicio FastAPI escribe con la clave service_role, que se salta
-- RLS. Por eso analisis, hallazgos y mensajes no tienen política de insert para
-- el usuario final: solo el backend los crea.

alter table perfiles       enable row level security;
alter table repositorios   enable row level security;
alter table analisis       enable row level security;
alter table hallazgos      enable row level security;
alter table conversaciones enable row level security;
alter table mensajes       enable row level security;
alter table validaciones   enable row level security;

-- perfiles: cada quien ve el suyo; el administrador ve todos.
-- Sin política de update a propósito, para que nadie pueda cambiarse el rol.
create policy "perfiles_select" on perfiles for select to authenticated
  using (id = auth.uid() or es_administrador());

-- repositorios
create policy "repos_select" on repositorios for select to authenticated
  using (usuario_id = auth.uid() or es_administrador());
create policy "repos_insert" on repositorios for insert to authenticated
  with check (usuario_id = auth.uid());
create policy "repos_delete" on repositorios for delete to authenticated
  using (usuario_id = auth.uid());

-- analisis (solo lectura para el usuario)
create policy "analisis_select" on analisis for select to authenticated
  using (es_dueno_analisis(id) or es_administrador());

-- hallazgos: lectura, y el dueño solo puede cambiar el estado
create policy "hallazgos_select" on hallazgos for select to authenticated
  using (es_dueno_analisis(analisis_id) or es_administrador());
create policy "hallazgos_update" on hallazgos for update to authenticated
  using (es_dueno_analisis(analisis_id))
  with check (es_dueno_analisis(analisis_id));
revoke update on hallazgos from authenticated;
grant  update (estado) on hallazgos to authenticated;

-- conversaciones
create policy "conv_select" on conversaciones for select to authenticated
  using (usuario_id = auth.uid() or es_administrador());
create policy "conv_insert" on conversaciones for insert to authenticated
  with check (usuario_id = auth.uid() and es_dueno_analisis(analisis_id));

-- mensajes (los escribe el backend)
create policy "mensajes_select" on mensajes for select to authenticated
  using (
    exists (
      select 1 from conversaciones c
      where c.id = conversacion_id
        and (c.usuario_id = auth.uid() or es_administrador())
    )
  );

-- validaciones: solo el administrador
create policy "validaciones_admin" on validaciones for all to authenticated
  using (es_administrador()) with check (es_administrador());

-- =====================================================================
-- Después de registrar tu primer usuario desde la app, conviértelo en
-- administrador ejecutando (cambia el correo):
--   update perfiles set rol = 'administrador' where correo = 'tu_correo@unemi.edu.ec';
-- =====================================================================
