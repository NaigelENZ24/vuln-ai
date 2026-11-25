#!/usr/bin/env bash
# Prueba las migraciones en un Postgres desechable (Docker) que simula lo mínimo de Supabase.
# Uso, desde la carpeta database/:  bash pruebas/probar.sh
set -e
export MSYS_NO_PATHCONV=1
cd "$(dirname "$0")/.."
docker rm -f pg-centinela >/dev/null 2>&1 || true
docker run -d --name pg-centinela -e POSTGRES_PASSWORD=x -v "$PWD:/d:ro" postgres:16 >/dev/null
trap 'docker rm -f pg-centinela >/dev/null' EXIT
until docker exec pg-centinela pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done; sleep 2
q() { docker exec pg-centinela psql -U postgres -v ON_ERROR_STOP=1 -q "$@"; }
q -f /d/pruebas/00_supabase_simulado.sql -f /d/schema.sql -f /d/migracion_001_analisis.sql \
  -f /d/migracion_002_equipos.sql -f /d/migracion_003_incidencias.sql -f /d/migracion_004_revision_admin.sql -f /d/migracion_005_ramas_colaborador.sql -f /d/migracion_006_panel_recordatorios.sql -f /d/migracion_007_plazos.sql -f /d/migracion_008_asistente_equipo.sql -f /d/migracion_009_eliminar_equipo.sql -f /d/migracion_010_indices.sql -f /d/migracion_011_lideres_equipo.sql
# idempotencia: se pueden volver a ejecutar sin error
q -c "set search_path=public,extensions" -f /d/migracion_002_equipos.sql -f /d/migracion_003_incidencias.sql -f /d/migracion_004_revision_admin.sql -f /d/migracion_005_ramas_colaborador.sql -f /d/migracion_006_panel_recordatorios.sql -f /d/migracion_007_plazos.sql -f /d/migracion_008_asistente_equipo.sql -f /d/migracion_009_eliminar_equipo.sql -f /d/migracion_010_indices.sql -f /d/migracion_011_lideres_equipo.sql
q -f /d/pruebas/pruebas_002_equipos.sql
q -f /d/pruebas/pruebas_003_incidencias.sql
q -f /d/pruebas/pruebas_005_ramas.sql
q -f /d/pruebas/pruebas_006_panel.sql
q -f /d/pruebas/pruebas_007_plazos.sql
q -f /d/pruebas/pruebas_008_asistente.sql
q -f /d/pruebas/pruebas_009_eliminar_equipo.sql
q -f /d/pruebas/pruebas_011_lideres.sql
