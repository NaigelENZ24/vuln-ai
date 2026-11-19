-- Pruebas de la migración 006 (usa el equipo 5 que dejan las pruebas de la 005).
-- Abiertas del equipo 5: main m1 alta (en revisión), m2 media; dev d1 alta (en corrección), d2 media.
\set ON_ERROR_STOP on
update ramas_vigiladas set ultimo_sha = 'abc' where repositorio_id = '10000000-0000-0000-0000-0000000000e5';
insert into auth.users (id, email, email_confirmed_at) values ('00000000-0000-0000-0000-0000000000f6', 'fuera6@x.com', now());

set role authenticated;

-- 1. Métricas y semáforo para el admin.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a5', false);
do $$
declare m record; s record;
begin
  select * into m from metricas_equipo('20000000-0000-0000-0000-0000000000e5');
  if (m.abiertas_alta, m.abiertas_media, m.abiertas_baja, m.en_correccion, m.en_revision, m.vencidas) <> (2, 2, 0, 1, 1, 0)
    then raise exception 'FALLO: conteos %', m; end if;
  if m.puntaje <> 72 then raise exception 'FALLO: puntaje % (esperado 100 - 20 - 8 = 72)', m.puntaje; end if;
  select * into s from semaforo_ramas('20000000-0000-0000-0000-0000000000e5');
  if (s.rama_vigilada_id, s.nuevas_alta, s.nuevas_media, s.nuevas_baja, s.corregidas)
     <> ('40000000-0000-0000-0000-000000000052'::uuid, 1, 1, 0, 2)
    then raise exception 'FALLO: semaforo %', s; end if;
  perform actividad_equipo('20000000-0000-0000-0000-0000000000e5');
end $$;

-- 2. Alguien de fuera no ve métricas, semáforo ni registro, y nadie con sesión puede escribir la foto diaria.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f6', false);
do $$ begin
  begin
    perform metricas_equipo('20000000-0000-0000-0000-0000000000e5');
    raise exception 'FALLO: intruso vio metricas';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  begin
    perform registrar_metricas(null);
    raise exception 'FALLO: un usuario escribio la foto diaria';
  exception when insufficient_privilege then null; end;
end $$;

-- 3. El servicio registra la foto del día; repetirla el mismo día la actualiza.
reset role;
set role service_role;
select registrar_metricas(null);
select registrar_metricas('20000000-0000-0000-0000-0000000000e5');
reset role;
do $$ begin
  if (select puntaje from metricas_diarias where equipo_id = '20000000-0000-0000-0000-0000000000e5' and fecha = current_date) <> 72
    then raise exception 'FALLO: foto diaria'; end if;
  if (select count(*) from metricas_diarias where equipo_id = '20000000-0000-0000-0000-0000000000e5') <> 1
    then raise exception 'FALLO: duplico la foto del dia'; end if;
end $$;

-- 4. Registro de correos: el admin lo ve; cada persona solo lo suyo.
insert into notificaciones (equipo_id, usuario_id, tipo, resultado) values
  ('20000000-0000-0000-0000-0000000000e5', '00000000-0000-0000-0000-0000000000f6', 'recordatorio', 'enviado'),
  ('20000000-0000-0000-0000-0000000000e5', null, 'escalamiento', 'enviado');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f6', false);
do $$ begin
  if (select count(*) from notificaciones) <> 1 then raise exception 'FALLO: ve avisos ajenos'; end if;
  if (select count(*) from metricas_diarias) <> 0 then raise exception 'FALLO: intruso ve la tendencia'; end if;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a5', false);
do $$ begin
  if (select count(*) from notificaciones) <> 2 then raise exception 'FALLO: el admin no ve el registro'; end if;
end $$;

reset role;
select 'TODAS LAS PRUEBAS DE LA 006 PASARON' as resultado;
