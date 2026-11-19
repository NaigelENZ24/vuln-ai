-- Pruebas de la migración 005: rama de trabajo por colaborador.
\set ON_ERROR_STOP on
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000a5', 'admin5@x.com', now()),
  ('00000000-0000-0000-0000-0000000000b5', 'colab5@x.com', now());
update perfiles set rol = 'administrador' where correo = 'admin5@x.com';
insert into equipos (id, nombre, creado_por) values
  ('20000000-0000-0000-0000-0000000000e5', 'Equipo 5', '00000000-0000-0000-0000-0000000000a5');
insert into miembros_equipo (equipo_id, usuario_id, rol) values
  ('20000000-0000-0000-0000-0000000000e5', '00000000-0000-0000-0000-0000000000b5', 'colaborador');
insert into repositorios (id, usuario_id, url, nombre, equipo_id) values
  ('10000000-0000-0000-0000-0000000000e5', '00000000-0000-0000-0000-0000000000a5', 'https://github.com/e/cinco', 'e/cinco', '20000000-0000-0000-0000-0000000000e5');
insert into ramas_vigiladas (id, repositorio_id, rama, es_principal) values
  ('40000000-0000-0000-0000-000000000051', '10000000-0000-0000-0000-0000000000e5', 'main', true),
  ('40000000-0000-0000-0000-000000000052', '10000000-0000-0000-0000-0000000000e5', 'dev', false);
insert into incidencias (id, repositorio_id, rama, huella, regla_id, archivo, severidad) values
  ('50000000-0000-0000-0000-000000000051', '10000000-0000-0000-0000-0000000000e5', 'main', 'm1', 'B608', 'a.py', 'alto'),
  ('50000000-0000-0000-0000-000000000052', '10000000-0000-0000-0000-0000000000e5', 'dev', 'd1', 'B608', 'a.py', 'alto'),
  ('50000000-0000-0000-0000-000000000053', '10000000-0000-0000-0000-0000000000e5', 'main', 'm2', 'B608', 'a.py', 'medio'),
  ('50000000-0000-0000-0000-000000000054', '10000000-0000-0000-0000-0000000000e5', 'dev', 'd2', 'B608', 'a.py', 'medio');

set role authenticated;

-- 1. Sin rama elegida trabaja en la principal: toma de main, no de dev; y no puede asignarse ramas.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b5', false);
do $$ begin
  perform cambiar_estado('50000000-0000-0000-0000-000000000051', 'tomar');
  begin
    perform cambiar_estado('50000000-0000-0000-0000-000000000052', 'tomar');
    raise exception 'FALLO: tomo una incidencia de otra rama';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  begin
    perform asignar_rama('00000000-0000-0000-0000-0000000000b5', '10000000-0000-0000-0000-0000000000e5', '40000000-0000-0000-0000-000000000052');
    raise exception 'FALLO: un colaborador se asigno una rama';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
end $$;

-- 2. El admin le asigna dev: solo se le pueden asignar incidencias de dev.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a5', false);
do $$ begin
  perform asignar_rama('00000000-0000-0000-0000-0000000000b5', '10000000-0000-0000-0000-0000000000e5', '40000000-0000-0000-0000-000000000052');
  begin
    perform asignar_incidencia('50000000-0000-0000-0000-000000000053', '00000000-0000-0000-0000-0000000000b5');
    raise exception 'FALLO: asigno una incidencia de main a quien trabaja en dev';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  perform asignar_incidencia('50000000-0000-0000-0000-000000000054', '00000000-0000-0000-0000-0000000000b5');
end $$;

-- 3. Ahora toma de dev y ya no de main.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b5', false);
do $$ begin
  perform cambiar_estado('50000000-0000-0000-0000-000000000052', 'tomar');
  begin
    perform cambiar_estado('50000000-0000-0000-0000-000000000053', 'tomar');
    raise exception 'FALLO: tomo de main trabajando en dev';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  -- lo que ya tenía asignado de main lo sigue pudiendo verificar
  perform cambiar_estado('50000000-0000-0000-0000-000000000051', 'verificar');
  if (select count(*) from miembro_ramas) <> 1 then raise exception 'FALLO: no ve su rama'; end if;
end $$;

-- 4. Volver a la principal (rama null) y quitarlo del equipo borra su asignación.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a5', false);
do $$ begin
  perform asignar_rama('00000000-0000-0000-0000-0000000000b5', '10000000-0000-0000-0000-0000000000e5', null);
  if (select count(*) from miembro_ramas where usuario_id = '00000000-0000-0000-0000-0000000000b5') <> 0 then raise exception 'FALLO: no volvio a la principal'; end if;
  perform asignar_rama('00000000-0000-0000-0000-0000000000b5', '10000000-0000-0000-0000-0000000000e5', '40000000-0000-0000-0000-000000000052');
  delete from miembros_equipo where usuario_id = '00000000-0000-0000-0000-0000000000b5';
  if (select count(*) from miembro_ramas where usuario_id = '00000000-0000-0000-0000-0000000000b5') <> 0 then raise exception 'FALLO: quedo la rama del miembro quitado'; end if;
end $$;

reset role;
select 'TODAS LAS PRUEBAS DE LA 005 PASARON' as resultado;
