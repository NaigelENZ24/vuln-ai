-- Pruebas de la migración 011: solicitudes, cupo, líder de equipo y que no se salga de SUS equipos.
\set ON_ERROR_STOP on
-- Usuarios ficticios: admin (a), líder (l), colaborador (c), otro desarrollador (x).
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000011a1', 'admin11@x.test', now()),
  ('00000000-0000-0000-0000-0000000011b1', 'lider11@x.test', now()),
  ('00000000-0000-0000-0000-0000000011c1', 'colab11@x.test', now()),
  ('00000000-0000-0000-0000-0000000011d1', 'otro11@x.test', now());
update perfiles set rol = 'administrador' where id = '00000000-0000-0000-0000-0000000011a1';

-- La solicitud la crea el servicio (service_role); una sola pendiente por persona.
insert into solicitudes_equipo (id, solicitante, nombre_equipo, integrantes, equipos_solicitados)
values ('51000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-0000000011b1', 'Equipo L', '2-4', 1);
do $$ begin
  insert into solicitudes_equipo (solicitante, nombre_equipo, integrantes, equipos_solicitados)
  values ('00000000-0000-0000-0000-0000000011b1', 'Otro', '5-10', 1);
  raise exception 'FALLO: dos solicitudes pendientes de la misma persona';
exception when unique_violation then null; end $$;
do $$ begin
  insert into solicitudes_equipo (solicitante, nombre_equipo, integrantes, equipos_solicitados)
  values ('00000000-0000-0000-0000-0000000011d1', 'Raro', '7', 1);
  raise exception 'FALLO: aceptó un rango de integrantes inventado';
exception when check_violation then null; end $$;

set role authenticated;

-- Sin cupo, un desarrollador no puede crear equipos ni insertarlos directamente.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000011b1', false);
do $$ begin
  perform crear_equipo('Sin permiso');
  raise exception 'FALLO: creó un equipo sin cupo';
exception when others then if sqlerrm like 'FALLO%' then raise; end if; end $$;
do $$ begin
  insert into equipos (nombre, creado_por) values ('Directo', '00000000-0000-0000-0000-0000000011b1');
  raise exception 'FALLO: insertó un equipo directo';
exception when others then if sqlerrm like 'FALLO%' then raise; end if; end $$;
-- Ni puede aprobarse a sí mismo ni cambiarse el cupo.
do $$ begin
  perform aprobar_solicitud('51000000-0000-0000-0000-000000000011');
  raise exception 'FALLO: se aprobó su propia solicitud';
exception when others then if sqlerrm like 'FALLO%' then raise; end if; end $$;
update perfiles set cupo_equipos = 5 where id = '00000000-0000-0000-0000-0000000011b1';
-- Ve su solicitud; otro desarrollador no.
do $$ begin
  if (select count(*) from solicitudes_equipo where id = '51000000-0000-0000-0000-000000000011') <> 1 then
    raise exception 'FALLO: el solicitante no ve su solicitud'; end if;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000011d1', false);
do $$ begin
  if exists (select 1 from solicitudes_equipo) then raise exception 'FALLO: otro ve solicitudes ajenas'; end if;
end $$;

-- El admin aprueba: cupo 1.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000011a1', false);
select aprobar_solicitud('51000000-0000-0000-0000-000000000011');
do $$ begin
  perform aprobar_solicitud('51000000-0000-0000-0000-000000000011');
  raise exception 'FALLO: aprobó dos veces';
exception when others then if sqlerrm like 'FALLO%' then raise; end if; end $$;
-- El admin crea un equipo ajeno al líder.
select crear_equipo('Equipo del admin') as eq_admin \gset
reset role;
do $$ begin
  if (select cupo_equipos from perfiles where id = '00000000-0000-0000-0000-0000000011b1') <> 1 then
    raise exception 'FALLO: el cupo no quedó en 1 (el UPDATE directo no debía aplicar)'; end if;
end $$;

-- El líder crea su equipo (uno) y el segundo falla.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000011b1', false);
select crear_equipo('Equipo L', 'del líder') as eq_lider \gset
do $$ begin
  perform crear_equipo('Segundo');
  raise exception 'FALLO: pasó el cupo';
exception when others then if sqlerrm like 'FALLO%' then raise; end if; end $$;

-- Gestiona su equipo: invita, edita reglas y ve la actividad.
select crear_invitacion(:'eq_lider', 'colab11@x.test', 'colaborador') is not null as invito;
update equipos set descripcion = 'editada' where id = :'eq_lider';
select count(*) >= 0 as actividad from actividad_equipo(:'eq_lider');
-- No puede regalar el equipo a otra persona.
do $$ begin
  update equipos set creado_por = '00000000-0000-0000-0000-0000000011d1' where creado_por = '00000000-0000-0000-0000-0000000011b1';
  raise exception 'FALLO: transfirió el equipo';
exception when others then if sqlerrm like 'FALLO%' then raise; end if; end $$;

-- No toca el equipo del admin: ni lo ve, ni invita, ni lo edita, ni lo elimina.
do $$ begin
  if exists (select 1 from equipos where nombre = 'Equipo del admin') then raise exception 'FALLO: el líder ve un equipo ajeno'; end if;
