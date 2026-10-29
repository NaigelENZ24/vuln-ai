import { useId, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

export default function CampoFormulario({ etiqueta, error, ayuda, type = 'text', ...props }) {
  const id = useId()
  const [visible, setVisible] = useState(false)
  const esClave = type === 'password'

  const describedBy =
    [ayuda && `${id}-ayuda`, error && `${id}-error`].filter(Boolean).join(' ') || undefined

  return (
    <div className="campo">
      <label htmlFor={id}>{etiqueta}</label>
      <div className="campo__control">
        <input
          id={id}
          type={esClave && visible ? 'text' : type}
          className={esClave ? 'campo__input--ojo' : undefined}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={describedBy}
          {...props}
        />
        {esClave && (
          <button
            type="button"
            className="campo__ojo"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            aria-pressed={visible}
          >
            {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
          </button>
        )}
      </div>
      {ayuda && (
        <p id={`${id}-ayuda`} className="campo__ayuda">
          {ayuda}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="campo__error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}