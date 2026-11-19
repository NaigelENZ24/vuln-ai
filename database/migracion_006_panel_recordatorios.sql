-- =====================================================================
-- Migración 006 · Fase 3: panel del equipo (puntaje, tendencia, semáforo de fusión, carga)
--                 y recordatorios por correo (reglas y registro de envíos)
-- Solo AGREGA. Se puede ejecutar más de una vez. Requiere 002 a 005.
-- Cómo usarla: Supabase > SQL Editor > New query > pegar todo > Run
-- =====================================================================

-- ---------- Reglas de recordatorio y de carga (por equipo) ----------
alter table equipos add column if not exists recordatorios_activos boolean not null default true;
alter table equipos add column if not exists hora_recordatorios smallint not null default 8 check (hora_recordatorios between 0 and 23);
alter table equipos add column if not exists frecuencia_alta_dias smallint default 2 check (frecuencia_alta_dias between 1 and 30);
alter table equipos add column if not exists frecuencia_media_dias smallint default 7 check (frecuencia_media_dias between 1 and 30);
alter table equipos add column if not exists frecuencia_baja_dias smallint check (frecuencia_baja_dias between 1 and 30); -- null = nunca
alter table equipos add column if not exists pausa_en_correccion boolean not null default true;
alter table equipos add column if not exists dias_estancada smallint not null default 5 check (dias_estancada between 1 and 60);
alter table equipos add column if not exists dias_estancada_admin smallint not null default 8 check (dias_estancada_admin between 1 and 60);
alter table equipos add column if not exists dias_escalamiento smallint not null default 14 check (dias_escalamiento between 1 and 90);

-- ---------- Quién corrigió (usuarios de GitHub de los commits entre dos análisis) ----------
alter table incidencias add column if not exists corregida_por text;

-- ---------- Foto diaria para la tendencia del puntaje ----------
create table if not exists metricas_diarias (
  equipo_id      uuid not null references equipos(id) on delete cascade,
  fecha          date not null,
  abiertas_alta  integer not null,
  abiertas_media integer not null,
  abiertas_baja  integer not null,
  en_correccion  integer not null,
  vencidas       integer not null,
  resueltas_30d  integer not null,
  puntaje        smallint not null,
  primary key (equipo_id, fecha)
);

-- ---------- Registro de correos (recordatorios y escalamientos) ----------
create table if not exists notificaciones (
  id          uuid primary key default gen_random_uuid(),
  equipo_id   uuid not null references equipos(id) on delete cascade,
  usuario_id  uuid references perfiles(id) on delete set null,
  correo      text,
  tipo        text not null,      -- recordatorio · escalamiento
  asunto      text,
  resumen     text,               -- solo conteos, nunca código
  resultado   text not null check (resultado in ('enviado', 'omitido', 'fallido')),
  detalle     text,
  creado_en   timestamptz not null default now()
);
create index if not exists notificaciones_equipo on notificaciones (equipo_id, creado_en desc);
create index if not exists notificaciones_usuario on notificaciones (usuario_id, creado_en desc);

-- ---------- Métricas del equipo (una sola fórmula para la pantalla y la foto diaria) ----------
-- puntaje = max(0, 100 − (10 × altas + 4 × medias + 1 × bajas + 5 × vencidas)), sobre lo que sigue abierto.
create or replace function _metricas(p_equipo uuid)
returns table (abiertas_alta integer, abiertas_media integer, abiertas_baja integer, en_correccion integer,
               en_revision integer, vencidas integer, resueltas_30d integer, tiempo_medio_dias numeric,
               en_plazo_pct integer, puntaje smallint)
language sql stable security definer set search_path = public as $$
  with i as (
    select x.* from incidencias x join repositorios r on r.id = x.repositorio_id where r.equipo_id = p_equipo
  ),
  ab as (select * from i where estado in ('abierta', 'en_correccion', 'en_revision')),
  res as (select * from i where estado = 'resuelta' and resuelta_en >= now() - interval '30 days'),
  c as (
    select
      (select count(*) from ab where severidad = 'alto')::int as alta,
      (select count(*) from ab where severidad = 'medio')::int as media,
      (select count(*) from ab where severidad = 'bajo')::int as baja,
      (select count(*) from ab where fecha_limite < now())::int as venc
  )
  select c.alta, c.media, c.baja,
    (select count(*) from ab where estado = 'en_correccion')::int,
    (select count(*) from ab where estado = 'en_revision')::int,
    c.venc,
    (select count(*) from res)::int,
    (select round(avg(extract(epoch from resuelta_en - creada_en)) / 86400, 1) from res),
    (select case when count(*) = 0 then null
            else round(100.0 * count(*) filter (where resuelta_en <= fecha_limite) / count(*))::int end from res),
    greatest(0, 100 - (10 * c.alta + 4 * c.media + c.baja + 5 * c.venc))::smallint
  from c;
$$;

