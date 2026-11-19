-- Pruebas de la migración 002. Cada bloque falla con un mensaje claro si algo no cumple.
\set ON_ERROR_STOP on
-- Usuarios: admin, colaborador invitado, intruso (correo distinto) y sin verificar.
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@x.com', now()),
  ('00000000-0000-0000-0000-00000000000b', 'ana@x.com', now()),
  ('00000000-0000-0000-0000-00000000000c', 'intruso@x.com', now()),
  ('00000000-0000-0000-0000-00000000000d', 'novalida@x.com', null);
update perfiles set rol = 'administrador' where correo = 'admin@x.com';

-- Repositorio personal del intruso (no debe verlo nadie más).
insert into repositorios (id, usuario_id, url, nombre) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c', 'https://github.com/i/p', 'i/p');

create temp table t (clave text primary key, valor text);
grant all on t to authenticated;

-- 1. El admin crea el equipo, un repo de equipo y una invitación para ana.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
insert into equipos (id, nombre) values ('20000000-0000-0000-0000-000000000001', 'Equipo demo');
reset role;
insert into repositorios (id, usuario_id, url, nombre, equipo_id) values
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', 'https://github.com/e/d', 'e/d', '20000000-0000-0000-0000-000000000001');
insert into analisis (id, repositorio_id, solicitado_por) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a');
set role authenticated;
insert into t select 'codigo', crear_invitacion('20000000-0000-0000-0000-000000000001', '  ANA@x.com ', 'colaborador', 'ana-dev');

-- 2. Un no-admin no puede invitar.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
do $$ begin
  perform crear_invitacion('20000000-0000-0000-0000-000000000001', 'x@x.com');
  raise exception 'FALLO: un no-admin pudo invitar';
exception when others then
  if sqlerrm like 'FALLO%' then raise; end if;
end $$;

-- 3. El intruso no ve el equipo, ni el repo del equipo, ni el análisis, ni invitaciones, y no puede aceptar con el código.
do $$ begin
  if (select count(*) from equipos) <> 0 then raise exception 'FALLO: intruso ve equipos'; end if;
  if (select count(*) from repositorios where equipo_id is not null) <> 0 then raise exception 'FALLO: intruso ve repo de equipo'; end if;
  if (select count(*) from analisis) <> 0 then raise exception 'FALLO: intruso ve analisis del equipo'; end if;
  if (select count(*) from invitaciones) <> 0 then raise exception 'FALLO: intruso ve invitaciones'; end if;
  if (select count(*) from mis_invitaciones()) <> 0 then raise exception 'FALLO: intruso ve invitacion ajena'; end if;
  begin
    perform aceptar_invitacion((select valor from t where clave = 'codigo'));
    raise exception 'FALLO: intruso acepto invitacion ajena';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
    if sqlerrm <> 'Esta invitación no es válida o expiró.' then raise exception 'FALLO: mensaje no generico: %', sqlerrm; end if;
  end;
end $$;

-- 4. Ana ve su invitación pendiente, un código falso falla y el verdadero funciona.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
do $$ begin
  if (select count(*) from mis_invitaciones()) <> 1 then raise exception 'FALLO: ana no ve su invitacion'; end if;
  if (select count(*) from equipos) <> 0 then raise exception 'FALLO: ana ve el equipo antes de aceptar'; end if;
  begin
    perform aceptar_invitacion('codigo-falso');
    raise exception 'FALLO: codigo falso aceptado';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  perform aceptar_invitacion((select valor from t where clave = 'codigo'));
  if (select count(*) from equipos) <> 1 then raise exception 'FALLO: ana no ve el equipo tras aceptar'; end if;
  if (select count(*) from analisis) <> 1 then raise exception 'FALLO: ana no ve el analisis del equipo'; end if;
  if (select count(*) from repositorios) <> 1 then raise exception 'FALLO: ana ve repos que no son del equipo'; end if;
  if (select github_usuario from miembros_equipo where usuario_id = auth.uid()) <> 'ana-dev' then raise exception 'FALLO: github no copiado'; end if;
  -- solo su perfil: el admin no es miembro del equipo y el intruso tampoco
  if (select count(*) from perfiles) <> 1 then raise exception 'FALLO: ana ve % perfiles', (select count(*) from perfiles); end if;
  -- el código ya usado no sirve otra vez
  begin
    perform aceptar_invitacion((select valor from t where clave = 'codigo'));
    raise exception 'FALLO: codigo reutilizado';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  -- un miembro no puede cambiarse el rol ni agregar miembros
  update miembros_equipo set rol = 'observador' where usuario_id = auth.uid();
  if (select rol from miembros_equipo where usuario_id = auth.uid()) <> 'colaborador' then raise exception 'FALLO: miembro cambio su rol'; end if;
end $$;

-- 5. Cuenta sin correo verificado no puede aceptar aunque tenga invitación.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
insert into t select 'codigo2', crear_invitacion('20000000-0000-0000-0000-000000000001', 'novalida@x.com', 'observador');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', false);
do $$ begin
  perform aceptar_invitacion((select valor from t where clave = 'codigo2'));
  raise exception 'FALLO: correo sin verificar acepto';
exception when others then if sqlerrm like 'FALLO%' then raise; end if; end $$;

-- 6. Reenviar: la invitación anterior queda revocada y solo hay una pendiente.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select crear_invitacion('20000000-0000-0000-0000-000000000001', 'novalida@x.com', 'observador') is not null as reenviada;
do $$ begin
  if (select count(*) from invitaciones where correo = 'novalida@x.com' and revocada_en is null and aceptada_en is null) <> 1
    then raise exception 'FALLO: mas de una pendiente'; end if;
end $$;

-- 7. Un usuario anónimo no puede ejecutar las funciones.
reset role;
set role anon;
do $$ begin
  perform mis_invitaciones();
  raise exception 'FALLO: anon ejecuto funcion';
exception when insufficient_privilege then null; end $$;
reset role;

select 'TODAS LAS PRUEBAS PASARON' as resultado;
