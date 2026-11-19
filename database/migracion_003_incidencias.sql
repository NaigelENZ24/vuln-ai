-- =====================================================================
-- Migración 003 · Módulo colaborativo, fase 2: ramas vigiladas e incidencias
-- Solo AGREGA: no borra tablas, columnas, políticas ni datos.
-- Se puede ejecutar más de una vez sin error. Requiere la migración 002.
-- Cómo usarla: Supabase > SQL Editor > New query > pegar todo > Run
-- =====================================================================

-- ---------- Tipos nuevos ----------
do $$ begin
  create type estado_incidencia as enum ('abierta', 'en_correccion', 'en_revision', 'resuelta', 'descartada');
exception when duplicate_object then null; end $$;

do $$ begin
  create type motivo_cierre as enum ('verificada', 'archivo_eliminado', 'descartada');
exception when duplicate_object then null; end $$;

-- ---------- Configuración del equipo ----------
alter table equipos add column if not exists limite_en_correccion smallint not null default 3
  check (limite_en_correccion between 1 and 20);

-- ---------- Ramas vigiladas ----------
-- Nombre de rama restringido: se usa como argumento de git en el servicio.
create table if not exists ramas_vigiladas (
  id              uuid primary key default gen_random_uuid(),
  repositorio_id  uuid not null references repositorios(id) on delete cascade,
  rama            text not null check (rama ~ '^[A-Za-z0-9._/-]{1,200}$' and rama !~ '^-' and rama !~ '\.\.'),
  es_principal    boolean not null default false,
  ultimo_sha      text,
  creada_en       timestamptz not null default now(),
  unique (repositorio_id, rama)
);

alter table analisis add column if not exists rama text;
alter table analisis add column if not exists rama_vigilada_id uuid references ramas_vigiladas(id) on delete set null;
create index if not exists analisis_rama_vigilada on analisis (rama_vigilada_id);

-- ---------- Incidencias: el problema que persiste entre análisis ----------
create table if not exists incidencias (
  id                   uuid primary key default gen_random_uuid(),
  repositorio_id       uuid not null references repositorios(id) on delete cascade,
  rama                 text not null,
  huella               text not null,           -- regla + archivo + código normalizado + n.º de aparición
  regla_id             text not null,
  titulo               text,
  categoria            text,
  cwe_id               text,
  archivo              text not null,
  linea_actual         integer,
  fragmento_codigo     text,
  severidad            nivel not null,
  explicacion_ia       text,
  recomendacion_ia     text,
  estado               estado_incidencia not null default 'abierta',
  motivo_cierre        motivo_cierre,
  asignado_a           uuid references perfiles(id) on delete set null,
  sugerido_a           uuid references perfiles(id) on delete set null,
  fecha_limite         timestamptz,
  descarte_solicitado  boolean not null default false,
  motivo_descarte      text,
  veces_reabierta      integer not null default 0,
  primer_analisis_id   uuid references analisis(id) on delete set null,
  ultimo_analisis_id   uuid references analisis(id) on delete set null,
  commit_correccion    text,
  creada_en            timestamptz not null default now(),
  actualizada_en       timestamptz not null default now(),
  resuelta_en          timestamptz,
  unique (repositorio_id, rama, huella)
);
create index if not exists incidencias_asignado on incidencias (asignado_a, estado);
create index if not exists incidencias_huella on incidencias (repositorio_id, huella);

alter table hallazgos add column if not exists huella text;
alter table hallazgos add column if not exists incidencia_id uuid references incidencias(id) on delete set null;
create index if not exists hallazgos_incidencia on hallazgos (incidencia_id);

create table if not exists incidencia_eventos (
  id               uuid primary key default gen_random_uuid(),
  incidencia_id    uuid not null references incidencias(id) on delete cascade,
  actor_id         uuid references perfiles(id) on delete set null,   -- null = el sistema
  tipo             text not null,
  estado_anterior  estado_incidencia,
  estado_nuevo     estado_incidencia,
  nota             text,
  creado_en        timestamptz not null default now()
);
create index if not exists eventos_incidencia on incidencia_eventos (incidencia_id, creado_en);

create table if not exists comentarios (
  id             uuid primary key default gen_random_uuid(),
  incidencia_id  uuid not null references incidencias(id) on delete cascade,
  autor_id       uuid not null default auth.uid() references perfiles(id) on delete cascade,
  texto          text not null check (length(trim(texto)) between 1 and 2000),
  creado_en      timestamptz not null default now()
);
create index if not exists comentarios_incidencia on comentarios (incidencia_id, creado_en);

