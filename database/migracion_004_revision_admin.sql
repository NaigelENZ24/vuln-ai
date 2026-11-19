-- =====================================================================
-- Migración 004 · Ajustes del flujo de incidencias
--  - Solo el administrador libera o reasigna (con asignar_incidencia); el colaborador ya no puede "liberar".
--  - "No es una vulnerabilidad" pasa la incidencia a EN REVISIÓN. El administrador decide:
--      aprobar  -> RESUELTA (motivo_cierre = 'descartada'), sin re-análisis ni IA.
--      rechazar -> vuelve a EN CORRECCIÓN.
-- Solo reemplaza dos funciones: no toca tablas ni datos. Se puede ejecutar más de una vez.
-- Cómo usarla: Supabase > SQL Editor > New query > pegar todo > Run
-- =====================================================================

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

create or replace function resolver_descarte(p_incidencia uuid, p_aprobar boolean, p_nota text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v incidencias;
  v_nuevo estado_incidencia;
begin
  if not es_administrador() then
    raise exception 'Solo el administrador puede resolver esta revisión.';
  end if;
  select * into v from incidencias where id = p_incidencia for update;
  if v.id is null or not v.descarte_solicitado then
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
