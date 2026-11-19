import { useState } from 'react'
import { Check, Copy, X } from 'lucide-react'
import { enlaceInvitacion } from '../services/equiposService.js'

const ESTADOS = {
  enviando: (correo) => `Enviando la invitación a ${correo}…`,
  enviado: (correo) => `Invitación enviada a ${correo}. También puedes copiar el enlace.`,
}

// Muestra el enlace recién creado y si el correo salió. El código no se guarda en la base:
// si el correo falla, copiar el enlace es la única forma de compartirlo.
export default function EnlaceInvitacion({ correo, codigo, envio, detalle, onCerrar }) {
  const [copiado, setCopiado] = useState(false)
  const url = enlaceInvitacion(codigo)

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url)
      setCopiado(true)
    } catch {
      setCopiado(false)
    }
  }

  return (
    <section className={`enlace-inv ${envio === 'error' ? 'enlace-inv--error' : ''}`} role="status">
      <div className="enlace-inv__texto">
        <p>
          {envio === 'error'
            ? `${detalle} Este enlace no se vuelve a mostrar.`
            : ESTADOS[envio]?.(correo) ?? `Invitación creada para ${correo}.`}
        </p>
        <div className="enlace-inv__fila">
          <input readOnly value={url} aria-label="Enlace de la invitación" onFocus={(e) => e.target.select()} />
          <button type="button" className="btn-primario" onClick={copiar}>
            {copiado ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
            {copiado ? 'Copiado' : 'Copiar enlace'}
          </button>
        </div>
      </div>
      <button type="button" className="icono-btn" aria-label="Cerrar aviso" onClick={onCerrar}>
        <X size={18} aria-hidden="true" />
      </button>
    </section>
  )
}
