import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, HelpCircle, X } from 'lucide-react'
import '../styles/tutorial.css'

// Pasos del recorrido. "objetivo" es el data-tutorial del elemento que se señala; "tab" la pestaña donde vive.
const PASOS = [
  {
    titulo: 'Bienvenido a tu equipo',
    texto: 'Te mostramos en 4 pasos cómo empezar. Puedes salir cuando quieras y repasarlo luego con el botón «?» de la esquina.',
  },
  {
    tab: 'resumen',
    objetivo: 'vincular',
    titulo: '1. Vincula tu repositorio',
    texto: 'Pega aquí la URL del repositorio público de GitHub de tu proyecto. Centinela lo analizará y creará las incidencias.',
  },
  {
    tab: 'colaboradores',
    objetivo: 'invitar',
    titulo: '2. Invita a tu equipo',
    texto: 'Invita a cada colaborador por correo o comparte el enlace. Al aceptar, verán su trabajo en «Mi trabajo».',
  },
  {
    objetivo: 'tab-seguimiento',
    titulo: '3. Sigue y asigna',
    texto: 'En Seguimiento aparecen las vulnerabilidades encontradas. Asígnalas a tus colaboradores y revisa cómo avanzan.',
  },
  {
    objetivo: 'tab-configuracion',
    titulo: '4. Ajusta las reglas',
    texto: 'En el engranaje defines los plazos por severidad, la carga de trabajo y los recordatorios por correo. ¡Listo para empezar!',
  },
]

const MARGEN = 8 // aire alrededor del elemento resaltado
const ANCHO_GLOBO = 340

const clave = (usuarioId) => `centinela.tutorial-equipo.${usuarioId}`

// localStorage puede fallar (modo privado, almacenamiento bloqueado): sin él, el tutorial simplemente no se recuerda.
export function tutorialVisto(usuarioId) {
  try {
    return localStorage.getItem(clave(usuarioId)) === '1'
  } catch {
    return false
  }
}

function marcarVisto(usuarioId) {
  try {
    localStorage.setItem(clave(usuarioId), '1')
  } catch {
    /* sin almacenamiento: no pasa nada */
  }
}

// Espera a que el elemento exista (las pestañas cargan datos antes de pintarlo), máximo ~2 s.
function esperarElemento(objetivo, alEncontrar) {
  let intentos = 0
  let id
  const buscar = () => {
    const el = document.querySelector(`[data-tutorial="${objetivo}"]`)
    if (el || intentos++ > 120) alEncontrar(el)
    else id = requestAnimationFrame(buscar)
  }
  buscar()
  return () => cancelAnimationFrame(id)
}

