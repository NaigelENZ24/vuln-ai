-- =====================================================================
-- Migración 005 · Rama de trabajo de cada colaborador
-- Por cada repositorio del equipo, el admin puede elegir en qué rama trabaja un colaborador.
-- Sin elección, trabaja en la rama principal. Solo agrega; se puede ejecutar más de una vez.
-- Requiere 002, 003 y 004. Cómo usarla: Supabase > SQL Editor > New query > pegar todo > Run
-- =====================================================================

create table if not exists miembro_ramas (
  equipo_id         uuid not null,
  usuario_id        uuid not null,
  repositorio_id    uuid not null references repositorios(id) on delete cascade,
  rama_vigilada_id  uuid not null references ramas_vigiladas(id) on delete cascade,  -- si se borra: vuelve a la principal
  primary key (usuario_id, repositorio_id),
  foreign key (equipo_id, usuario_id) references miembros_equipo(equipo_id, usuario_id) on delete cascade
);

-- ¿Esa persona trabaja en esa rama del repositorio? Su rama elegida, o la principal si no tiene.
create or replace function rama_permitida(p_repo uuid, p_rama text, p_usuario uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select v.rama = p_rama from miembro_ramas mr join ramas_vigiladas v on v.id = mr.rama_vigilada_id
     where mr.usuario_id = p_usuario and mr.repositorio_id = p_repo),
    (select v.es_principal from ramas_vigiladas v where v.repositorio_id = p_repo and v.rama = p_rama),
    false
  );
$$;

-- Solo el admin. p_rama null = vuelve a la rama principal.
create or replace function asignar_rama(p_usuario uuid, p_repositorio uuid, p_rama uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_equipo uuid;
begin
  if not es_administrador() then
    raise exception 'Solo el administrador puede asignar ramas.';
  end if;
  select equipo_id into v_equipo from repositorios where id = p_repositorio;
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

-- cambiar_estado (versión 004) + "tomar" solo en la rama de trabajo.
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

  if p_accion = 'liberar' then
    raise exception 'Solo el administrador puede liberar o reasignar una incidencia.';

  elsif p_accion in ('tomar', 'corregir') then
    if p_accion = 'tomar' and v.asignado_a is not null then
      raise exception 'Esta incidencia ya tiene responsable.';
    end if;
    if p_accion = 'tomar' and not rama_permitida(v.repositorio_id, v.rama, auth.uid()) then
      raise exception 'Esta incidencia es de otra rama: solo puedes tomar las de la rama en la que trabajas.';
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
      raise exception 'Ya tienes % incidencias en corrección. Termina o pide al administrador que reasigne una.', v_limite;
    end if;
    v_nuevo := 'en_correccion';
    update incidencias set asignado_a = auth.uid(), estado = v_nuevo, actualizada_en = now() where id = v.id;

  elsif p_accion in ('verificar', 'solicitar_descarte') then
    if v.asignado_a is distinct from auth.uid() then
      raise exception 'Solo la persona asignada puede hacer esto.';
    end if;
    if v.estado not in ('abierta', 'en_correccion') then
      raise exception 'Esta acción no está disponible en el estado actual.';
    end if;
    v_nuevo := 'en_revision';
    if p_accion = 'verificar' then
      update incidencias set estado = v_nuevo, actualizada_en = now() where id = v.id;
    else
      if length(trim(coalesce(p_nota, ''))) < 10 then
        raise exception 'Explica en al menos 10 caracteres por qué no es una vulnerabilidad.';
      end if;
      update incidencias set estado = v_nuevo, descarte_solicitado = true, motivo_descarte = trim(p_nota),
        actualizada_en = now() where id = v.id;
    end if;

  else
    raise exception 'Acción no válida.';
  end if;

  insert into incidencia_eventos (incidencia_id, actor_id, tipo, estado_anterior, estado_nuevo, nota)
  values (v.id, auth.uid(), p_accion, v.estado, v_nuevo, nullif(trim(coalesce(p_nota, '')), ''));
  return v_nuevo;
end $$;

-- asignar_incidencia (versión 003) + solo a quien trabaja en esa rama.
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
  if p_usuario is not null and not rama_permitida(v.repositorio_id, v.rama, p_usuario) then
    raise exception 'Esa persona trabaja en otra rama de este repositorio. Cámbiale la rama en Colaboradores o asigna a otra persona.';
  end if;
  v_nuevo := case when v.estado = 'en_correccion' and v.asignado_a is distinct from p_usuario then 'abierta' else v.estado end;
  update incidencias set asignado_a = p_usuario, estado = v_nuevo, actualizada_en = now() where id = v.id;
  insert into incidencia_eventos (incidencia_id, actor_id, tipo, estado_anterior, estado_nuevo)
  values (v.id, auth.uid(), case when p_usuario is null then 'desasignada' else 'asignada' end, v.estado, v_nuevo);
end $$;

revoke execute on function rama_permitida(uuid, text, uuid), asignar_rama(uuid, uuid, uuid) from public, anon;
grant execute on function rama_permitida(uuid, text, uuid), asignar_rama(uuid, uuid, uuid) to authenticated;

-- Lectura: el admin, la propia persona y sus compañeros de equipo. Se escribe solo con asignar_rama.
alter table miembro_ramas enable row level security;
drop policy if exists "miembro_ramas_select" on miembro_ramas;
create policy "miembro_ramas_select" on miembro_ramas for select to authenticated
  using (es_administrador() or usuario_id = auth.uid() or es_miembro(equipo_id));
