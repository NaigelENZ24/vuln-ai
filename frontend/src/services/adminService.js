import { supabase } from './supabaseClient.js'
import { contarPorNivel } from '../utils/severidad.js'

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

function aFila(a) {
  return {
    id: a.id,
    estado: a.estado,
    iniciadoEn: a.iniciado_en,
    consulta: a.consulta_nl ?? '',
    repo: a.repositorios?.nombre ?? a.repositorios?.url ?? '—',
    usuario: a.perfiles?.nombre ?? '—',
    correo: a.perfiles?.correo ?? '',
    conteo: contarPorNivel(a.hallazgos),
    total: a.hallazgos?.length ?? 0,
  }
}

export async function listarAnalisis() {
  const { data, error } = await supabase
    .from('analisis')
    .select(
      'id, estado, iniciado_en, consulta_nl, repositorios(url, nombre), perfiles!solicitado_por(nombre, correo), hallazgos(severidad)'
    )
    .order('iniciado_en', { ascending: false })
    .limit(LIMITE)
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