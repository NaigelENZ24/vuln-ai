-- =====================================================================
-- Migración 009 · Eliminar un equipo por completo (solo administrador)
-- Borra el equipo y sus repositorios. En cascada se van ramas vigiladas, análisis, hallazgos, incidencias,
-- historial, comentarios, miembros, invitaciones, registro de correos y la conversación del asistente.
-- Todo en una transacción: o se borra todo o nada. Se puede ejecutar más de una vez. Requiere 002 a 008.
-- Cómo usarla: Supabase > SQL Editor > New query > pegar todo > Run
-- =====================================================================

create or replace function eliminar_equipo(p_equipo uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_administrador() then
    raise exception 'Solo el administrador puede eliminar un equipo.';
  end if;
  delete from repositorios where equipo_id = p_equipo;  -- sin esto quedarían sueltos (equipo_id pasa a null)
  delete from equipos where id = p_equipo;
  if not found then
    raise exception 'No existe ese equipo.';
  end if;
end $$;

revoke execute on function eliminar_equipo(uuid) from public, anon;
grant execute on function eliminar_equipo(uuid) to authenticated;
