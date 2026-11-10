import { supabase } from './supabaseClient.js'

export async function obtenerMensajes(analisisId, usuarioId) {
  const { data, error } = await supabase
    .from('conversaciones')
    .select('mensajes(autor, contenido, creado_en)')
    .eq('analisis_id', analisisId)
    .eq('usuario_id', usuarioId)
    .order('creado_en', { referencedTable: 'mensajes' })
    .order('autor', { referencedTable: 'mensajes' })
    .limit(1)
    .maybeSingle()
  if (error) {
    console.error('[analisis] obtenerMensajes', error)
    return { error }
  }
  return { data: (data?.mensajes ?? []).map((m) => ({ rol: m.autor, texto: m.contenido })) }
}
