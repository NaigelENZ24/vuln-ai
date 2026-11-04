import { SEVERIDADES } from '../constants/severidades.js'

const A_UI = { critico: 'critica', alto: 'alta', medio: 'media', bajo: 'baja' }
const ETIQUETAS = Object.fromEntries(SEVERIDADES.map((s) => [s.clave, s.etiqueta]))

export const ORDEN_NIVEL = { critico: 0, alto: 1, medio: 2, bajo: 3 }

export const claveUI = (nivel) => A_UI[nivel] ?? 'baja'
export const etiquetaNivel = (nivel) => ETIQUETAS[claveUI(nivel)]

export function contarPorNivel(hallazgos = []) {
  const conteo = { critico: 0, alto: 0, medio: 0, bajo: 0 }
  for (const h of hallazgos) {
    if (h.severidad in conteo) conteo[h.severidad] += 1
  }
  return conteo
}