-- ---------- Funciones auxiliares ----------
create or replace function rol_en_repo(p_repo uuid)
returns rol_equipo language sql stable security definer set search_path = public as $$
  select m.rol from repositorios r
  join miembros_equipo m on m.equipo_id = r.equipo_id
  where r.id = p_repo and m.usuario_id = auth.uid();
$$;

-- ---------- Acciones del colaborador sobre una incidencia ----------
-- tomar · corregir · liberar · verificar · solicitar_descarte. Valida rol, asignación, estado y el
-- límite de incidencias en corrección, y deja el evento en el historial en la misma transacción.
create or replace function cambiar_estado(p_incidencia uuid, p_accion text, p_nota text default null)
returns estado_incidencia
language plpgsql security definer set search_path = public as $$
declare
  v incidencias;
  v_nuevo estado_incidencia;
  v_limite smallint;
  v_en_curso integer;
begin
  select * into v from incidencias where id = p_incidencia for update;
  if v.id is null or rol_en_repo(v.repositorio_id) is distinct from 'colaborador' then
    raise exception 'Solo los colaboradores del equipo pueden hacer esto.';
  end if;
  v_nuevo := v.estado;

  if p_accion in ('tomar', 'corregir') then
    if p_accion = 'tomar' and v.asignado_a is not null then
      raise exception 'Esta incidencia ya tiene responsable.';
    end if;
    if p_accion = 'corregir' and v.asignado_a is distinct from auth.uid() then
      raise exception 'Solo la persona asignada puede hacer esto.';
    end if;
    if v.estado <> 'abierta' then
      raise exception 'Solo se puede empezar a corregir una incidencia abierta.';
    end if;
    select e.limite_en_correccion into v_limite
    from repositorios r join equipos e on e.id = r.equipo_id where r.id = v.repositorio_id;
    select count(*) into v_en_curso from incidencias where asignado_a = auth.uid() and estado = 'en_correccion';
    if v_en_curso >= v_limite then
      raise exception 'Ya tienes % incidencias en corrección. Termina o libera una antes de tomar otra.', v_limite;
    end if;
    v_nuevo := 'en_correccion';
    update incidencias set asignado_a = auth.uid(), estado = v_nuevo, actualizada_en = now() where id = v.id;

  elsif p_accion in ('liberar', 'verificar', 'solicitar_descarte') then
    if v.asignado_a is distinct from auth.uid() then
      raise exception 'Solo la persona asignada puede hacer esto.';
    end if;
    if v.estado not in ('abierta', 'en_correccion') then
      raise exception 'Esta acción no está disponible en el estado actual.';
    end if;
    if p_accion = 'liberar' then
      v_nuevo := 'abierta';
      update incidencias set asignado_a = null, estado = v_nuevo, actualizada_en = now() where id = v.id;
    elsif p_accion = 'verificar' then
      v_nuevo := 'en_revision';
      update incidencias set estado = v_nuevo, actualizada_en = now() where id = v.id;
    else
      if length(trim(coalesce(p_nota, ''))) < 10 then
        raise exception 'Explica en al menos 10 caracteres por qué no es una vulnerabilidad.';
      end if;
      update incidencias set descarte_solicitado = true, motivo_descarte = trim(p_nota), actualizada_en = now()
      where id = v.id;
    end if;

  else
    raise exception 'Acción no válida.';
  end if;

  insert into incidencia_eventos (incidencia_id, actor_id, tipo, estado_anterior, estado_nuevo, nota)
  values (v.id, auth.uid(), p_accion, v.estado, v_nuevo, nullif(trim(coalesce(p_nota, '')), ''));
  return v_nuevo;
end $$;

