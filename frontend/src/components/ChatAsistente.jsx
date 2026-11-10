import { useEffect, useRef, useState } from 'react'
import { ArrowUp, Bot } from 'lucide-react'

const SUGERENCIAS = [
  '¿Qué debería corregir primero?',
  '¿Qué archivos concentran más riesgo?',
  '¿Qué problemas tiene el módulo de login?',
  '¿Hay secretos expuestos en el código?',
  'Explica las inyecciones detectadas',
]

// Un bloque de la respuesta; si su primera línea es un título corto ("Riesgo:"), se resalta.
function BloqueIA({ texto }) {
  const [primera, ...resto] = texto.split('\n')
  const esTitulo = resto.length > 0 && primera.length <= 60 && primera.trim().endsWith(':')
  return (
    <div className="msg msg--ia">
      {esTitulo ? (
        <>
          <strong className="msg__titulo">{primera.trim().slice(0, -1)}</strong>
          {resto.join('\n')}
        </>
      ) : (
        texto
      )}
    </div>
  )
}

export default function ChatAsistente({ habilitado = false, mensajes = [], onEnviar, error = '' }) {
  const [texto, setTexto] = useState('')
  const cuerpo = useRef(null)

  useEffect(() => {
    if (cuerpo.current) cuerpo.current.scrollTop = cuerpo.current.scrollHeight
  }, [mensajes])

  function enviar(e) {
    e.preventDefault()
    const pregunta = texto.trim()
    if (!pregunta || !habilitado) return
    onEnviar?.(pregunta)
    setTexto('')
  }

  return (
    <aside className="chat" aria-label="Asistente de vulnerabilidades">
      <div className="chat__cabecera">
        <Bot size={18} aria-hidden="true" />
        Asistente de vulnerabilidades
      </div>

      <div className="chat__cuerpo" ref={cuerpo} aria-live="polite">
        {mensajes.length === 0 ? (
          <>
            <p className="chat__intro">
              Consulta los hallazgos en lenguaje natural. El asistente explica y orienta, pero no
              modifica el código.
            </p>
            <div className="chat__sugerencias">
              {SUGERENCIAS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="chat__sugerencia"
                  disabled={!habilitado}
                  onClick={() => setTexto(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </>
        ) : (
          mensajes.map((m, i) =>
            m.rol === 'ia' ? (
              <div key={i} className="msg-ia">
                {m.texto.split(/\n\s*\n/).map((bloque, j) => (
                  <BloqueIA key={j} texto={bloque.trim()} />
                ))}
              </div>
            ) : (
              <div key={i} className={`msg msg--${m.rol}`}>
                {m.texto}
              </div>
            )
          )
        )}
      </div>

      <form className="chat__pie" onSubmit={enviar}>
        {error && (
          <p className="barra-repo__error" role="alert">
            {error}
          </p>
        )}
        <div className="chat__form">
          <input
            type="text"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={habilitado ? 'Pregunta sobre los hallazgos…' : 'Disponible cuando termine el análisis'}
            aria-label="Pregunta sobre los hallazgos"
            disabled={!habilitado}
          />
          <button
            className="chat__enviar"
            type="submit"
            disabled={!habilitado || !texto.trim()}
            aria-label="Enviar pregunta"
          >
            <ArrowUp size={18} aria-hidden="true" />
          </button>
        </div>
      </form>
    </aside>
  )
}