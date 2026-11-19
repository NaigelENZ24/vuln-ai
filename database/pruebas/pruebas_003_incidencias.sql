-- Pruebas de la migración 003. Cada bloque falla con "FALLO: ..." si algo no cumple.
\set ON_ERROR_STOP on
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin3@x.com', now()),
  ('00000000-0000-0000-0000-0000000000b1', 'colab@x.com', now()),
  ('00000000-0000-0000-0000-0000000000c1', 'obs@x.com', now()),
  ('00000000-0000-0000-0000-0000000000d1', 'fuera@x.com', now());
update perfiles set rol = 'administrador' where correo = 'admin3@x.com';

insert into equipos (id, nombre, creado_por) values
  ('20000000-0000-0000-0000-0000000000e1', 'Equipo 3', '00000000-0000-0000-0000-0000000000a1');
insert into miembros_equipo (equipo_id, usuario_id, rol) values
  ('20000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000b1', 'colaborador'),
  ('20000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000c1', 'observador');
insert into repositorios (id, usuario_id, url, nombre, equipo_id) values
  ('10000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1', 'https://github.com/e/tres', 'e/tres', '20000000-0000-0000-0000-0000000000e1');
insert into ramas_vigiladas (repositorio_id, rama, es_principal) values
  ('10000000-0000-0000-0000-0000000000e1', 'main', true);
insert into incidencias (id, repositorio_id, rama, huella, regla_id, archivo, severidad)
select ('30000000-0000-0000-0000-00000000000' || n)::uuid, '10000000-0000-0000-0000-0000000000e1', 'main', 'h' || n, 'B608', 'a.py', 'alto'
from generate_series(1, 5) n;

-- Nombres de rama peligrosos se rechazan.
do $$ begin
  insert into ramas_vigiladas (repositorio_id, rama) values ('10000000-0000-0000-0000-0000000000e1', '--upload-pack=x');
  raise exception 'FALLO: rama peligrosa aceptada';
exception when check_violation then null; end $$;

set role authenticated;

-- 1. Quien no es del equipo no ve nada.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', false);
do $$ begin
  if (select count(*) from incidencias) <> 0 then raise exception 'FALLO: intruso ve incidencias'; end if;
  if (select count(*) from ramas_vigiladas) <> 0 then raise exception 'FALLO: intruso ve ramas'; end if;
end $$;

-- 2. El observador lee, pero no actúa ni comenta.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', false);
do $$ begin
  if (select count(*) from incidencias) <> 5 then raise exception 'FALLO: observador no ve las incidencias'; end if;
  begin
    perform cambiar_estado('30000000-0000-0000-0000-000000000001', 'tomar');
    raise exception 'FALLO: observador tomo una incidencia';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  begin
    insert into comentarios (incidencia_id, texto) values ('30000000-0000-0000-0000-000000000001', 'hola');
    raise exception 'FALLO: observador comento';
  exception when insufficient_privilege then null; end;
end $$;

