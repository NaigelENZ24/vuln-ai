-- =====================================================================
-- Migración 002 · Módulo colaborativo, fase 1: equipos, miembros e invitaciones
-- Solo AGREGA: no borra tablas, columnas, políticas ni datos.
-- Se puede ejecutar más de una vez sin error.
-- Cómo usarla: Supabase > SQL Editor > New query > pegar todo > Run
-- =====================================================================

-- ---------- Tipo nuevo ----------
do $$ begin
  create type rol_equipo as enum ('colaborador', 'observador');
exception when duplicate_object then null; end $$;

-- ---------- Tablas nuevas ----------
create table if not exists equipos (
  id           uuid primary key default gen_random_uuid(),
  nombre       text not null check (length(trim(nombre)) between 1 and 80),
  descripcion  text check (length(descripcion) <= 300),
  creado_por   uuid not null default auth.uid() references perfiles(id),
  creado_en    timestamptz not null default now()
);

create table if not exists miembros_equipo (
  equipo_id       uuid not null references equipos(id) on delete cascade,
  usuario_id      uuid not null references perfiles(id) on delete cascade,
  rol             rol_equipo not null default 'colaborador',
  github_usuario  text check (github_usuario ~ '^[A-Za-z0-9-]{1,39}$'),
  unido_en        timestamptz not null default now(),
  primary key (equipo_id, usuario_id)
);

-- El código de la invitación nunca se guarda: solo su hash SHA-256.
create table if not exists invitaciones (
  id              uuid primary key default gen_random_uuid(),
  equipo_id       uuid not null references equipos(id) on delete cascade,
  correo          text not null check (correo = lower(trim(correo)) and correo like '%_@_%'),
  rol             rol_equipo not null default 'colaborador',
  github_usuario  text check (github_usuario ~ '^[A-Za-z0-9-]{1,39}$'),
  codigo_hash     text not null unique,
  vence_en        timestamptz not null default now() + interval '7 days',
  creada_por      uuid not null default auth.uid() references perfiles(id),
  creada_en       timestamptz not null default now(),
  aceptada_por    uuid references perfiles(id),
  aceptada_en     timestamptz,
  revocada_en     timestamptz
);

-- Una sola invitación pendiente por correo y equipo (reenviar = revocar la anterior y crear otra).
create unique index if not exists invitaciones_pendiente_unica
  on invitaciones (equipo_id, correo) where aceptada_en is null and revocada_en is null;
create index if not exists miembros_equipo_usuario on miembros_equipo (usuario_id);

-- ---------- Columna nueva en una tabla existente ----------
-- Opcional: los repositorios personales quedan con equipo_id vacío y no cambian.
alter table repositorios add column if not exists equipo_id uuid references equipos(id) on delete set null;
create index if not exists repositorios_equipo on repositorios (equipo_id);

-- ---------- Funciones para RLS ----------
-- security definer: leen miembros_equipo sin pasar por su propia RLS (evita la recursión infinita).
create or replace function es_miembro(p_equipo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from miembros_equipo where equipo_id = p_equipo and usuario_id = auth.uid());
$$;

create or replace function es_miembro_analisis(p_analisis uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from analisis a
    join repositorios r on r.id = a.repositorio_id
    join miembros_equipo m on m.equipo_id = r.equipo_id
    where a.id = p_analisis and m.usuario_id = auth.uid()
  );
$$;

create or replace function comparte_equipo(p_usuario uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from miembros_equipo yo
    join miembros_equipo otro on otro.equipo_id = yo.equipo_id
    where yo.usuario_id = auth.uid() and otro.usuario_id = p_usuario
  );
$$;

-- ---------- Invitaciones ----------
-- Solo el administrador. Devuelve el código UNA vez (para armar el enlace /invitacion/<código>).
create or replace function crear_invitacion(
  p_equipo uuid, p_correo text, p_rol rol_equipo default 'colaborador', p_github text default null
) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_correo text := lower(trim(p_correo));
  v_codigo text;
begin
  if not es_administrador() then
    raise exception 'Solo el administrador puede invitar.';
  end if;
  if exists (
    select 1 from miembros_equipo m join perfiles p on p.id = m.usuario_id
    where m.equipo_id = p_equipo and lower(p.correo) = v_correo
  ) then
    raise exception 'Esa persona ya es miembro del equipo.';
  end if;

  update invitaciones set revocada_en = now()
  where equipo_id = p_equipo and correo = v_correo and aceptada_en is null and revocada_en is null;

  v_codigo := encode(gen_random_bytes(24), 'hex');  -- 192 bits: no se puede adivinar
  insert into invitaciones (equipo_id, correo, rol, github_usuario, codigo_hash)
  values (p_equipo, v_correo, p_rol, nullif(trim(p_github), ''), encode(digest(v_codigo, 'sha256'), 'hex'));
  return v_codigo;
end $$;

-- Acepta por código (enlace) o por id (aviso dentro de la app). En ambos casos exige que el
-- correo verificado de la sesión sea el invitado. Cualquier fallo da el MISMO mensaje genérico.
create or replace function aceptar_invitacion(p_codigo text default null, p_id uuid default null)
returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_correo text;
  v_inv invitaciones;
