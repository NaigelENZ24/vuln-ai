import { compartir } from './compartir.js'
import { supabase } from './supabaseClient.js'

const LIMITE = 500

async function contar(tabla, aplicar) {
  let consulta = supabase.from(tabla).select('id', { count: 'exact', head: true })
  if (aplicar) consulta = aplicar(consulta)
  const { count, error } = await consulta
  if (error) throw error
  return count ?? 0
}

export const obtenerResumen = compartir(async function obtenerResumen() {
  try {
    const [analisis, usuarios, hallazgos, altos] = await Promise.all([
      contar('analisis'),
      contar('perfiles'),
      contar('hallazgos'),
      contar('hallazgos', (q) => q.eq('severidad', 'alto')),
    ])
    return { data: { analisis, usuarios, hallazgos, altos } }
  } catch (error) {
    console.error('[admin] obtenerResumen', error)
    return { error }
  }
})

const n = (conteo) => conteo?.[0]?.count ?? 0

function aFila(a) {
  return {
    id: a.id,
    estado: a.estado,
    iniciadoEn: a.iniciado_en,
    consulta: a.consulta_nl ?? '',
    repo: a.repositorios?.nombre ?? a.repositorios?.url ?? '—',
    usuarioId: a.solicitado_por,
    usuario: a.perfiles?.nombre ?? '—',
    correo: a.perfiles?.correo ?? '',
    conteo: { critico: 0, alto: n(a.alto), medio: n(a.medio), bajo: n(a.bajo) },
    total: n(a.total),
  }
}

// usuarioId: solo los análisis de ese usuario (página "Mis análisis"); sin él, todos los que permita RLS (admin).
export const listarAnalisis = compartir(async function listarAnalisis({ usuarioId } = {}) {
  // La base cuenta los hallazgos (count) por severidad: no se descargan ni tienen el tope de 1000 filas.
  // Los filtros "alto.severidad"... solo afectan a ese conteo, no a la lista de análisis.
  let consulta = supabase
    .from('analisis')
    .select(
      'id, estado, iniciado_en, consulta_nl, solicitado_por, repositorios(url, nombre), perfiles!solicitado_por(nombre, correo), ' +
        'total:hallazgos(count), alto:hallazgos(count), medio:hallazgos(count), bajo:hallazgos(count)'
    )
    .eq('alto.severidad', 'alto')
    .eq('medio.severidad', 'medio')
    .eq('bajo.severidad', 'bajo')
  if (usuarioId) consulta = consulta.eq('solicitado_por', usuarioId)
  const { data, error } = await consulta.order('iniciado_en', { ascending: false }).limit(LIMITE)
  if (error) {
    console.error('[admin] listarAnalisis', error)
    return { error }
  }
  return { data: data.map(aFila) }
})

// Todos los usuarios registrados (la RLS de perfiles solo se lo permite al administrador).
export const listarUsuarios = compartir(async function listarUsuarios() {
  const { data, error } = await supabase.from('perfiles').select('id, nombre, correo').order('nombre')
  if (error) {
    console.error('[admin] listarUsuarios', error)
    return { error }
  }
  return { data }
})

// Solo las columnas que muestran las pantallas (antes se pedía todo con *).
const COLUMNAS_ANALISIS =
  'id, estado, iniciado_en, finalizado_en, commit_sha, version_bandit, modelo_llm, alcance, consulta_nl, resumen_ia, ' +
  'error_mensaje, archivos_analizados, lineas, segundos, repositorios(url, nombre, rama), perfiles!solicitado_por(nombre, correo)'
const COLUMNAS_HALLAZGO =
  'id, regla_id, titulo, categoria, cwe_id, archivo, linea, severidad, confianza, prioridad, estado, ' +
  'fragmento_codigo, explicacion_ia, recomendacion_ia'

// conHallazgos: false para la ficha del admin, que pagina los hallazgos aparte (listarHallazgos).
export const obtenerAnalisis = compartir(async function obtenerAnalisis(id, { conHallazgos = true } = {}) {
  const { data, error } = await supabase
    .from('analisis')
    .select(`${COLUMNAS_ANALISIS}, ${conHallazgos ? `hallazgos(${COLUMNAS_HALLAZGO})` : 'total:hallazgos(count)'}`)
    .eq('id', id)
    .maybeSingle()
  if (error) {
    console.error('[admin] obtenerAnalisis', error)
    return { error }
  }
  return { data }
})

// Mientras el análisis corre solo hace falta saber su estado: la consulta cada 3 s es mínima.
export const estadoAnalisis = compartir(async function estadoAnalisis(id) {
  const { data, error } = await supabase
    .from('analisis')
    .select('id, estado, error_mensaje, repositorios(url, nombre, rama)')
    .eq('id', id)
    .maybeSingle()
  if (error) {
    console.error('[admin] estadoAnalisis', error)
    return { error }
  }
  return { data }
})

// Una página de hallazgos, ya ordenada por gravedad en la base, con el total para la paginación.
export const listarHallazgos = compartir(async function listarHallazgos(analisisId, pagina, porPagina) {
  const desde = (pagina - 1) * porPagina
  const { data, error, count } = await supabase
    .from('hallazgos')
    .select(COLUMNAS_HALLAZGO, { count: 'exact' })
    .eq('analisis_id', analisisId)
    .order('severidad', { ascending: false })
    .order('confianza', { ascending: false })
    .order('id')
    .range(desde, desde + porPagina - 1)
  if (error) {
    console.error('[admin] listarHallazgos', error)
    return { error }
  }
  return { data: { filas: data, total: count ?? 0 } }
})
