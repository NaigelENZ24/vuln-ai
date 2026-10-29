import { Brain, TriangleAlert } from 'lucide-react'
import { SEVERIDADES } from '../constants/severidades.js'

export default function ResumenRiesgo({ hallazgos, riesgoGlobal, interpretacion, onReintentar }) {
  const total = hallazgos.length
  const conteo = Object.fromEntries(
    SEVERIDADES.map((s) => [s.clave, hallazgos.filter((h) => h.severidad === s.clave).length])
  )

  return (
    <section className="riesgo" aria-label="Resumen de riesgo">
      <div className="riesgo__global">
        <p className="riesgo__titulo">Riesgo global</p>
        <div className={`riesgo__nivel sev--${riesgoGlobal.severidad}`}>
          {riesgoGlobal.etiqueta}
        </div>
        <p className="riesgo__total">
          <strong>{total}</strong> hallazgos
        </p>
        <div className="barra-sev" role="img" aria-label="Distribución de hallazgos por severidad">
          {SEVERIDADES.filter((s) => conteo[s.clave] > 0).map((s) => (
            <span key={s.clave} className={`sev--${s.clave}`} style={{ flexGrow: conteo[s.clave] }} />
          ))}
        </div>
        <ul className="leyenda">
          {SEVERIDADES.map((s) => (
            <li key={s.clave} className={`sev--${s.clave}`}>
              <span className="leyenda__punto" />
              {s.etiqueta}
              <span className="leyenda__n">{conteo[s.clave]}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="riesgo__llm">
        <h2>
          <Brain size={18} aria-hidden="true" />
          Interpretación del LLM
        </h2>
        {interpretacion.estado === 'error' ? (
          <div className="riesgo__error" role="alert">
            <TriangleAlert size={18} aria-hidden="true" />
            <p>{interpretacion.mensaje}</p>
            <button type="button" onClick={onReintentar}>Reintentar</button>
          </div>
        ) : (
          <div className="riesgo__texto">
            {interpretacion.parrafos.map((texto, i) => (
              <p key={i}>{texto}</p>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}