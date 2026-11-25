import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Users, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { enviarSolicitudEquipo } from '../services/analyzerApi.js'
import { INTEGRANTES, miSolicitud } from '../services/solicitudesService.js'
import '../styles/solicitudes.css'

const EQUIPOS = [1, 2, 3]

// Sección de la landing: un desarrollador pide al administrador poder crear equipos (líder de equipo).
export default function SolicitudEquipo() {
  const { usuario, esAdmin, esLider, cargando } = useAuth()
  const navigate = useNavigate()
  const [solicitud, setSolicitud] = useState(null)
  const [abierto, setAbierto] = useState(false)
  const [intento, setIntento] = useState(0)
  const botonRef = useRef(null)

  useEffect(() => {
    if (!usuario || esAdmin) return
    let activo = true
    miSolicitud(usuario.id).then(({ data }) => activo && setSolicitud(data ?? null))
    return () => {
      activo = false
    }
  }, [usuario, esAdmin, intento])

  if (cargando || esAdmin) return null

  const pendiente = solicitud?.estado === 'pendiente'
  const abrir = () => (usuario ? setAbierto(true) : navigate('/login', { state: { desde: '/' } }))

  return (
    <section className="sol-banda" aria-labelledby="sol-titulo">
      <div>
        <h2 id="sol-titulo">¿Necesitas colaborar con tu equipo?</h2>
        <p>
          Crea un equipo de trabajo, invita a tus compañeros y repártanse la corrección de las vulnerabilidades de su
          proyecto. Contáctanos y te damos acceso como líder de equipo.
        </p>
        {pendiente && (
          <p className="sol-estado" role="status">
            Tu solicitud para «{solicitud.nombre_equipo}» está en revisión. Te avisaremos cuando el administrador la apruebe.
          </p>
        )}
        {solicitud?.estado === 'rechazada' && !esLider && (
          <p className="sol-estado" role="status">
            Tu última solicitud no fue aprobada{solicitud.motivo ? `: ${solicitud.motivo}` : '.'} Puedes enviar otra.
          </p>
        )}
      </div>
      {esLider ? (
        <Link className="btn-primario" to="/admin/equipos">
          Ir a mis equipos
        </Link>
      ) : (
        !pendiente && (
          <button type="button" className="btn-primario" onClick={abrir} ref={botonRef}>
            <Users size={18} aria-hidden="true" />
            Contáctanos
          </button>
        )
      )}
      {abierto && (
        <FormularioSolicitud
          correo={usuario.email}
          onCerrar={() => {
            setAbierto(false)
            botonRef.current?.focus() // el foco vuelve a donde estaba quien usa teclado
          }}
          onEnviada={() => {
            setAbierto(false)
            setIntento((n) => n + 1)
          }}
        />
      )}
    </section>
  )
}

function FormularioSolicitud({ correo, onCerrar, onEnviada }) {
  const [nombre, setNombre] = useState('')
  const [integrantes, setIntegrantes] = useState('2-4')
  const [equipos, setEquipos] = useState(1)
  const [descripcion, setDescripcion] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    const alPulsar = (e) => e.key === 'Escape' && onCerrar()
    window.addEventListener('keydown', alPulsar)
    return () => window.removeEventListener('keydown', alPulsar)
  }, [onCerrar])

  async function enviar(e) {
    e.preventDefault()
    if (!nombre.trim()) {
      setError('Escribe el nombre del equipo.')
      return
    }
    setEnviando(true)
    setError('')
    const { error: fallo } = await enviarSolicitudEquipo({ nombreEquipo: nombre.trim(), integrantes, equipos, descripcion })
    setEnviando(false)
    if (fallo) setError(fallo)
    else onEnviada()
  }

  return (
    <div className="sol-velo" onClick={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className="sol-dialogo" role="dialog" aria-modal="true" aria-labelledby="sol-dialogo-titulo">
        <div className="sol-dialogo__cabecera">
          <h2 id="sol-dialogo-titulo">Solicitar un equipo de trabajo</h2>
          <button type="button" className="sol-cerrar" aria-label="Cerrar" onClick={onCerrar}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <p className="sol-nota">Al aprobarla, el administrador te dará acceso para crear y gestionar tus equipos.</p>

        <form onSubmit={enviar} noValidate>
          <label className="sol-campo">
            Nombre del equipo
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              maxLength={80}
              placeholder="Equipo Biblioteca"
              aria-invalid={Boolean(error && !nombre.trim()) || undefined}
              autoFocus
            />
          </label>

          <fieldset className="sol-opciones">
            <legend>¿Cuántos integrantes tendrá?</legend>
            <div className="sol-opciones__lista">
              {Object.entries(INTEGRANTES).map(([valor, texto]) => (
                <label key={valor} className="sol-opcion">
                  <input
                    type="radio"
                    name="integrantes"
                    value={valor}
                    checked={integrantes === valor}
                    onChange={() => setIntegrantes(valor)}
                  />
                  {texto}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="sol-opciones">
            <legend>¿Cuántos equipos de trabajo necesitas?</legend>
            <div className="sol-opciones__lista">
              {EQUIPOS.map((n) => (
                <label key={n} className="sol-opcion">
                  <input type="radio" name="equipos" value={n} checked={equipos === n} onChange={() => setEquipos(n)} />
                  {n === 1 ? '1 equipo' : `${n} equipos`}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="sol-campo">
            Correo del líder del equipo
            <input value={correo} readOnly aria-describedby="sol-correo-nota" />
          </label>
          <p id="sol-correo-nota" className="sol-nota">
            Es el correo de tu cuenta: tú serás el líder. Para que lo sea otra persona, que envíe la solicitud desde su
            cuenta.
          </p>

          <label className="sol-campo">
            ¿Para qué proyecto? (opcional)
            <textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              maxLength={500}
              placeholder="Repositorio, curso o empresa y qué necesitan corregir"
            />
          </label>

          {error && (
            <p className="sol-error" role="alert">
              {error}
            </p>
          )}
          <p className="nota-privacidad">
            Usaremos estos datos solo para revisar tu solicitud; los recibe el administrador por correo. Más detalles en
            la{' '}
            <Link to="/privacidad" target="_blank" rel="noreferrer">
              política de privacidad<span className="sr-only"> (se abre en una pestaña nueva)</span>
            </Link>
            .
          </p>
          <button type="submit" className="btn-primario" disabled={enviando}>
            {enviando ? 'Enviando…' : 'Enviar solicitud'}
          </button>
        </form>
      </div>
    </div>
  )
}
