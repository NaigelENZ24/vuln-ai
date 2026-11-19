-- Pruebas de la migración 008: solo el administrador lee el asistente del equipo, y nadie escribe desde el navegador.
\set ON_ERROR_STOP on
insert into chat_equipo (equipo_id, usuario_id, autor, contenido) values
  ('20000000-0000-0000-0000-0000000000e5', '00000000-0000-0000-0000-0000000000a5', 'usuario', '¿Quién tiene más vencidas?'),
  ('20000000-0000-0000-0000-0000000000e5', null, 'ia', 'Nadie tiene vencidas.');

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f6', false);
do $$ begin
  if (select count(*) from chat_equipo) <> 0 then raise exception 'FALLO: un no-admin ve el asistente'; end if;
  begin
    insert into chat_equipo (equipo_id, autor, contenido) values ('20000000-0000-0000-0000-0000000000e5', 'ia', 'falso');
    raise exception 'FALLO: se pudo escribir desde el navegador';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a5', false);
do $$ begin
  if (select count(*) from chat_equipo) <> 2 then raise exception 'FALLO: el admin no ve la conversacion'; end if;
end $$;

reset role;
select 'TODAS LAS PRUEBAS DE LA 008 PASARON' as resultado;