create or replace function metricas_equipo(p_equipo uuid)
returns table (abiertas_alta integer, abiertas_media integer, abiertas_baja integer, en_correccion integer,
               en_revision integer, vencidas integer, resueltas_30d integer, tiempo_medio_dias numeric,
               en_plazo_pct integer, puntaje smallint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (es_administrador() or es_miembro(p_equipo)) then
    raise exception 'No tienes acceso a este equipo.';
  end if;
  return query select * from _metricas(p_equipo);
end $$;

-- Foto del día de un equipo (o de todos con p_equipo null). Solo la llama el servicio.
create or replace function registrar_metricas(p_equipo uuid default null)
returns void
language sql security definer set search_path = public as $$
  insert into metricas_diarias (equipo_id, fecha, abiertas_alta, abiertas_media, abiertas_baja, en_correccion,
                                vencidas, resueltas_30d, puntaje)
  select e.id, current_date, m.abiertas_alta, m.abiertas_media, m.abiertas_baja, m.en_correccion,
         m.vencidas, m.resueltas_30d, m.puntaje
  from equipos e cross join lateral _metricas(e.id) m
  where p_equipo is null or e.id = p_equipo
  on conflict (equipo_id, fecha) do update set
    abiertas_alta = excluded.abiertas_alta, abiertas_media = excluded.abiertas_media,
    abiertas_baja = excluded.abiertas_baja, en_correccion = excluded.en_correccion,
    vencidas = excluded.vencidas, resueltas_30d = excluded.resueltas_30d, puntaje = excluded.puntaje;
$$;

-- ---------- Semáforo de fusión: cada rama frente a la principal de su repositorio, por huella ----------
create or replace function semaforo_ramas(p_equipo uuid)
returns table (rama_vigilada_id uuid, nuevas_alta integer, nuevas_media integer, nuevas_baja integer, corregidas integer)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (es_administrador() or es_miembro(p_equipo)) then
    raise exception 'No tienes acceso a este equipo.';
  end if;
  return query
  with ramas as (
    select v.id, v.repositorio_id, v.rama, p.rama as principal
    from ramas_vigiladas v
    join repositorios r on r.id = v.repositorio_id and r.equipo_id = p_equipo
    join ramas_vigiladas p on p.repositorio_id = v.repositorio_id and p.es_principal
    where not v.es_principal and v.ultimo_sha is not null and p.ultimo_sha is not null
  ),
  abiertas as (
    select repositorio_id, rama, huella, severidad from incidencias
    where estado in ('abierta', 'en_correccion', 'en_revision')
  )
  select r.id,
    (select count(*) from abiertas a where a.repositorio_id = r.repositorio_id and a.rama = r.rama and a.severidad = 'alto'
       and not exists (select 1 from abiertas m where m.repositorio_id = r.repositorio_id and m.rama = r.principal and m.huella = a.huella))::int,
    (select count(*) from abiertas a where a.repositorio_id = r.repositorio_id and a.rama = r.rama and a.severidad = 'medio'
       and not exists (select 1 from abiertas m where m.repositorio_id = r.repositorio_id and m.rama = r.principal and m.huella = a.huella))::int,
    (select count(*) from abiertas a where a.repositorio_id = r.repositorio_id and a.rama = r.rama and a.severidad = 'bajo'
       and not exists (select 1 from abiertas m where m.repositorio_id = r.repositorio_id and m.rama = r.principal and m.huella = a.huella))::int,
    (select count(*) from abiertas m where m.repositorio_id = r.repositorio_id and m.rama = r.principal
       and not exists (select 1 from abiertas a where a.repositorio_id = r.repositorio_id and a.rama = r.rama and a.huella = m.huella))::int
  from ramas r;
end $$;

-- ---------- Última actividad de cada persona en el equipo (eventos y comentarios) ----------
create or replace function actividad_equipo(p_equipo uuid)
returns table (usuario_id uuid, ultima timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not es_administrador() then
    raise exception 'Solo el administrador ve la actividad del equipo.';
  end if;
  return query
  select x.usuario_id, max(x.cuando) from (
    select e.actor_id as usuario_id, e.creado_en as cuando
    from incidencia_eventos e join incidencias i on i.id = e.incidencia_id
    join repositorios r on r.id = i.repositorio_id where r.equipo_id = p_equipo and e.actor_id is not null
    union all
    select c.autor_id, c.creado_en
    from comentarios c join incidencias i on i.id = c.incidencia_id
    join repositorios r on r.id = i.repositorio_id where r.equipo_id = p_equipo
  ) x group by x.usuario_id;
end $$;

revoke execute on function _metricas(uuid), registrar_metricas(uuid) from public, anon, authenticated;
grant execute on function registrar_metricas(uuid) to service_role;
revoke execute on function metricas_equipo(uuid), semaforo_ramas(uuid), actividad_equipo(uuid) from public, anon;
grant execute on function metricas_equipo(uuid), semaforo_ramas(uuid), actividad_equipo(uuid) to authenticated;

-- ---------- RLS ----------
alter table metricas_diarias enable row level security;
alter table notificaciones   enable row level security;

drop policy if exists "metricas_select" on metricas_diarias;
create policy "metricas_select" on metricas_diarias for select to authenticated
  using (es_administrador() or es_miembro(equipo_id));

-- El registro lo ve el administrador; cada persona ve los avisos que recibió. Lo escribe el servicio.
drop policy if exists "notificaciones_select" on notificaciones;
create policy "notificaciones_select" on notificaciones for select to authenticated
  using (es_administrador() or usuario_id = auth.uid());