-- 3. El colaborador toma hasta el límite (3) y la cuarta falla.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', false);
do $$ begin
  perform cambiar_estado('30000000-0000-0000-0000-000000000001', 'tomar');
  perform cambiar_estado('30000000-0000-0000-0000-000000000002', 'tomar');
  perform cambiar_estado('30000000-0000-0000-0000-000000000003', 'tomar');
  begin
    perform cambiar_estado('30000000-0000-0000-0000-000000000004', 'tomar');
    raise exception 'FALLO: supero el limite de 3';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
    if sqlerrm not like 'Ya tienes 3%' then raise exception 'FALLO: mensaje inesperado: %', sqlerrm; end if;
  end;
  -- (004) el colaborador ya no puede liberar: solo el administrador
  begin
    perform cambiar_estado('30000000-0000-0000-0000-000000000003', 'liberar');
    raise exception 'FALLO: colaborador libero';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
    if sqlerrm not like 'Solo el administrador%' then raise exception 'FALLO: mensaje inesperado: %', sqlerrm; end if;
  end;
  -- pedir verificación pasa a revisión y deja un cupo libre
  if cambiar_estado('30000000-0000-0000-0000-000000000001', 'verificar') <> 'en_revision' then raise exception 'FALLO: verificar'; end if;
  perform cambiar_estado('30000000-0000-0000-0000-000000000004', 'tomar');
  -- no puede actuar sobre lo que no es suyo
  begin
    perform cambiar_estado('30000000-0000-0000-0000-000000000005', 'corregir');
    raise exception 'FALLO: corrigio algo no asignado';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  -- "No es una vulnerabilidad": con motivo corto falla; con motivo largo pasa a revisión del admin
  begin
    perform cambiar_estado('30000000-0000-0000-0000-000000000002', 'solicitar_descarte', 'corto');
    raise exception 'FALLO: descarte sin motivo';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  perform cambiar_estado('30000000-0000-0000-0000-000000000002', 'solicitar_descarte', 'Es una clave de prueba de los fixtures');
  if (select estado::text || descarte_solicitado::text from incidencias where id = '30000000-0000-0000-0000-000000000002') <> 'en_revisiontrue'
    then raise exception 'FALLO: el descarte no paso a revision'; end if;
  perform cambiar_estado('30000000-0000-0000-0000-000000000003', 'solicitar_descarte', 'Solo se usa en pruebas locales');
  -- no puede escribir directo en la tabla
  update incidencias set estado = 'resuelta' where id = '30000000-0000-0000-0000-000000000004';
  if (select estado from incidencias where id = '30000000-0000-0000-0000-000000000004') <> 'en_correccion' then raise exception 'FALLO: update directo'; end if;
  -- comenta y ve el historial
  insert into comentarios (incidencia_id, texto) values ('30000000-0000-0000-0000-000000000001', 'Ya lo cambié por el ORM');
  if (select count(*) from incidencia_eventos) < 7 then raise exception 'FALLO: faltan eventos (%)', (select count(*) from incidencia_eventos); end if;
end $$;

-- 4. El administrador asigna (solo a colaboradores) y resuelve el descarte.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false);
do $$ begin
  begin
    perform asignar_incidencia('30000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000000c1');
    raise exception 'FALLO: asigno a un observador';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  perform asignar_incidencia('30000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000000b1');
  -- aprobar: queda RESUELTA (motivo descartada); rechazar: vuelve a EN CORRECCIÓN
  perform resolver_descarte('30000000-0000-0000-0000-000000000002', true, 'De acuerdo');
  if (select estado::text || '/' || motivo_cierre::text from incidencias where id = '30000000-0000-0000-0000-000000000002') <> 'resuelta/descartada'
    then raise exception 'FALLO: aprobar no la dejo resuelta'; end if;
  perform resolver_descarte('30000000-0000-0000-0000-000000000003', false);
  if (select estado from incidencias where id = '30000000-0000-0000-0000-000000000003') <> 'en_correccion' then raise exception 'FALLO: rechazar'; end if;
  -- el admin libera (quita responsable): vuelve a abierta
  perform asignar_incidencia('30000000-0000-0000-0000-000000000003', null);
  if (select estado::text || coalesce(asignado_a::text, '-') from incidencias where id = '30000000-0000-0000-0000-000000000003') <> 'abierta-'
    then raise exception 'FALLO: el admin no libero'; end if;
end $$;

-- 5. Un colaborador no puede asignar ni resolver descartes.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', false);
do $$ begin
  perform asignar_incidencia('30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000b1');
  raise exception 'FALLO: colaborador asigno';
exception when others then if sqlerrm like 'FALLO%' then raise; end if; end $$;

-- 6. Quitar el repositorio: un colaborador no puede; quien lo vinculó sí, y se borra todo en cascada.
do $$ begin
  delete from repositorios where id = '10000000-0000-0000-0000-0000000000e1';
  if (select count(*) from incidencias) = 0 then raise exception 'FALLO: colaborador borro el repositorio'; end if;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false);
do $$ begin
  delete from repositorios where id = '10000000-0000-0000-0000-0000000000e1';
  reset role;
  if (select count(*) from incidencias where repositorio_id = '10000000-0000-0000-0000-0000000000e1') <> 0
    or (select count(*) from ramas_vigiladas where repositorio_id = '10000000-0000-0000-0000-0000000000e1') <> 0
    or (select count(*) from incidencia_eventos) <> 0 or (select count(*) from comentarios) <> 0
  then raise exception 'FALLO: quedaron datos del repositorio quitado'; end if;
end $$;

reset role;
select 'TODAS LAS PRUEBAS DE LA 003 PASARON' as resultado;
