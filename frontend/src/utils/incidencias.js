import { ORDEN_NIVEL } from './severidad.js'

const DIA = 24 * 60 * 60 * 1000

// Texto del plazo: «Vence en 3 días», «Vence hoy», «Vencida hace 2 días». Las cerradas no vencen.
export function plazo(inc, ahora = Date.now()) {
  if (!inc.fecha_limite || ['resuelta', 'descartada'].includes(inc.estado)) return { texto: '', vencida: false }
  const dias = Math.ceil((new Date(inc.fecha_limite) - ahora) / DIA)
  if (dias < 0) return { texto: `Vencida hace ${-dias} día${dias === -1 ? '' : 's'}`, vencida: true }
  if (dias === 0) return { texto: 'Vence hoy', vencida: false }
  return { texto: `Vence en ${dias} día${dias === 1 ? '' : 's'}`, vencida: false }
}

// Plan de hoy: primero lo vencido, luego lo más grave, luego lo que vence antes.
export function ordenarPlan(lista, ahora = Date.now()) {
  return [...lista].sort(
    (a, b) =>
      Number(plazo(b, ahora).vencida) - Number(plazo(a, ahora).vencida) ||
      ORDEN_NIVEL[a.severidad] - ORDEN_NIVEL[b.severidad] ||
      new Date(a.fecha_limite ?? 8.64e15) - new Date(b.fecha_limite ?? 8.64e15)
  )
}

// Rama en la que trabaja alguien en un repositorio: la elegida por el admin, o la principal (igual que la base).
// elegidas: { repoId: nombreRama }, principales: { repoId: nombreRama }
export const ramaDeTrabajo = (repoId, elegidas, principales) => elegidas[repoId] ?? principales[repoId]

// Cómo se cerró una incidencia resuelta.
export function textoCierre(inc) {
  if (inc.motivo_cierre === 'descartada') return 'Resuelta por el administrador: no es una vulnerabilidad'
  if (inc.motivo_cierre === 'archivo_eliminado') return 'Ya no aparece: el archivo fue eliminado'
  const por = inc.corregida_por ? ` por @${inc.corregida_por.split(', ').join(', @')}` : ''
  return `Verificada en el commit ${inc.commit_correccion?.slice(0, 7) ?? 'del último análisis'}${por}`
}

export const ubicacion = (inc) => `${inc.archivo}${inc.linea_actual ? `:${inc.linea_actual}` : ''}`

const ABIERTAS = ['abierta', 'en_correccion', 'en_revision']

// Carga de una persona para la pestaña Colaboradores. incidencias: las del equipo (abiertas y resueltas recientes).
export function cargaDe(usuarioId, incidencias, { periodoDias, diasEstancada, ahora = Date.now() }) {
  const abiertas = incidencias.filter((i) => i.asignado_a === usuarioId && ABIERTAS.includes(i.estado))
  const desde = ahora - periodoDias * DIA
  const resueltas = incidencias.filter(
    (i) => i.asignado_a === usuarioId && i.estado === 'resuelta' && new Date(i.resuelta_en) >= desde
  )
  const conPlazo = resueltas.filter((i) => i.fecha_limite)
  return {
    alta: abiertas.filter((i) => i.severidad === 'alto').length,
    media: abiertas.filter((i) => i.severidad === 'medio').length,
    baja: abiertas.filter((i) => i.severidad === 'bajo').length,
    asignadas: abiertas.length,
    vencidas: abiertas.filter((i) => plazo(i, ahora).vencida).length,
    enCorreccion: abiertas.filter((i) => i.estado === 'en_correccion').length,
    estancadas: abiertas.filter(
      (i) => i.estado === 'en_correccion' && new Date(i.actualizada_en) < ahora - diasEstancada * DIA
    ),
    resueltas: resueltas.length,
    enPlazo: conPlazo.length
      ? Math.round((100 * conPlazo.filter((i) => new Date(i.resuelta_en) <= new Date(i.fecha_limite)).length) / conPlazo.length)
      : null,
  }
}

export const diasDesde = (fecha, ahora = Date.now()) => (fecha ? Math.floor((ahora - new Date(fecha)) / DIA) : null)
