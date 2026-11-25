import { compartir } from './compartir.js'
import { supabase } from './supabaseClient.js'

// Mensajes claros para los errores que vienen de las reglas de la base.
function mensaje(error, porDefecto) {
  const texto = error?.message ?? ''
  if (texto.includes('ya es miembro')) return 'Esa persona ya es miembro del equipo.'
  if (texto.includes('no es válida o expiró')) return 'Esta invitación no es válida o expiró.'
  if (texto.includes('github_usuario')) return 'El usuario de GitHub solo puede tener letras, números y guiones.'
  if (texto.includes('equipos_nombre_check')) return 'El nombre debe tener entre 1 y 80 caracteres.'
  if (texto.includes('equipos que tienes aprobados')) return 'Ya usaste todos los equipos que tienes aprobados.'
  return porDefecto
}

function resultado({ data, error }, porDefecto, origen) {
  if (error) {
    console.error(`[equipos] ${origen}`, error)
    return { error: mensaje(error, porDefecto) }
  }
  return { data }
}

const n = (conteo) => conteo?.[0]?.count ?? 0

// ---------- Administrador ----------

export const listarEquipos = compartir(async function listarEquipos() {
  const r = await supabase
    .from('equipos')
    .select('id, nombre, descripcion, creado_en, creado_por, lider:perfiles!creado_por(nombre, rol), miembros:miembros_equipo(count), pendientes:invitaciones(count), repos:repositorios(count)')
    // Solo cuenta invitaciones pendientes; no filtra la lista de equipos.
    .is('pendientes.aceptada_en', null)
    .is('pendientes.revocada_en', null)
    .order('creado_en', { ascending: false })
  if (r.error) return resultado(r, 'No se pudieron cargar los equipos.', 'listarEquipos')
  return {
    data: r.data.map((e) => ({ ...e, miembros: n(e.miembros), pendientes: n(e.pendientes), repos: n(e.repos) })),
  }
})

// La base decide: el admin sin límite; el líder hasta su cupo aprobado.
export async function crearEquipo({ nombre, descripcion }) {
  const r = await supabase.rpc('crear_equipo', { p_nombre: nombre.trim(), p_descripcion: descripcion.trim() || null })
  return resultado({ data: r.data ? { id: r.data } : null, error: r.error }, 'No se pudo crear el equipo.', 'crearEquipo')
}

export const obtenerEquipo = compartir(async function obtenerEquipo(id) {
  const [equipo, miembros, invitaciones, repos] = await Promise.all([
    supabase.from('equipos').select('*').eq('id', id).maybeSingle(),
    supabase
      .from('miembros_equipo')
      .select('usuario_id, rol, github_usuario, unido_en, perfiles(nombre, correo), miembro_ramas(repositorio_id, rama_vigilada_id)')
      .eq('equipo_id', id)
      .order('unido_en'),
    supabase
      .from('invitaciones')
      .select('id, correo, rol, github_usuario, creada_en, vence_en')
      .eq('equipo_id', id)
      .is('aceptada_en', null)
      .is('revocada_en', null)
      .order('creada_en', { ascending: false }),
    supabase
      .from('repositorios')
      .select('id, nombre, ramas_vigiladas(id, rama, es_principal, ultimo_sha)')
      .eq('equipo_id', id)
      .order('nombre'),
  ])
  const fallo = equipo.error || miembros.error || invitaciones.error || repos.error
  if (fallo) return resultado({ error: fallo }, 'No se pudo cargar el equipo.', 'obtenerEquipo')
  return {
    data: { equipo: equipo.data, miembros: miembros.data, invitaciones: invitaciones.data, repos: repos.data },
  }
})

// Rama de trabajo de un colaborador en un repositorio. ramaId null = vuelve a la principal.
export async function asignarRama({ usuarioId, repositorioId, ramaId }) {
  const r = await supabase.rpc('asignar_rama', { p_usuario: usuarioId, p_repositorio: repositorioId, p_rama: ramaId || null })
  return resultado(r, 'No se pudo asignar la rama.', 'asignarRama')
}

