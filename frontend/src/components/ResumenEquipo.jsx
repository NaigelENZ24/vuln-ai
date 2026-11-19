import { useEffect, useState } from 'react'
import RepositoriosEquipo from './RepositoriosEquipo.jsx'
import { metricasEquipo } from '../services/incidenciasService.js'

// Tramos del puntaje: el texto acompaña siempre al color.
const tramo = (p) =>
  p >= 80
    ? { texto: 'Bueno', color: 'var(--accent)' }
    : p >= 50
      ? { texto: 'Atención', color: 'var(--sev-media)' }
      : { texto: 'En riesgo', color: 'var(--sev-critica)' }

export default function ResumenEquipo({ equipoId }) {
  const [m, setM] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let activo = true
    metricasEquipo(equipoId).then(({ data, error: fallo }) => {
      if (!activo) return
      if (fallo) setError(fallo)
      else setM(data)
    })
    return () => {
      activo = false
    }
  }, [equipoId])

  const t = m && tramo(m.puntaje)

  return (
    <>
      {error && (
        <p className="panel__aviso panel__aviso--suelto" role="alert">
          {error}
        </p>
      )}
      {m && (
        <section className="kpis" aria-label="Indicadores del equipo">
          <div className="kpi" style={{ '--c': t.color }}>
            <p className="kpi__etiqueta">Puntaje de seguridad</p>
            <p className="kpi__valor" style={{ color: t.color }}>
              {m.puntaje}
            </p>
            <p className="kpi__detalle">
              <span className="sev" style={{ '--c': t.color }}>
                {t.texto}
              </span>
            </p>
          </div>
          <div className="kpi" style={{ '--c': 'var(--sev-alta)' }}>
            <p className="kpi__etiqueta">Incidencias abiertas</p>
            <p className="kpi__valor">{m.abiertas_alta + m.abiertas_media + m.abiertas_baja}</p>
            <p className="kpi__detalle">
              {m.abiertas_alta} altas · {m.abiertas_media} medias · {m.abiertas_baja} bajas
            </p>
          </div>
          <div className="kpi" style={{ '--c': 'var(--sev-media)' }}>
            <p className="kpi__etiqueta">En corrección</p>
            <p className="kpi__valor">{m.en_correccion}</p>
            <p className="kpi__detalle">{m.en_revision} en revisión</p>
          </div>
          <div className="kpi" style={{ '--c': 'var(--accent)' }}>
            <p className="kpi__etiqueta">Resueltas en 30 días</p>
            <p className="kpi__valor">{m.resueltas_30d}</p>
            <p className="kpi__detalle">
              {m.en_plazo_pct === null ? 'Sin datos de plazo' : `${m.en_plazo_pct} % dentro del plazo`}
            </p>
          </div>
          <div className="kpi" style={{ '--c': 'var(--sev-baja)' }}>
            <p className="kpi__etiqueta">Tiempo medio de corrección</p>
            <p className="kpi__valor">
              {m.tiempo_medio_dias === null ? '—' : `${String(m.tiempo_medio_dias).replace('.', ',')} d`}
            </p>
            <p className="kpi__detalle">{m.vencidas} vencidas ahora</p>
          </div>
        </section>
      )}

      <RepositoriosEquipo equipoId={equipoId} />
    </>
  )
}
