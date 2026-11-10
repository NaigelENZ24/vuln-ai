import { supabase } from './supabaseClient.js'

const LIMITE = 500

async function contar(tabla, aplicar) {
  let consulta = supabase.from(tabla).select('id', { count: 'exact', head: true })
  if (aplicar) consulta = aplicar(consulta)
  const { count, error } = await consulta
  if (error) throw error
  return count ?? 0
}

export async function obtenerResumen() {
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
}

const n = (conteo) => conteo?.[0]?.count ?? 0

function aFila(a) {
  return {
    id: a.id,
    estado: a.estado,
    iniciadoEn: a.iniciado_en,
    consulta: a.consulta_nl ?? '',
    repo: a.repositorios?.nombre ?? a.repositorios?.url ?? '—',
    usuario: a.perfiles?.nombre ?? '—',
    correo: a.perfiles?.correo ?? '',
    conteo: { critico: 0, alto: n(a.alto), medio: n(a.medio), bajo: n(a.bajo) },
    total: n(a.total),
  }
}

// usuarioId: solo los análisis de ese usuario (página "Mis análisis"); sin él, todos los que permita RLS (admin).
export async function listarAnalisis({ usuarioId } = {}) {
  // La base cuenta los hallazgos (count) por severidad: no se descargan ni tienen el tope de 1000 filas.
  // Los filtros "alto.severidad"... solo afectan a ese conteo, no a la lista de análisis.
  let consulta = supabase
    .from('analisis')
    .select(
      'id, estado, iniciado_en, consulta_nl, repositorios(url, nombre), perfiles!solicitado_por(nombre, correo), ' +
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
}

export async function obtenerAnalisis(id) {
  const { data, error } = await supabase
    .from('analisis')
    .select('*, repositorios(url, nombre, rama), perfiles!solicitado_por(nombre, correo), hallazgos(*)')
    .eq('id', id)
    .maybeSingle()
  if (error) {
    console.error('[admin] obtenerAnalisis', error)
    return { error }
  }
  return { data }
}