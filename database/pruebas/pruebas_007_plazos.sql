-- Pruebas de la migración 007 (equipo 5 de las pruebas anteriores: altas m1, d1; medias m2, d2, abiertas).
\set ON_ERROR_STOP on
update incidencias set creada_en = '2026-01-01T00:00:00Z' where repositorio_id = '10000000-0000-0000-0000-0000000000e5';

set role authenticated;

-- Un no-admin no puede recalcular.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f6', false);
do $$ begin
  perform recalcular_plazos('20000000-0000-0000-0000-0000000000e5');
  raise exception 'FALLO: un no-admin recalculo plazos';
exception when others then if sqlerrm like 'FALLO%' then raise; end if; end $$;

-- El admin cambia los plazos (alta 3 días, media sin plazo) y recalcula las abiertas.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a5', false);
update equipos set plazo_alta_dias = 3, plazo_media_dias = null where id = '20000000-0000-0000-0000-0000000000e5';
do $$ begin
  if recalcular_plazos('20000000-0000-0000-0000-0000000000e5') <> 4 then raise exception 'FALLO: no recalculo las 4 abiertas'; end if;
  if (select fecha_limite from incidencias where huella = 'm1') <> '2026-01-04T00:00:00Z'::timestamptz
    then raise exception 'FALLO: plazo de la alta'; end if;
  if (select fecha_limite from incidencias where huella = 'm2') is not null then raise exception 'FALLO: la media deberia quedar sin plazo'; end if;
end $$;

reset role;
select 'TODAS LAS PRUEBAS DE LA 007 PASARON' as resultado;
