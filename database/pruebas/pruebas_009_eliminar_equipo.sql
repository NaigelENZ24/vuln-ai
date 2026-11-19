-- Pruebas de la migración 009 (equipo 5 de las pruebas anteriores, con repo, ramas e incidencias).
\set ON_ERROR_STOP on
insert into miembros_equipo (equipo_id, usuario_id, rol) values
  ('20000000-0000-0000-0000-0000000000e5', '00000000-0000-0000-0000-0000000000b5', 'colaborador') on conflict do nothing;

set role authenticated;

-- Un no-admin no puede eliminarlo.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b5', false);
do $$ begin
  perform eliminar_equipo('20000000-0000-0000-0000-0000000000e5');
  raise exception 'FALLO: un colaborador elimino el equipo';
exception when others then if sqlerrm like 'FALLO%' then raise; end if; end $$;

-- El admin lo elimina y no queda nada suyo.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a5', false);
select eliminar_equipo('20000000-0000-0000-0000-0000000000e5');
reset role;
do $$ begin
  if exists (select 1 from equipos where id = '20000000-0000-0000-0000-0000000000e5')
    or exists (select 1 from repositorios where id = '10000000-0000-0000-0000-0000000000e5')
    or exists (select 1 from incidencias where repositorio_id = '10000000-0000-0000-0000-0000000000e5')
    or exists (select 1 from ramas_vigiladas where repositorio_id = '10000000-0000-0000-0000-0000000000e5')
    or exists (select 1 from miembros_equipo where equipo_id = '20000000-0000-0000-0000-0000000000e5')
    or exists (select 1 from chat_equipo where equipo_id = '20000000-0000-0000-0000-0000000000e5')
    or exists (select 1 from notificaciones where equipo_id = '20000000-0000-0000-0000-0000000000e5')
  then raise exception 'FALLO: quedaron datos del equipo eliminado'; end if;
end $$;

-- Un id que no existe da error claro.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a5', false);
do $$ begin
  perform eliminar_equipo('20000000-0000-0000-0000-0000000000e5');
  raise exception 'FALLO: elimino un equipo inexistente';
exception when others then
  if sqlerrm like 'FALLO%' then raise; end if;
  if sqlerrm <> 'No existe ese equipo.' then raise exception 'FALLO: mensaje %', sqlerrm; end if;
end $$;

reset role;
select 'TODAS LAS PRUEBAS DE LA 009 PASARON' as resultado;
