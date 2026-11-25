import { compartir } from './compartir.js'
import { supabase } from './supabaseClient.js'

export const INTEGRANTES = { '2-4': '2 a 4 personas', '5-10': '5 a 10 personas', 'mas-10': 'Más de 10 personas' }

function resultado({ data, error }, porDefecto, origen) {
  if (error) {
    console.error(`[solicitudes] ${origen}`, error)
    return { error: error.message?.includes('ya no está pendiente') ? 'Esa solicitud ya no está pendiente.' : porDefecto }
  }
  return { data }
}

// La última solicitud propia (para mostrar su estado en la landing). La RLS solo deja ver las propias.
export const miSolicitud = compartir(async function miSolicitud(usuarioId) {
  const r = await supabase
    .from('solicitudes_equipo')
    .select('id, nombre_equipo, estado, motivo, creada_en')
    .eq('solicitante', usuarioId)
    .order('creada_en', { ascending: false })
    .limit(1)
    .maybeSingle()
  return resultado(r, 'No se pudo consultar tu solicitud.', 'miSolicitud')
})

// Administrador: todas, con quién la pidió.
export const listarSolicitudes = compartir(async function listarSolicitudes() {
  const r = await supabase
    .from('solicitudes_equipo')
    .select('id, nombre_equipo, integrantes, equipos_solicitados, descripcion, estado, motivo, creada_en, resuelta_en, solicitante:perfiles!solicitante(nombre, correo)')
    .order('creada_en', { ascending: false })
    .limit(200)
  return resultado(r, 'No se pudieron cargar las solicitudes.', 'listarSolicitudes')
})

export const contarPendientes = compartir(async function contarPendientes() {
  const r = await supabase.from('solicitudes_equipo').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente')
  return r.error ? { data: 0 } : { data: r.count ?? 0 }
})

export async function aprobarSolicitud(id) {
  return resultado(await supabase.rpc('aprobar_solicitud', { p_solicitud: id }), 'No se pudo aprobar.', 'aprobar')
}

export async function rechazarSolicitud(id, motivo) {
  return resultado(await supabase.rpc('rechazar_solicitud', { p_solicitud: id, p_motivo: motivo || null }), 'No se pudo rechazar.', 'rechazar')
}
