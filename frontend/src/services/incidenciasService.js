import { compartir } from './compartir.js'
import { supabase } from './supabaseClient.js'

function resultado({ data, error }, porDefecto, origen) {
  if (error) {
    console.error(`[incidencias] ${origen}`, error)
    // Los mensajes de las funciones de la base ya están escritos para el usuario.
    return { error: error.code === 'P0001' ? error.message : porDefecto }
  }
  return { data }
}

const CAMPOS =
  'id, repositorio_id, rama, regla_id, titulo, archivo, linea_actual, severidad, estado, motivo_cierre, ' +
  'asignado_a, sugerido_a, fecha_limite, descarte_solicitado, motivo_descarte, veces_reabierta, ' +
  'commit_correccion, corregida_por, resuelta_en, creada_en, actualizada_en, ' +
  'repositorios!inner(nombre, equipo_id, equipos(creado_por)), asignado:perfiles!asignado_a(nombre), sugerido:perfiles!sugerido_a(nombre)'

// ---------- Repositorios y ramas de un equipo ----------
export const listarRamas = compartir(async function listarRamas(equipoId) {
  const repos = await supabase
    .from('repositorios')
    .select('id, nombre, url, ramas_vigiladas(id, rama, es_principal, ultimo_sha)')
    .eq('equipo_id', equipoId)
    .order('nombre')
  if (repos.error) return resultado(repos, 'No se pudieron cargar los repositorios.', 'listarRamas')
  const ids = repos.data.flatMap((r) => r.ramas_vigiladas.map((v) => v.id))
  const ultimos = {}
  if (ids.length) {
    const a = await supabase
      .from('analisis')
      .select('id, estado, iniciado_en, finalizado_en, error_mensaje, rama_vigilada_id')
      .in('rama_vigilada_id', ids)
      .order('iniciado_en', { ascending: false })
      .limit(200)
    if (a.error) return resultado(a, 'No se pudieron cargar los análisis.', 'listarRamas')
    for (const fila of a.data) ultimos[fila.rama_vigilada_id] ??= fila
  }
  return {
    data: repos.data.map((r) => ({
      ...r,
      ramas_vigiladas: [...r.ramas_vigiladas]
        .sort((x, y) => Number(y.es_principal) - Number(x.es_principal) || x.rama.localeCompare(y.rama))
        .map((v) => ({ ...v, ultimo: ultimos[v.id] ?? null })),
    })),
  }
})

// Borra el repositorio con sus ramas, análisis e incidencias (cascada en la base).
// La RLS solo deja borrarlo a quien lo vinculó; .select() devuelve vacío si no lo borró.
export async function quitarRepositorio(id) {
  const r = await supabase.from('repositorios').delete().eq('id', id).select('id')
  if (!r.error && r.data.length === 0) return { error: 'Solo el administrador que vinculó el repositorio puede quitarlo.' }
  return resultado(r, 'No se pudo quitar el repositorio.', 'quitarRepositorio')
}

// ---------- Incidencias ----------
// Abiertas, en corrección y en revisión, más las resueltas de los últimos «dias» días.
export const listarIncidenciasEquipo = compartir(async function listarIncidenciasEquipo(equipoId, dias = 30) {
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString()
  const r = await supabase
    .from('incidencias')
    .select(CAMPOS)
    .eq('repositorios.equipo_id', equipoId)
    .or(`estado.in.(abierta,en_correccion,en_revision),resuelta_en.gte."${desde}"`)
    .order('actualizada_en', { ascending: false })
    // shortcut: tope de 1000 de Supabase; paginar si un equipo pasa de 1000 incidencias activas.
    .limit(1000)
  return resultado(r, 'No se pudieron cargar las incidencias.', 'listarIncidenciasEquipo')
})

// Lo asignado a la persona y lo que nadie tomó en sus equipos (la RLS limita a sus equipos).
export const listarMiTrabajo = compartir(async function listarMiTrabajo(usuarioId) {
  const [mias, libres, elegidas, principales] = await Promise.all([
    supabase.from('incidencias').select(CAMPOS).eq('asignado_a', usuarioId)
      .in('estado', ['abierta', 'en_correccion', 'en_revision']),
    supabase.from('incidencias').select(CAMPOS).is('asignado_a', null).eq('estado', 'abierta').limit(200),
    supabase.from('miembro_ramas').select('repositorio_id, ramas_vigiladas(rama)').eq('usuario_id', usuarioId),
    supabase.from('ramas_vigiladas').select('repositorio_id, rama, repositorios(nombre, equipo_id)').eq('es_principal', true),
  ])
  const fallo = mias.error || libres.error || elegidas.error || principales.error
  if (fallo) return resultado({ error: fallo }, 'No se pudo cargar tu trabajo.', 'listarMiTrabajo')
  return {
    data: {
      mias: mias.data,
      libres: libres.data,
      // { repoId: rama } elegida por el admin y principal de cada repositorio de sus equipos
      elegidas: Object.fromEntries(elegidas.data.map((e) => [e.repositorio_id, e.ramas_vigiladas.rama])),
      principales: Object.fromEntries(principales.data.map((p) => [p.repositorio_id, p.rama])),
      repos: Object.fromEntries(principales.data.map((p) => [p.repositorio_id, p.repositorios?.nombre])),
      equipoDe: Object.fromEntries(principales.data.map((p) => [p.repositorio_id, p.repositorios?.equipo_id])),
    },
  }
})

