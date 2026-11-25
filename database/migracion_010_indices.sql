-- =====================================================================
-- Migración 010 · Índices para las consultas más frecuentes
-- Solo agrega índices: no cambia datos ni permisos. Se puede ejecutar más de una vez.
-- Cómo usarla: Supabase > SQL Editor > New query > pegar todo > Run
-- =====================================================================

-- Panel general y «Mis análisis»: lista ordenada por fecha, filtrada por usuario.
create index if not exists analisis_iniciado on analisis (iniciado_en desc);
create index if not exists analisis_usuario_iniciado on analisis (solicitado_por, iniciado_en desc);

-- «¿Hay un análisis en curso?» (al crear uno, al re-analizar una rama y al arrancar el servicio).
create index if not exists analisis_en_curso on analisis (repositorio_id)
  where estado in ('pendiente', 'en_proceso');

-- Hallazgos de un análisis ordenados por gravedad (chat) y conteos por severidad (panel).
create index if not exists hallazgos_analisis_severidad on hallazgos (analisis_id, severidad desc, confianza desc);

-- «Disponibles para tomar» en Mi trabajo: abiertas y sin responsable.
create index if not exists incidencias_libres on incidencias (repositorio_id)
  where asignado_a is null and estado = 'abierta';

-- Última actividad de cada persona (pestaña Colaboradores).
create index if not exists eventos_actor on incidencia_eventos (actor_id, creado_en desc);
create index if not exists comentarios_autor on comentarios (autor_id, creado_en desc);

-- Rama de trabajo por repositorio (asignación sugerida y permisos de análisis).
create index if not exists miembro_ramas_repositorio on miembro_ramas (repositorio_id);

-- Invitaciones pendientes del correo de quien inicia sesión.
create index if not exists invitaciones_correo_pendiente on invitaciones (correo)
  where aceptada_en is null and revocada_en is null;

-- Historial del chat de un análisis en orden.
create index if not exists mensajes_conversacion_fecha on mensajes (conversacion_id, creado_en);
