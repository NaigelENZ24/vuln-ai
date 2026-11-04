export function formatearFecha(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-EC', { dateStyle: 'medium', timeStyle: 'short' })
}