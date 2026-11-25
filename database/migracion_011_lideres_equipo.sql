-- =====================================================================
-- Migración 011 · Líderes de equipo y solicitudes de creación de equipos
-- Un desarrollador pide crear equipos desde la landing; el administrador aprueba y le da un cupo.
-- El líder es quien crea el equipo (equipos.creado_por) y gestiona SOLO sus equipos.
-- El administrador sigue igual (dueño del sistema). Nadie se da cupo a sí mismo: solo aprobar_solicitud.
-- Requiere 002 a 010. Se puede ejecutar más de una vez.
-- Cómo usarla: Supabase > SQL Editor > New query > pegar todo > Run
-- =====================================================================

-- ---------- Cupo de equipos por persona (lo cambia solo aprobar_solicitud) ----------
alter table perfiles add column if not exists cupo_equipos smallint not null default 0
  check (cupo_equipos between 0 and 20);

-- ---------- Solicitudes ----------
create table if not exists solicitudes_equipo (
  id                  uuid primary key default gen_random_uuid(),
  solicitante         uuid not null references perfiles(id) on delete cascade,
  nombre_equipo       text not null check (length(trim(nombre_equipo)) between 1 and 80),
  integrantes         text not null check (integrantes in ('2-4', '5-10', 'mas-10')),
  equipos_solicitados smallint not null check (equipos_solicitados between 1 and 3),
  descripcion         text check (length(descripcion) <= 500),
  estado              text not null default 'pendiente' check (estado in ('pendiente', 'aprobada', 'rechazada')),
  motivo              text check (length(motivo) <= 300),
  creada_en           timestamptz not null default now(),
  resuelta_en         timestamptz,
  resuelta_por        uuid references perfiles(id)
);
-- Una sola solicitud pendiente por persona (evita spam de correos al administrador).
create unique index if not exists solicitudes_pendiente_unica on solicitudes_equipo (solicitante) where estado = 'pendiente';
create index if not exists solicitudes_estado_fecha on solicitudes_equipo (estado, creada_en desc);

-- Las crea el servicio (valida y avisa por correo). El navegador solo lee: la propia o, el admin, todas.
alter table solicitudes_equipo enable row level security;
drop policy if exists "solicitudes_select" on solicitudes_equipo;
create policy "solicitudes_select" on solicitudes_equipo for select to authenticated
  using (solicitante = auth.uid() or es_administrador());

-- ---------- ¿Quién gestiona un equipo? ----------
create or replace function es_lider(p_equipo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from equipos where id = p_equipo and creado_por = auth.uid());
$$;

