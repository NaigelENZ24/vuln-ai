alter table hallazgos add column if not exists titulo text;
alter table hallazgos add column if not exists categoria text;
alter table analisis add column if not exists archivos_analizados integer;
alter table analisis add column if not exists lineas integer;
alter table analisis add column if not exists segundos numeric;
alter table analisis add column if not exists error_mensaje text;