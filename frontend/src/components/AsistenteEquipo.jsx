import { useEffect, useState } from 'react'
import ChatAsistente from './ChatAsistente.jsx'
import { obtenerChatEquipo } from '../services/incidenciasService.js'
import { preguntarEquipo } from '../services/analyzerApi.js'
import '../styles/analisis.css'

const MAX_DIA = 20 // igual que MAX_ASISTENTE_DIA en el servicio
const SUGERENCIAS = [
  '¿Quién tiene más altas vencidas?',
  '¿Qué rama está peor y por qué?',
  '¿Qué se resolvió esta semana y quién lo hizo?',
  '¿Hay algo estancado que deba reasignar?',
  'Resume cómo va el equipo en dos frases',
]
const TEMAS = [
  ['Personas', 'carga, vencidas, estancadas, en qué rama trabaja cada una y qué resolvió.'],
  ['Ramas', 'incidencias abiertas, vencidas y su semáforo frente a la principal.'],
  ['Incidencias', 'las abiertas con su responsable y plazo, y las resueltas de los últimos 30 días.'],
  ['Gestión', 'qué priorizar o reasignar. Nunca escribe código ni corrige nada.'],
]

// Asistente IA del equipo: solo el administrador. El sistema calcula las cifras y la IA las redacta.
export default function AsistenteEquipo({ equipoId }) {
  const [mensajes, setMensajes] = useState([])
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    let activo = true
    obtenerChatEquipo(equipoId).then(({ data, error: fallo }) => {
      if (!activo) return
      if (fallo) setError(fallo)
      else setMensajes(data)
    })
    return () => {
      activo = false
    }
  }, [equipoId])

  async function enviar(pregunta) {
    setError('')
    setEnviando(true)
    setMensajes((m) => [...m, { rol: 'usuario', texto: pregunta, creado_en: new Date().toISOString() }])
    const { data, error: fallo } = await preguntarEquipo(equipoId, pregunta)
    setEnviando(false)
    if (fallo) {
      setError(fallo)
      setMensajes((m) => m.slice(0, -1))
    } else {
      setMensajes((m) => [...m, { rol: 'ia', texto: data.respuesta, creado_en: new Date().toISOString() }])
    }
  }

  const inicioHoy = new Date()
  inicioHoy.setHours(0, 0, 0, 0)
  const preguntasHoy = mensajes.filter((m) => m.rol === 'usuario' && new Date(m.creado_en) >= inicioHoy).length
  const quedan = Math.max(0, MAX_DIA - preguntasHoy)

  return (
    <div className="asistente">
      <ChatAsistente
        titulo="Asistente IA del equipo"
        intro="Pregunta cómo va el equipo en lenguaje natural. Las cifras salen del sistema; la IA solo las explica."
        sugerencias={SUGERENCIAS}
        pistaDeshabilitado={quedan === 0 ? 'Llegaste al límite de preguntas de hoy' : 'Esperando la respuesta…'}
        habilitado={!enviando && quedan > 0}
        mensajes={mensajes}
        onEnviar={enviar}
        error={error}
      />
      <aside className="panel asistente__ayuda" aria-label="Qué puede responder">
        <h2>Qué puede responder</h2>
        <ul>
          {TEMAS.map(([tema, texto]) => (
            <li key={tema}>
              <strong>{tema}:</strong> {texto}
            </li>
          ))}
        </ul>
        <p className="celda-sec">
          Solo tú ves este asistente, porque compara a las personas del equipo. La conversación queda guardada.
        </p>
      </aside>
    </div>
  )
}