-- ---------- Acciones del administrador ----------
-- Asignar (o quitar con p_usuario null). Si estaba en corrección por otra persona, vuelve a abierta.
create or replace function asignar_incidencia(p_incidencia uuid, p_usuario uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v incidencias;
  v_nuevo estado_incidencia;
begin
  if not es_administrador() then
    raise exception 'Solo el administrador puede asignar.';
  end if;
  select * into v from incidencias where id = p_incidencia for update;
  if v.id is null then
    raise exception 'No existe esa incidencia.';
  end if;
  if p_usuario is not null and not exists (
    select 1 from repositorios r join miembros_equipo m on m.equipo_id = r.equipo_id
    where r.id = v.repositorio_id and m.usuario_id = p_usuario and m.rol = 'colaborador'
  ) then
    raise exception 'Solo se puede asignar a un colaborador del equipo.';
  end if;
  v_nuevo := case when v.estado = 'en_correccion' and v.asignado_a is distinct from p_usuario then 'abierta' else v.estado end;
  update incidencias set asignado_a = p_usuario, estado = v_nuevo, actualizada_en = now() where id = v.id;
  insert into incidencia_eventos (incidencia_id, actor_id, tipo, estado_anterior, estado_nuevo)
  values (v.id, auth.uid(), case when p_usuario is null then 'desasignada' else 'asignada' end, v.estado, v_nuevo);
end $$;

create or replace function resolver_descarte(p_incidencia uuid, p_aprobar boolean, p_nota text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v incidencias;
begin
  if not es_administrador() then
    raise exception 'Solo el administrador puede resolver un descarte.';
  end if;
  select * into v from incidencias where id = p_incidencia for update;
  if v.id is null or not v.descarte_solicitado then
    raise exception 'Esa incidencia no tiene una solicitud de descarte.';
  end if;
  if p_aprobar then
    update incidencias set estado = 'descartada', motivo_cierre = 'descartada', descarte_solicitado = false,
      resuelta_en = now(), actualizada_en = now() where id = v.id;
  else
    update incidencias set descarte_solicitado = false, actualizada_en = now() where id = v.id;
  end if;
  insert into incidencia_eventos (incidencia_id, actor_id, tipo, estado_anterior, estado_nuevo, nota)
  values (v.id, auth.uid(), case when p_aprobar then 'descarte_aprobado' else 'descarte_rechazado' end,
          v.estado, case when p_aprobar then 'descartada'::estado_incidencia else v.estado end,
          nullif(trim(coalesce(p_nota, '')), ''));
end $$;

revoke execute on function rol_en_repo(uuid), cambiar_estado(uuid, text, text),
  asignar_incidencia(uuid, uuid), resolver_descarte(uuid, boolean, text)
  from public, anon;
grant execute on function rol_en_repo(uuid), cambiar_estado(uuid, text, text),
  asignar_incidencia(uuid, uuid), resolver_descarte(uuid, boolean, text)
  to authenticated;

-- ---------- Row Level Security ----------
-- Las incidencias y eventos los escribe el servicio (clave secreta) o las funciones de arriba:
-- no hay políticas de insert/update para el navegador.
alter table ramas_vigiladas    enable row level security;
alter table incidencias        enable row level security;
alter table incidencia_eventos enable row level security;
alter table comentarios        enable row level security;

drop policy if exists "ramas_select" on ramas_vigiladas;
create policy "ramas_select" on ramas_vigiladas for select to authenticated
  using (es_administrador() or rol_en_repo(repositorio_id) is not null);
drop policy if exists "ramas_admin" on ramas_vigiladas;
create policy "ramas_admin" on ramas_vigiladas for all to authenticated
  using (es_administrador()) with check (es_administrador());

drop policy if exists "incidencias_select" on incidencias;
create policy "incidencias_select" on incidencias for select to authenticated
  using (es_administrador() or rol_en_repo(repositorio_id) is not null);

-- La subconsulta pasa por la RLS de incidencias: solo ve eventos de incidencias visibles.
drop policy if exists "eventos_select" on incidencia_eventos;
create policy "eventos_select" on incidencia_eventos for select to authenticated
  using (exists (select 1 from incidencias i where i.id = incidencia_id));

drop policy if exists "comentarios_select" on comentarios;
create policy "comentarios_select" on comentarios for select to authenticated
  using (exists (select 1 from incidencias i where i.id = incidencia_id));
-- Comentan el administrador y los colaboradores; el observador solo lee.
drop policy if exists "comentarios_insert" on comentarios;
create policy "comentarios_insert" on comentarios for insert to authenticated
  with check (
    autor_id = auth.uid()
    and exists (
      select 1 from incidencias i where i.id = incidencia_id
        and (es_administrador() or rol_en_repo(i.repositorio_id) = 'colaborador')
    )
  );

-- =====================================================================
-- Comprobación (ejecutar aparte; debe listar 4 tablas):
--   select table_name from information_schema.tables where table_schema = 'public'
--   and table_name in ('ramas_vigiladas', 'incidencias', 'incidencia_eventos', 'comentarios');
-- =====================================================================