end $$;
do $$ declare v uuid; begin
  reset role; select id into v from equipos where nombre = 'Equipo del admin'; set role authenticated;
  begin
    perform crear_invitacion(v, 'otro11@x.test', 'colaborador');
    raise exception 'FALLO: invitó en un equipo ajeno';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  begin
    perform eliminar_equipo(v);
    raise exception 'FALLO: eliminó un equipo ajeno';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  update equipos set nombre = 'hackeado' where id = v;  -- RLS: 0 filas
end $$;
reset role;
do $$ begin
  if exists (select 1 from equipos where nombre = 'hackeado') then raise exception 'FALLO: editó un equipo ajeno'; end if;
end $$;

-- El colaborador acepta; el líder ve su nombre y gestiona sus incidencias, pero no puede tomarlas.
insert into miembros_equipo (equipo_id, usuario_id, rol) values (:'eq_lider', '00000000-0000-0000-0000-0000000011c1', 'colaborador');
insert into repositorios (id, usuario_id, url, nombre, equipo_id)
values ('11000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-0000000011b1', 'https://github.com/l/r', 'l/r', :'eq_lider');
insert into ramas_vigiladas (repositorio_id, rama, es_principal) values ('11000000-0000-0000-0000-000000000011', 'main', true);
insert into incidencias (id, repositorio_id, rama, huella, regla_id, archivo, severidad)
values ('31000000-0000-0000-0000-000000000011', '11000000-0000-0000-0000-000000000011', 'main', 'h11', 'B101', 'a.py', 'alto');

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000011b1', false);
do $$ begin
  if not exists (select 1 from perfiles where id = '00000000-0000-0000-0000-0000000011c1') then raise exception 'FALLO: el líder no ve a su colaborador'; end if;
  if not exists (select 1 from incidencias where id = '31000000-0000-0000-0000-000000000011') then raise exception 'FALLO: el líder no ve sus incidencias'; end if;
  if not exists (select 1 from repositorios where id = '11000000-0000-0000-0000-000000000011') then raise exception 'FALLO: el líder no ve su repositorio'; end if;
end $$;
select asignar_incidencia('31000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-0000000011c1');
insert into comentarios (incidencia_id, autor_id, texto) values ('31000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-0000000011b1', 'Revisa esto');
do $$ begin
  perform cambiar_estado('31000000-0000-0000-0000-000000000011', 'tomar');
  raise exception 'FALLO: el líder tomó una incidencia como colaborador';
exception when others then if sqlerrm like 'FALLO%' then raise; end if; end $$;
-- Quitar al colaborador (gestiona miembros de su equipo).
delete from miembros_equipo where usuario_id = '00000000-0000-0000-0000-0000000011c1';

-- El colaborador del líder no gestiona nada; otro desarrollador no ve nada del equipo.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000011d1', false);
do $$ begin
  if exists (select 1 from incidencias where id = '31000000-0000-0000-0000-000000000011') then raise exception 'FALLO: un ajeno ve incidencias'; end if;
  begin
    perform asignar_incidencia('31000000-0000-0000-0000-000000000011', null);
    raise exception 'FALLO: un ajeno asignó';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
end $$;

-- Arreglo de la auditoría: nadie liga repositorios a un equipo desde el navegador.
select set_config('prueba.eq', :'eq_lider', false) is not null as eq;
do $$ begin
  insert into repositorios (usuario_id, url, nombre, equipo_id)
  values ('00000000-0000-0000-0000-0000000011d1', 'https://github.com/x/y', 'x/y', current_setting('prueba.eq')::uuid);
  raise exception 'FALLO: insertó un repositorio con equipo_id';
exception when others then if sqlerrm like 'FALLO%' then raise; end if; end $$;
insert into repositorios (usuario_id, url, nombre) values ('00000000-0000-0000-0000-0000000011d1', 'https://github.com/x/y', 'x/y');

-- Asistente: el líder lee la conversación de su equipo, no la del equipo del admin.
reset role;
insert into chat_equipo (equipo_id, autor, contenido) values (current_setting('prueba.eq')::uuid, 'ia', 'del lider');
insert into chat_equipo (equipo_id, autor, contenido) select id, 'ia', 'del admin' from equipos where nombre = 'Equipo del admin';
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000011b1', false);
do $$ begin
  if (select count(*) from chat_equipo where contenido = 'del lider') <> 1 then raise exception 'FALLO: el líder no ve su asistente'; end if;
  if exists (select 1 from chat_equipo where contenido = 'del admin') then raise exception 'FALLO: el líder ve el asistente de otro equipo'; end if;
end $$;

-- Rechazo con motivo.
reset role;
insert into solicitudes_equipo (id, solicitante, nombre_equipo, integrantes, equipos_solicitados)
values ('51000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-0000000011d1', 'Equipo X', 'mas-10', 3);
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000011a1', false);
select rechazar_solicitud('51000000-0000-0000-0000-000000000012', 'Faltan datos');
reset role;
do $$ begin
  if (select estado from solicitudes_equipo where id = '51000000-0000-0000-0000-000000000012') <> 'rechazada'
    or (select cupo_equipos from perfiles where id = '00000000-0000-0000-0000-0000000011d1') <> 0
  then raise exception 'FALLO: el rechazo no quedó bien'; end if;
end $$;

select 'TODAS LAS PRUEBAS DE LA 011 PASARON' as resultado;
