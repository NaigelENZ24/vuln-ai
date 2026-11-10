import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { etiquetaNivel } from '../utils/severidad.js'

export default function HallazgoDetalle({ hallazgo, onCerrar }) {
  const titulo = useRef(null)

  useEffect(() => {
    titulo.current?.focus()
  }, [hallazgo.id])

  return (
    <section className="detalle-hallazgo" aria-labelledby="detalle-hallazgo-titulo">
      <div className="detalle-hallazgo__cabecera">
        <span className={`sev sev--${hallazgo.severidad}`}>{etiquetaNivel(hallazgo.nivelBase)}</span>
        <button type="button" className="detalle-hallazgo__cerrar" onClick={onCerrar} aria-label="Cerrar detalle">
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      <h2 id="detalle-hallazgo-titulo" ref={titulo} tabIndex={-1}>
        {hallazgo.titulo}
      </h2>
      <p className="detalle-hallazgo__meta">
        {hallazgo.ruta} · {hallazgo.regla_id} · {hallazgo.cwe} · Confianza {etiquetaNivel(hallazgo.confianza)} ·
        Prioridad {etiquetaNivel(hallazgo.prioridad)}
      </p>

      {hallazgo.fragmento_codigo && (
        <>
          <h3>Código afectado</h3>
          <pre>
            <code>{hallazgo.fragmento_codigo}</code>
          </pre>
        </>
      )}
      <h3>Explicación de la IA</h3>
      <p>{hallazgo.explicacion_ia || 'La IA no generó una explicación para este hallazgo.'}</p>
      <h3>Recomendación</h3>
      <p>{hallazgo.recomendacion_ia || 'Sin recomendación generada.'}</p>
    </section>
  )
}
