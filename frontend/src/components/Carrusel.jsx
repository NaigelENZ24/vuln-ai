import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

// Fila horizontal con flechas: muestra unas 5 tarjetas y avanza de página en página.
// También se puede deslizar con el dedo o el trackpad (desplazamiento nativo con snap).
export default function Carrusel({ titulo, cantidad, marca, nota, vacio, children }) {
  const pista = useRef(null)
  const [limites, setLimites] = useState({ inicio: true, fin: true })

  const medir = useCallback(() => {
    const el = pista.current
    if (!el) return
    setLimites({ inicio: el.scrollLeft <= 1, fin: el.scrollLeft + el.clientWidth >= el.scrollWidth - 1 })
  }, [])

  useEffect(() => {
    medir()
    const el = pista.current
    if (!el) return
    const observador = new ResizeObserver(medir)
    observador.observe(el)
    return () => observador.disconnect()
  }, [medir, cantidad])

  function mover(direccion) {
    const el = pista.current
    const suave = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollBy({ left: direccion * el.clientWidth, behavior: suave ? 'smooth' : 'auto' })
  }

  return (
    <section className="carrusel" aria-label={titulo}>
      <header className="carrusel__cabecera">
        <h2 className="carrusel__titulo">
          {marca}
          {titulo}
          <span className="carrusel__cantidad">{cantidad}</span>
        </h2>
        {nota && <span className="carrusel__nota">{nota}</span>}
        {cantidad > 0 && (
          <div className="carrusel__flechas">
            <button
              type="button"
              className="icono-btn icono-btn--chico"
              aria-label={`Anteriores: ${titulo}`}
              disabled={limites.inicio}
              onClick={() => mover(-1)}
            >
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="icono-btn icono-btn--chico"
              aria-label={`Siguientes: ${titulo}`}
              disabled={limites.fin}
              onClick={() => mover(1)}
            >
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          </div>
        )}
      </header>
      {cantidad === 0 ? (
        <p className="carrusel__vacio">{vacio}</p>
      ) : (
        <div ref={pista} className="carrusel__pista" onScroll={medir}>
          {children}
        </div>
      )}
    </section>
  )
}
