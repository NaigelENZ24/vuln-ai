import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Check, Lock } from 'lucide-react'
import SiteHeader from '../components/SiteHeader.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { aceptarInvitacion, rechazarInvitacion } from '../services/equiposService.js'
import '../styles/analisis.css'
import '../styles/equipos.css'

// /invitacion/:codigo (ruta protegida: sin sesión pasa por el login y vuelve aquí).
// El nombre del equipo sale de las invitaciones pendientes del correo verificado de la sesión:
// un código ajeno, vencido o usado muestra siempre el mismo mensaje genérico.
export default function Invitacion() {
  const { codigo } = useParams()
  const navigate = useNavigate()
  const { invitaciones, usuario, recargarEquipos } = useAuth()
  const [acepta, setAcepta] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [invalida, setInvalida] = useState(false)

  async function aceptar(e) {
    e.preventDefault()
    setOcupado(true)
    const { error } = await aceptarInvitacion({ codigo })
    setOcupado(false)
    if (error) {
      setInvalida(true)
      return
    }
    recargarEquipos()
    navigate('/mi-trabajo', { replace: true })
  }

  async function rechazar() {
    setOcupado(true)
    await rechazarInvitacion(invitaciones[0].id)
    recargarEquipos()
    navigate('/', { replace: true })
  }

  const sinInvitacion = invalida || invitaciones.length === 0

  return (
    <div className="analisis">
      <SiteHeader />
      <main className="invitacion">
        {sinInvitacion ? (
          <section className="invitacion__tarjeta invitacion__tarjeta--centro" role="alert">
            <span className="invitacion__candado">
              <Lock size={24} aria-hidden="true" />
            </span>
            <h1>Esta invitación no es válida o expiró</h1>
            <p>
              Si esperabas unirte a un equipo, pide al administrador una invitación nueva para{' '}
              <strong>{usuario?.email}</strong>, el correo con el que iniciaste sesión.
            </p>
            <Link className="btn-primario" to="/">
              Ir al inicio
            </Link>
          </section>
        ) : (
          <form className="invitacion__tarjeta" onSubmit={aceptar}>
            <span className="invitacion__etiqueta">Invitación</span>
            <h1>
              {invitaciones.length === 1
                ? `Te invitaron al equipo ${invitaciones[0].equipo}`
                : 'Te invitaron a un equipo de trabajo'}
            </h1>
            {invitaciones.length > 1 && (
              <p>Tienes invitaciones de: {invitaciones.map((i) => i.equipo).join(', ')}.</p>
            )}
            {invitaciones.length === 1 && (
              <p>
                Entrarás como <strong>{invitaciones[0].rol}</strong>.
              </p>
            )}

            <ul className="invitacion__puntos">
              <li>
                <Check size={16} aria-hidden="true" />
                Verás las vulnerabilidades de los repositorios del equipo y las que te asignen.
              </li>
              <li>
                <Check size={16} aria-hidden="true" />
                Podrás marcar que estás corrigiendo una, comentar y pedir que se verifique tu corrección.
              </li>
              <li>
                <Check size={16} aria-hidden="true" />
                Centinela nunca modifica tu código ni escribe en GitHub.
              </li>
            </ul>

            <div className="invitacion__datos">
              <strong>Uso de tus datos</strong>
              <p>
                Para mostrar en qué rama trabajas, el equipo verá tu actividad pública de GitHub. Recibirás
                recordatorios por correo y podrás bajar su frecuencia.
              </p>
              <label className="invitacion__acepto">
                <input type="checkbox" checked={acepta} onChange={(e) => setAcepta(e.target.checked)} />
                Entiendo y acepto
              </label>
            </div>

            <div className="invitacion__acciones">
              <button type="submit" className="btn-primario" disabled={!acepta || ocupado}>
                {ocupado ? 'Uniéndote…' : 'Aceptar invitación'}
              </button>
              {invitaciones.length === 1 && (
                <button type="button" className="btn-cabecera" disabled={ocupado} onClick={rechazar}>
                  Rechazar
                </button>
              )}
            </div>
          </form>
        )}
      </main>
    </div>
  )
}