create or replace function gestiona_equipo(p_equipo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select es_administrador() or es_lider(p_equipo);
$$;

create or replace function gestiona_repo(p_repo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select es_administrador() or exists (
    select 1 from repositorios r join equipos e on e.id = r.equipo_id
    where r.id = p_repo and e.creado_por = auth.uid()
  );
$$;

-- ---------- Lectura: el líder ve todo lo de SUS equipos ----------
-- Estas funciones las usan todas las políticas de lectura de equipo (002, 003, 005, 006); ampliarlas
-- al líder evita duplicar ~15 políticas. Ninguna da permisos de escritura de colaborador.
create or replace function es_miembro(p_equipo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from miembros_equipo where equipo_id = p_equipo and usuario_id = auth.uid())
      or exists (select 1 from equipos where id = p_equipo and creado_por = auth.uid());
$$;

create or replace function es_miembro_analisis(p_analisis uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from analisis a
    join repositorios r on r.id = a.repositorio_id
    join miembros_equipo m on m.equipo_id = r.equipo_id
    where a.id = p_analisis and m.usuario_id = auth.uid()
  ) or exists (
    select 1 from analisis a
    join repositorios r on r.id = a.repositorio_id
    join equipos e on e.id = r.equipo_id
    where a.id = p_analisis and e.creado_por = auth.uid()
  );
$$;

-- Compañeros de equipo, el líder con sus miembros y los miembros con su líder (nombres en comentarios, etc.).
-- El administrador sigue sin ser visible para los miembros aunque haya creado el equipo (como en la 002).
create or replace function comparte_equipo(p_usuario uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from miembros_equipo yo
    join miembros_equipo otro on otro.equipo_id = yo.equipo_id
    where yo.usuario_id = auth.uid() and otro.usuario_id = p_usuario
  ) or exists (
    select 1 from equipos e join miembros_equipo m on m.equipo_id = e.id
    where e.creado_por = auth.uid() and m.usuario_id = p_usuario
  ) or (
    exists (select 1 from equipos e join miembros_equipo m on m.equipo_id = e.id
            where e.creado_por = p_usuario and m.usuario_id = auth.uid())
    and not exists (select 1 from perfiles where id = p_usuario and rol = 'administrador')
  );
$$;

-- El líder lee incidencias de sus repositorios como 'observador': cambiar_estado exige 'colaborador',
-- así que no puede tomar ni corregir; gestiona con asignar_incidencia y resolver_descarte.
create or replace function rol_en_repo(p_repo uuid)
returns rol_equipo language sql stable security definer set search_path = public as $$
  select coalesce(
    (select m.rol from repositorios r join miembros_equipo m on m.equipo_id = r.equipo_id
     where r.id = p_repo and m.usuario_id = auth.uid()),
    (select 'observador'::rol_equipo from repositorios r join equipos e on e.id = r.equipo_id
     where r.id = p_repo and e.creado_por = auth.uid())
  );
$$;

-- ---------- Escritura del líder en sus equipos (políticas adicionales: se suman con OR a las del admin) ----------
drop policy if exists "equipos_lider_update" on equipos;
create policy "equipos_lider_update" on equipos for update to authenticated
  using (es_lider(id)) with check (creado_por = auth.uid());  -- no puede regalar el equipo a otra persona

drop policy if exists "miembros_lider" on miembros_equipo;
create policy "miembros_lider" on miembros_equipo for all to authenticated
  using (es_lider(equipo_id)) with check (es_lider(equipo_id));

drop policy if exists "invitaciones_lider" on invitaciones;
create policy "invitaciones_lider" on invitaciones for all to authenticated
  using (es_lider(equipo_id)) with check (es_lider(equipo_id));

drop policy if exists "notificaciones_lider" on notificaciones;
create policy "notificaciones_lider" on notificaciones for select to authenticated
  using (es_lider(equipo_id));

-- El líder usa el asistente IA de su equipo y ve su conversación (el servicio comprueba lo mismo).
drop policy if exists "chat_equipo_lider" on chat_equipo;
create policy "chat_equipo_lider" on chat_equipo for select to authenticated
  using (es_lider(equipo_id));

drop policy if exists "comentarios_insert_lider" on comentarios;
create policy "comentarios_insert_lider" on comentarios for insert to authenticated
  with check (autor_id = auth.uid() and exists (
    select 1 from incidencias i where i.id = incidencia_id and gestiona_repo(i.repositorio_id)));

-- Hallazgo de la auditoría: el navegador ya no puede crear repositorios ligados a un equipo
-- (solo el servicio, tras comprobar que quien lo pide gestiona el equipo).
drop policy if exists "repos_insert" on repositorios;
create policy "repos_insert" on repositorios for insert to authenticated
  with check (usuario_id = auth.uid() and equipo_id is null);

-- ---------- Crear equipo: el admin sin límite; el líder hasta su cupo ----------
create or replace function crear_equipo(p_nombre text, p_descripcion text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_cupo smallint;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Inicia sesión para crear un equipo.';
  end if;
  if not es_administrador() then
    -- for update: dos pestañas creando a la vez no pueden pasarse del cupo
    select cupo_equipos into v_cupo from perfiles where id = auth.uid() for update;
    if coalesce(v_cupo, 0) <= (select count(*) from equipos where creado_por = auth.uid()) then
      raise exception 'Ya usaste todos los equipos que tienes aprobados.';
    end if;
  end if;
  insert into equipos (nombre, descripcion, creado_por)
  values (trim(p_nombre), nullif(trim(coalesce(p_descripcion, '')), ''), auth.uid())
  returning id into v_id;
  return v_id;
end $$;

-- ---------- Funciones de gestión: admin o líder de ESE equipo ----------
create or replace function crear_invitacion(
  p_equipo uuid, p_correo text, p_rol rol_equipo default 'colaborador', p_github text default null
) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_correo text := lower(trim(p_correo));
  v_codigo text;
begin
  if not gestiona_equipo(p_equipo) then
    raise exception 'Solo el administrador o el líder del equipo puede invitar.';
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

create or replace function asignar_rama(p_usuario uuid, p_repositorio uuid, p_rama uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_equipo uuid;
begin
  select equipo_id into v_equipo from repositorios where id = p_repositorio;
  if not gestiona_equipo(v_equipo) then
    raise exception 'Solo el administrador o el líder del equipo puede asignar ramas.';
  end if;
  if v_equipo is null or not exists (
    select 1 from miembros_equipo where equipo_id = v_equipo and usuario_id = p_usuario and rol = 'colaborador'
  ) then
    raise exception 'Solo se puede asignar una rama a un colaborador del equipo del repositorio.';
  end if;
  if p_rama is null then
    delete from miembro_ramas where usuario_id = p_usuario and repositorio_id = p_repositorio;
    return;
  end if;
  if not exists (select 1 from ramas_vigiladas where id = p_rama and repositorio_id = p_repositorio) then
    raise exception 'Esa rama no está vigilada en el repositorio.';
  end if;
  insert into miembro_ramas (equipo_id, usuario_id, repositorio_id, rama_vigilada_id)
  values (v_equipo, p_usuario, p_repositorio, p_rama)
  on conflict (usuario_id, repositorio_id) do update set rama_vigilada_id = excluded.rama_vigilada_id;
end $$;

create or replace function asignar_incidencia(p_incidencia uuid, p_usuario uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v incidencias;
  v_nuevo estado_incidencia;
begin
  select * into v from incidencias where id = p_incidencia for update;
  if v.id is null or not gestiona_repo(v.repositorio_id) then
    raise exception 'Solo el administrador o el líder del equipo puede asignar.';
  end if;
  if p_usuario is not null and not exists (
    select 1 from repositorios r join miembros_equipo m on m.equipo_id = r.equipo_id
    where r.id = v.repositorio_id and m.usuario_id = p_usuario and m.rol = 'colaborador'
  ) then
    raise exception 'Solo se puede asignar a un colaborador del equipo.';
  end if;
  if p_usuario is not null and not rama_permitida(v.repositorio_id, v.rama, p_usuario) then
    raise exception 'Esa persona trabaja en otra rama de este repositorio. Cámbiale la rama en Colaboradores o asigna a otra persona.';
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
  v_nuevo estado_incidencia;
begin
  select * into v from incidencias where id = p_incidencia for update;
  if v.id is null or not gestiona_repo(v.repositorio_id) then
    raise exception 'Solo el administrador o el líder del equipo puede resolver esta revisión.';
  end if;
  if not v.descarte_solicitado then
    raise exception 'Esa incidencia no tiene una solicitud de revisión.';
  end if;
  v_nuevo := case when p_aprobar then 'resuelta' else 'en_correccion' end;
  update incidencias set
    estado = v_nuevo,
    descarte_solicitado = false,
    motivo_cierre = case when p_aprobar then 'descartada'::motivo_cierre end,
    resuelta_en = case when p_aprobar then now() end,
    actualizada_en = now()
  where id = v.id;
  insert into incidencia_eventos (incidencia_id, actor_id, tipo, estado_anterior, estado_nuevo, nota)
  values (v.id, auth.uid(), case when p_aprobar then 'descarte_aprobado' else 'descarte_rechazado' end,
          v.estado, v_nuevo, nullif(trim(coalesce(p_nota, '')), ''));
end $$;

create or replace function actividad_equipo(p_equipo uuid)
returns table (usuario_id uuid, ultima timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not gestiona_equipo(p_equipo) then
    raise exception 'Solo el administrador o el líder ve la actividad del equipo.';
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

create or replace function recalcular_plazos(p_equipo uuid)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_total integer;
begin
  if not gestiona_equipo(p_equipo) then
    raise exception 'Solo el administrador o el líder puede cambiar los plazos.';
  end if;
  update incidencias i set
    fecha_limite = i.creada_en + make_interval(days => case i.severidad
        when 'alto' then e.plazo_alta_dias when 'medio' then e.plazo_media_dias else e.plazo_baja_dias end),
    actualizada_en = now()
  from repositorios r join equipos e on e.id = r.equipo_id
  where r.id = i.repositorio_id and e.id = p_equipo
    and i.estado in ('abierta', 'en_correccion', 'en_revision');
  get diagnostics v_total = row_count;
  return v_total;
end $$;

create or replace function eliminar_equipo(p_equipo uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not gestiona_equipo(p_equipo) then
    raise exception 'Solo el administrador o el líder puede eliminar un equipo.';
  end if;
  delete from repositorios where equipo_id = p_equipo;  -- sin esto quedarían sueltos (equipo_id pasa a null)
  delete from equipos where id = p_equipo;
  if not found then
    raise exception 'No existe ese equipo.';
  end if;
end $$;

-- ---------- Aprobar o rechazar solicitudes (solo el administrador) ----------
create or replace function aprobar_solicitud(p_solicitud uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v solicitudes_equipo;
begin
  if not es_administrador() then
    raise exception 'Solo el administrador puede aprobar solicitudes.';
  end if;
  select * into v from solicitudes_equipo where id = p_solicitud for update;
  if v.id is null or v.estado <> 'pendiente' then
    raise exception 'Esa solicitud ya no está pendiente.';
  end if;
  update perfiles set cupo_equipos = least(20, cupo_equipos + v.equipos_solicitados) where id = v.solicitante;
  update solicitudes_equipo set estado = 'aprobada', resuelta_en = now(), resuelta_por = auth.uid() where id = v.id;
end $$;

create or replace function rechazar_solicitud(p_solicitud uuid, p_motivo text default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_administrador() then
    raise exception 'Solo el administrador puede rechazar solicitudes.';
  end if;
  update solicitudes_equipo set estado = 'rechazada', motivo = nullif(trim(coalesce(p_motivo, '')), ''),
    resuelta_en = now(), resuelta_por = auth.uid()
  where id = p_solicitud and estado = 'pendiente';
  if not found then
    raise exception 'Esa solicitud ya no está pendiente.';
  end if;
end $$;

revoke execute on function es_lider(uuid), gestiona_equipo(uuid), gestiona_repo(uuid), crear_equipo(text, text),
  aprobar_solicitud(uuid), rechazar_solicitud(uuid, text) from public, anon;
grant execute on function es_lider(uuid), gestiona_equipo(uuid), gestiona_repo(uuid), crear_equipo(text, text),
  aprobar_solicitud(uuid), rechazar_solicitud(uuid, text) to authenticated;
