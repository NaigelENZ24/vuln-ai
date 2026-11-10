import { ORDEN_NIVEL, claveUI, etiquetaNivel } from './severidad.js'

// Fila de la tabla hallazgos -> forma que usan ListaHallazgos y ResumenRiesgo.
export function aHallazgoUI(h) {
  return {
    ...h,
    severidad: claveUI(h.severidad),
    titulo: h.titulo ?? h.regla_id,
    ruta: h.linea ? `${h.archivo}:${h.linea}` : h.archivo,
    cwe: h.cwe_id ?? '—',
    categoria: h.categoria ?? 'Otros',
    nivelBase: h.severidad,
  }
}

export function riesgoGlobal(hallazgos) {
  if (hallazgos.length === 0) return { etiqueta: 'Sin hallazgos', severidad: 'baja' }
  const peor = hallazgos.reduce((a, b) => (ORDEN_NIVEL[b.nivelBase] < ORDEN_NIVEL[a.nivelBase] ? b : a))
  return { etiqueta: etiquetaNivel(peor.nivelBase), severidad: peor.severidad }
}