export default function TutorialEquipo({ usuarioId, abierto, onCerrar, cambiarTab }) {
  const [paso, setPaso] = useState(0)
  const [caja, setCaja] = useState(null) // rectángulo del elemento resaltado, o null (bienvenida o no encontrado)
  const botonRef = useRef(null)
  const actual = PASOS[paso]

  const cerrar = useCallback(() => {
    marcarVisto(usuarioId)
    setPaso(0)
    onCerrar()
  }, [usuarioId, onCerrar])

  // Cambia de pestaña si hace falta y ubica el elemento del paso.
  useEffect(() => {
    if (!abierto) return
    setCaja(null)
    if (actual.tab) cambiarTab(actual.tab)
    if (!actual.objetivo) return
    let elemento = null
    const medir = () => {
      if (!elemento) return
      const r = elemento.getBoundingClientRect()
      setCaja({ top: r.top - MARGEN, left: r.left - MARGEN, width: r.width + MARGEN * 2, height: r.height + MARGEN * 2 })
    }
    const cancelar = esperarElemento(actual.objetivo, (el) => {
      elemento = el
      if (!el) return
      el.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
      medir()
      setTimeout(medir, 350) // tras el desplazamiento suave
    })
    window.addEventListener('resize', medir)
    window.addEventListener('scroll', medir, true)
    return () => {
      cancelar()
      window.removeEventListener('resize', medir)
      window.removeEventListener('scroll', medir, true)
    }
  }, [abierto, paso, actual, cambiarTab])

  // Teclado: flechas para moverse, Esc para salir.
  useEffect(() => {
    if (!abierto) return
    const alPulsar = (e) => {
      if (e.key === 'Escape') cerrar()
      else if (e.key === 'ArrowRight') setPaso((p) => Math.min(p + 1, PASOS.length - 1))
      else if (e.key === 'ArrowLeft') setPaso((p) => Math.max(p - 1, 0))
    }
    window.addEventListener('keydown', alPulsar)
    return () => window.removeEventListener('keydown', alPulsar)
  }, [abierto, cerrar])

  useLayoutEffect(() => {
    if (abierto) botonRef.current?.focus()
  }, [abierto, paso, caja])

  if (!abierto) return null

  const ultimo = paso === PASOS.length - 1
  const ancho = Math.min(ANCHO_GLOBO, window.innerWidth - 32)
  // Globo debajo del elemento si cabe; si no, encima. Sin elemento: centrado.
  let posGlobo = null
  if (caja) {
    const abajo = caja.top + caja.height + 14
    const cabeAbajo = abajo + 220 < window.innerHeight
    posGlobo = {
      top: cabeAbajo ? abajo : Math.max(16, caja.top - 14 - 220),
      left: Math.min(Math.max(16, caja.left + caja.width / 2 - ancho / 2), window.innerWidth - ancho - 16),
      width: ancho,
    }
  }

  return (
    <div className="tut" role="presentation">
      {caja ? (
        <>
          {/* Cuatro paneles desenfocados alrededor del hueco: el elemento queda nítido. */}
          <div className="tut__velo" style={{ top: 0, left: 0, right: 0, height: Math.max(0, caja.top) }} />
          <div className="tut__velo" style={{ top: caja.top + caja.height, left: 0, right: 0, bottom: 0 }} />
          <div className="tut__velo" style={{ top: caja.top, left: 0, width: Math.max(0, caja.left), height: caja.height }} />
          <div className="tut__velo" style={{ top: caja.top, left: caja.left + caja.width, right: 0, height: caja.height }} />
          <div className="tut__foco" style={caja} aria-hidden="true" />
        </>
      ) : (
        <div className="tut__velo" style={{ inset: 0 }} />
      )}

      <div
        className={`tut__globo ${caja ? '' : 'tut__globo--centro'}`}
        style={posGlobo ?? undefined}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tut-titulo"
        aria-describedby="tut-texto"
      >
        <div className="tut__cabecera">
          <span className="tut__contador">
            Paso {paso + 1} de {PASOS.length}
          </span>
          <button type="button" className="tut__x" aria-label="Salir del tutorial" onClick={cerrar}>
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <h2 id="tut-titulo">{actual.titulo}</h2>
        <p id="tut-texto">{actual.texto}</p>
        <div className="tut__puntos" aria-hidden="true">
          {PASOS.map((_, i) => (
            <span key={i} className={`tut__punto ${i === paso ? 'tut__punto--activo' : ''}`} />
          ))}
        </div>
        <div className="tut__acciones">
          {paso > 0 ? (
            <button type="button" className="tut__btn" onClick={() => setPaso(paso - 1)}>
              <ArrowLeft size={16} aria-hidden="true" />
              Anterior
            </button>
          ) : (
            <button type="button" className="tut__btn tut__btn--texto" onClick={cerrar}>
              Saltar
            </button>
          )}
          <button
            ref={botonRef}
            type="button"
            className="btn-primario tut__siguiente"
            onClick={() => (ultimo ? cerrar() : setPaso(paso + 1))}
          >
            {ultimo ? 'Terminar' : paso === 0 ? 'Empezar' : 'Siguiente'}
            {!ultimo && <ArrowRight size={16} aria-hidden="true" />}
          </button>
        </div>
      </div>
    </div>
  )
}

// Botón «?» de la esquina: pregunta si quiere repasar el tutorial.
export function BotonRepasar({ onRepasar }) {
  const [preguntando, setPreguntando] = useState(false)
  return (
    <div className="tut-ayuda">
      {preguntando && (
        <div className="tut-ayuda__pregunta" role="dialog" aria-label="Repasar el tutorial">
          <p>¿Quieres volver a repasar las opciones de tu equipo?</p>
          <div className="tut-ayuda__botones">
            <button
              type="button"
              className="tut-ayuda__si"
              aria-label="Sí, repasar"
              onClick={() => {
                setPreguntando(false)
                onRepasar()
              }}
            >
              <Check size={16} aria-hidden="true" />
            </button>
            <button type="button" className="tut-ayuda__no" aria-label="No, cerrar" onClick={() => setPreguntando(false)}>
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
      <button
        type="button"
        className="tut-ayuda__boton"
        aria-label="Ayuda: repasar el tutorial del equipo"
        aria-expanded={preguntando}
        onClick={() => setPreguntando((v) => !v)}
      >
        <HelpCircle size={22} aria-hidden="true" />
      </button>
    </div>
  )
}