export const colaboradoresDe = compartir(async function colaboradoresDe(equipoId) {
  const r = await supabase
    .from('miembros_equipo')
    .select('usuario_id, perfiles(nombre)')
    .eq('equipo_id', equipoId)
    .eq('rol', 'colaborador')
  if (r.error) return resultado(r, 'No se pudieron cargar los colaboradores.', 'colaboradoresDe')
  return { data: r.data.map((m) => ({ usuario_id: m.usuario_id, nombre: m.perfiles?.nombre ?? '—' })) }
})

// Devuelve el código una sola vez; en la base solo queda su hash.
export async function crearInvitacion({ equipoId, correo, rol, github }) {
  const r = await supabase.rpc('crear_invitacion', {
    p_equipo: equipoId,
    p_correo: correo.trim(),
    p_rol: rol,
    p_github: github.trim() || null,
  })
  return resultado(r, 'No se pudo crear la invitación.', 'crearInvitacion')
}

export async function revocarInvitacion(id) {
  const r = await supabase.from('invitaciones').update({ revocada_en: new Date().toISOString() }).eq('id', id)
  return resultado(r, 'No se pudo revocar la invitación.', 'revocarInvitacion')
}

// El nombre y el correo de un miembro son de su cuenta: el admin solo cambia rol y usuario de GitHub.
export async function actualizarMiembro({ equipoId, usuarioId, rol, github }) {
  const r = await supabase
    .from('miembros_equipo')
    .update({ rol, github_usuario: github.trim() || null })
    .eq('equipo_id', equipoId)
    .eq('usuario_id', usuarioId)
  return resultado(r, 'No se pudieron guardar los cambios.', 'actualizarMiembro')
}

export async function actualizarInvitacion({ id, rol, github }) {
  const r = await supabase
    .from('invitaciones')
    .update({ rol, github_usuario: github.trim() || null })
    .eq('id', id)
  return resultado(r, 'No se pudieron guardar los cambios.', 'actualizarInvitacion')
}

export async function quitarMiembro({ equipoId, usuarioId }) {
  const r = await supabase.from('miembros_equipo').delete().eq('equipo_id', equipoId).eq('usuario_id', usuarioId)
  return resultado(r, 'No se pudo quitar a la persona del equipo.', 'quitarMiembro')
}

// ---------- Persona con sesión ----------

export const misEquipos = compartir(async function misEquipos(usuarioId) {
  const r = await supabase
    .from('miembros_equipo')
    .select('equipo_id, rol, unido_en, equipos(nombre, descripcion, limite_en_correccion)')
    .eq('usuario_id', usuarioId)
    .order('unido_en')
  return resultado(r, 'No se pudieron cargar tus equipos.', 'misEquipos')
})

export const misInvitaciones = compartir(async function misInvitaciones() {
  const r = await supabase.rpc('mis_invitaciones')
  return resultado(r, 'No se pudieron cargar tus invitaciones.', 'misInvitaciones')
})

export async function aceptarInvitacion({ codigo = null, id = null }) {
  const r = await supabase.rpc('aceptar_invitacion', { p_codigo: codigo, p_id: id })
  return resultado(r, 'Esta invitación no es válida o expiró.', 'aceptarInvitacion')
}

export async function rechazarInvitacion(id) {
  const r = await supabase.rpc('rechazar_invitacion', { p_id: id })
  return resultado(r, 'No se pudo rechazar la invitación.', 'rechazarInvitacion')
}

export function enlaceInvitacion(codigo) {
  return `${window.location.origin}/invitacion/${codigo}`
}

// Reglas de recordatorio y de carga del equipo (columnas de equipos; la RLS solo deja al admin).
export async function actualizarReglas(equipoId, reglas) {
  const r = await supabase.from('equipos').update(reglas).eq('id', equipoId)
  return resultado(r, 'No se pudieron guardar las reglas.', 'actualizarReglas')
}

// Aplica los plazos actuales del equipo a sus incidencias abiertas. Devuelve cuántas cambió.
export async function recalcularPlazos(equipoId) {
  const r = await supabase.rpc('recalcular_plazos', { p_equipo: equipoId })
  return resultado(r, 'No se pudieron recalcular los plazos.', 'recalcularPlazos')
}

// Borra el equipo y sus repositorios con todo su historial, en una sola transacción. Solo el admin.
export async function eliminarEquipo(equipoId) {
  const r = await supabase.rpc('eliminar_equipo', { p_equipo: equipoId })
  return resultado(r, 'No se pudo eliminar el equipo.', 'eliminarEquipo')
}
