-- =====================================================================
-- Migración 007 · Plazos de resolución por severidad, configurables por equipo
-- Antes estaban fijos en el servicio (alta 7 días, media 30, baja 90): esos siguen como valor por defecto.
-- Solo agrega. Se puede ejecutar más de una vez. Requiere 002 a 006.
-- Cómo usarla: Supabase > SQL Editor > New query > pegar todo > Run
-- =====================================================================

-- null = sin plazo (la incidencia no vence)
alter table equipos add column if not exists plazo_alta_dias smallint default 7 check (plazo_alta_dias between 1 and 365);
alter table equipos add column if not exists plazo_media_dias smallint default 30 check (plazo_media_dias between 1 and 365);
alter table equipos add column if not exists plazo_baja_dias smallint default 90 check (plazo_baja_dias between 1 and 365);

-- Aplica los plazos actuales del equipo a sus incidencias abiertas (fecha límite = detección + plazo).
-- Devuelve cuántas se actualizaron. Solo el administrador.
create or replace function recalcular_plazos(p_equipo uuid)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_total integer;
begin
  if not es_administrador() then
    raise exception 'Solo el administrador puede cambiar los plazos.';
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

revoke execute on function recalcular_plazos(uuid) from public, anon;
grant execute on function recalcular_plazos(uuid) to authenticated;