export const obtenerIncidencia = compartir(async function obtenerIncidencia(id) {
  const [inc, eventos, comentarios] = await Promise.all([
    supabase
      .from('incidencias')
      .select(`${CAMPOS}, categoria, cwe_id, fragmento_codigo, explicacion_ia, recomendacion_ia`)
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('incidencia_eventos')
      .select('id, tipo, estado_anterior, estado_nuevo, nota, creado_en, actor_id, actor:perfiles(nombre)')
      .eq('incidencia_id', id)
      .order('creado_en', { ascending: false }),
    supabase
      .from('comentarios')
      .select('id, texto, creado_en, autor_id, autor:perfiles(nombre)')
      .eq('incidencia_id', id)
      .order('creado_en'),
  ])
  const fallo = inc.error || eventos.error || comentarios.error
  if (fallo) return resultado({ error: fallo }, 'No se pudo cargar la incidencia.', 'obtenerIncidencia')
  if (!inc.data) return { data: null }
  const rama = await supabase
    .from('ramas_vigiladas')
    .select('id')
    .eq('repositorio_id', inc.data.repositorio_id)
    .eq('rama', inc.data.rama)
    .maybeSingle()
  return {
    data: { ...inc.data, ramaId: rama.data?.id ?? null, eventos: eventos.data, comentarios: comentarios.data },
  }
})

// accion: tomar · corregir · liberar · verificar · solicitar_descarte
export async function cambiarEstado(id, accion, nota = null) {
  const r = await supabase.rpc('cambiar_estado', { p_incidencia: id, p_accion: accion, p_nota: nota })
  return resultado(r, 'No se pudo actualizar la incidencia.', 'cambiarEstado')
}

export async function asignarIncidencia(id, usuarioId) {
  const r = await supabase.rpc('asignar_incidencia', { p_incidencia: id, p_usuario: usuarioId || null })
  return resultado(r, 'No se pudo asignar la incidencia.', 'asignarIncidencia')
}

export async function resolverDescarte(id, aprobar) {
  const r = await supabase.rpc('resolver_descarte', { p_incidencia: id, p_aprobar: aprobar })
  return resultado(r, 'No se pudo resolver la solicitud.', 'resolverDescarte')
}

export async function comentar(id, texto) {
  const r = await supabase.from('comentarios').insert({ incidencia_id: id, texto: texto.trim() })
  return resultado(r, 'No se pudo guardar el comentario.', 'comentar')
}

// ---------- Panel del equipo (fase 3) ----------
// Conteos, puntaje, tiempo medio y % en plazo: los calcula la base con la misma fórmula de la foto diaria.
export const metricasEquipo = compartir(async function metricasEquipo(equipoId) {
  const r = await supabase.rpc('metricas_equipo', { p_equipo: equipoId }).single()
  return resultado(r, 'No se pudieron calcular las métricas.', 'metricasEquipo')
})

// { ramaVigiladaId: { nuevas_alta, nuevas_media, nuevas_baja, corregidas } } frente a la rama principal.
export const semaforoRamas = compartir(async function semaforoRamas(equipoId) {
  const r = await supabase.rpc('semaforo_ramas', { p_equipo: equipoId })
  if (r.error) return resultado(r, 'No se pudo calcular el semáforo.', 'semaforoRamas')
  return { data: Object.fromEntries(r.data.map((s) => [s.rama_vigilada_id, s])) }
})

// { usuarioId: fecha } de la última vez que cambió o comentó algo del equipo.
export const actividadEquipo = compartir(async function actividadEquipo(equipoId) {
  const r = await supabase.rpc('actividad_equipo', { p_equipo: equipoId })
  if (r.error) return resultado(r, 'No se pudo cargar la actividad.', 'actividadEquipo')
  return { data: Object.fromEntries(r.data.map((a) => [a.usuario_id, a.ultima])) }
})

export const listarNotificaciones = compartir(async function listarNotificaciones(equipoId, dias = 90) {
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString()
  const r = await supabase
    .from('notificaciones')
    .select('id, usuario_id, correo, tipo, asunto, resumen, resultado, detalle, creado_en, perfiles(nombre)')
    .eq('equipo_id', equipoId)
    .gte('creado_en', desde)
    .order('creado_en', { ascending: false })
    .limit(300)
  return resultado(r, 'No se pudo cargar el registro de envíos.', 'listarNotificaciones')
})

// Conversación del asistente IA del equipo (la RLS solo deja leerla al administrador).
export const obtenerChatEquipo = compartir(async function obtenerChatEquipo(equipoId) {
  const r = await supabase
    .from('chat_equipo')
    .select('autor, contenido, creado_en')
    .eq('equipo_id', equipoId)
    .order('creado_en')
    .order('autor')
    .limit(200)
  if (r.error) return resultado(r, 'No se pudo cargar la conversación.', 'obtenerChatEquipo')
  return { data: r.data.map((m) => ({ rol: m.autor, texto: m.contenido, creado_en: m.creado_en })) }
})