begin
  select lower(email) into v_correo
  from auth.users where id = auth.uid() and email_confirmed_at is not null;

  select * into v_inv from invitaciones
  where (codigo_hash = encode(digest(coalesce(p_codigo, ''), 'sha256'), 'hex') or id = p_id)
    and correo = v_correo
    and aceptada_en is null and revocada_en is null and vence_en > now()
  limit 1
  for update;

  if v_correo is null or v_inv.id is null then
    raise exception 'Esta invitación no es válida o expiró.';
  end if;

  insert into miembros_equipo (equipo_id, usuario_id, rol, github_usuario)
  values (v_inv.equipo_id, auth.uid(), v_inv.rol, v_inv.github_usuario)
  on conflict (equipo_id, usuario_id) do nothing;

  update invitaciones set aceptada_en = now(), aceptada_por = auth.uid() where id = v_inv.id;
  return v_inv.equipo_id;
end $$;

-- Invitaciones pendientes de la persona con sesión (para el aviso al iniciar sesión).
create or replace function mis_invitaciones()
returns table (id uuid, equipo text, rol rol_equipo, vence_en timestamptz)
language sql stable security definer set search_path = public as $$
  select i.id, e.nombre, i.rol, i.vence_en
  from invitaciones i
  join equipos e on e.id = i.equipo_id
  join auth.users u on u.id = auth.uid() and u.email_confirmed_at is not null
  where i.correo = lower(u.email)
    and i.aceptada_en is null and i.revocada_en is null and i.vence_en > now();
$$;

create or replace function rechazar_invitacion(p_id uuid)
returns void
language sql security definer set search_path = public as $$
  update invitaciones i set revocada_en = now()
  from auth.users u
  where i.id = p_id and u.id = auth.uid() and i.correo = lower(u.email)
    and i.aceptada_en is null and i.revocada_en is null;
$$;

-- Solo usuarios con sesión pueden llamar estas funciones.
revoke execute on function es_miembro(uuid), es_miembro_analisis(uuid), comparte_equipo(uuid),
  crear_invitacion(uuid, text, rol_equipo, text), aceptar_invitacion(text, uuid),
  mis_invitaciones(), rechazar_invitacion(uuid)
  from public, anon;
grant execute on function es_miembro(uuid), es_miembro_analisis(uuid), comparte_equipo(uuid),
  crear_invitacion(uuid, text, rol_equipo, text), aceptar_invitacion(text, uuid),
  mis_invitaciones(), rechazar_invitacion(uuid)
  to authenticated;

-- ---------- Row Level Security de las tablas nuevas ----------
alter table equipos         enable row level security;
alter table miembros_equipo enable row level security;
alter table invitaciones    enable row level security;

drop policy if exists "equipos_select" on equipos;
create policy "equipos_select" on equipos for select to authenticated
  using (es_administrador() or es_miembro(id));
drop policy if exists "equipos_admin" on equipos;
create policy "equipos_admin" on equipos for all to authenticated
  using (es_administrador()) with check (es_administrador());

-- Cada quien ve su membresía y la de sus compañeros de equipo; solo el admin la cambia.
drop policy if exists "miembros_select" on miembros_equipo;
create policy "miembros_select" on miembros_equipo for select to authenticated
  using (usuario_id = auth.uid() or es_administrador() or es_miembro(equipo_id));
drop policy if exists "miembros_admin" on miembros_equipo;
create policy "miembros_admin" on miembros_equipo for all to authenticated
  using (es_administrador()) with check (es_administrador());

-- Las invitaciones solo las ve el admin; el invitado usa las funciones de arriba.
drop policy if exists "invitaciones_admin" on invitaciones;
create policy "invitaciones_admin" on invitaciones for all to authenticated
  using (es_administrador()) with check (es_administrador());

-- ---------- Políticas ADICIONALES en tablas existentes ----------
-- Postgres combina con OR las políticas de un mismo comando: estas amplían el acceso a los
-- miembros del equipo y las políticas actuales (dueño o admin) siguen intactas.
drop policy if exists "repos_select_equipo" on repositorios;
create policy "repos_select_equipo" on repositorios for select to authenticated
  using (equipo_id is not null and es_miembro(equipo_id));

drop policy if exists "analisis_select_equipo" on analisis;
create policy "analisis_select_equipo" on analisis for select to authenticated
  using (es_miembro_analisis(id));

drop policy if exists "hallazgos_select_equipo" on hallazgos;
create policy "hallazgos_select_equipo" on hallazgos for select to authenticated
  using (es_miembro_analisis(analisis_id));

-- Ver nombre y correo de los compañeros de equipo (autores de comentarios, responsables).
drop policy if exists "perfiles_select_equipo" on perfiles;
create policy "perfiles_select_equipo" on perfiles for select to authenticated
  using (comparte_equipo(id));

-- =====================================================================
-- Comprobación (ejecutar aparte después del Run; debe listar 3 tablas y 7 funciones):
--   select table_name from information_schema.tables
--   where table_schema = 'public' and table_name in ('equipos', 'miembros_equipo', 'invitaciones');
--   select routine_name from information_schema.routines
--   where routine_schema = 'public' and routine_name in ('es_miembro', 'es_miembro_analisis',
--     'comparte_equipo', 'crear_invitacion', 'aceptar_invitacion', 'mis_invitaciones', 'rechazar_invitacion');
-- =====================================================================
