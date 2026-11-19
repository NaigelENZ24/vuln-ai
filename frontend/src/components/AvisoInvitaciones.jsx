import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { UserPlus } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { aceptarInvitacion, rechazarInvitacion } from '../services/equiposService.js'
import '../styles/equipos.css'

// Solo aparece si la persona con sesión tiene una invitación pendiente a SU correo verificado.
export default function AvisoInvitaciones() {
  const { invitaciones, recargarEquipos } = useAuth()
  const navigate = useNavigate()
  const [ocupado, setOcupado] = useState('')
  const [error, setError] = useState('')

  if (invitaciones.length === 0) return null

  async function responder(inv, aceptar) {
    setOcupado(inv.id)
    setError('')
    const { error: fallo } = aceptar ? await aceptarInvitacion({ id: inv.id }) : await rechazarInvitacion(inv.id)
    setOcupado('')
    if (fallo) {
      setError(fallo)
      return
    }
    recargarEquipos()
    if (aceptar) navigate('/mi-trabajo')
  }

  return (
    <section className="aviso-inv" aria-label="Invitaciones pendientes">
      {invitaciones.map((inv) => (
        <div key={inv.id} className="aviso-inv__fila">
          <UserPlus size={18} aria-hidden="true" />
          <p>
            Te invitaron al equipo <strong>{inv.equipo}</strong> como {inv.rol}. Al aceptar, el equipo verá tu
            actividad pública de GitHub y recibirás recordatorios.
          </p>
          <div className="aviso-inv__acciones">
            <button
              type="button"
              className="btn-tabla"
              disabled={ocupado === inv.id}
              onClick={() => responder(inv, true)}
            >
              Aceptar
            </button>
            <button
              type="button"
              className="btn-cabecera"
              disabled={ocupado === inv.id}
              onClick={() => responder(inv, false)}
            >
              Rechazar
            </button>
          </div>
        </div>
      ))}
      {error && (
        <p className="aviso-inv__error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
