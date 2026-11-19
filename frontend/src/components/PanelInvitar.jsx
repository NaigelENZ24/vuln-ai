import { useState } from 'react'
import { ChevronDown, UserPlus } from 'lucide-react'
import { crearInvitacion } from '../services/equiposService.js'
import { validarCorreo, validarGithub } from '../utils/validaciones.js'

const CLAVE = 'centinela.invitar.abierto'

function leerPreferencia(porDefecto) {
  try {
    const v = localStorage.getItem(CLAVE)
    return v === null ? porDefecto : v === '1'
  } catch {
    return porDefecto
  }
}

// Formulario plegable para invitar. Recuerda si el admin lo dejó minimizado;
// sin preferencia guardada, aparece abierto solo cuando el equipo aún no tiene miembros.
export default function PanelInvitar({ equipoId, equipoVacio, onInvitada }) {
  const [abierto, setAbierto] = useState(() => leerPreferencia(equipoVacio))
  const [correo, setCorreo] = useState('')
  const [rol, setRol] = useState('colaborador')
  const [github, setGithub] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  function alternar() {
    setAbierto((v) => {
      try {
        localStorage.setItem(CLAVE, v ? '0' : '1')
      } catch {
        /* sin almacenamiento: solo no se recuerda */
      }
      return !v
    })
  }

  async function enviar(e) {
    e.preventDefault()
    const fallo = validarCorreo(correo) || validarGithub(github)
    if (fallo) {
      setError(fallo)
      return
    }
    setEnviando(true)
    setError('')
    const { data, error: errorBase } = await crearInvitacion({ equipoId, correo, rol, github })
    setEnviando(false)
    if (errorBase) {
      setError(errorBase)
      return
    }
    onInvitada({ correo: correo.trim().toLowerCase(), codigo: data })
    setCorreo('')
    setGithub('')
  }

  return (
    <section className={`plegable ${abierto ? 'plegable--abierto' : ''}`}>
      <button
        type="button"
        className="plegable__cabecera"
        aria-expanded={abierto}
        aria-controls="form-invitar"
        onClick={alternar}
      >
        <span className="plegable__icono">
          <UserPlus size={16} aria-hidden="true" />
        </span>
        <span className="plegable__titulo">Invitar colaborador</span>
        {!abierto && <span className="plegable__pista">Despliega para agregar un nuevo miembro</span>}
        <span className="plegable__flecha" title={abierto ? 'Minimizar' : 'Desplegar'}>
          <ChevronDown size={18} aria-hidden="true" />
        </span>
      </button>

      {abierto && (
        <form id="form-invitar" className="plegable__cuerpo" onSubmit={enviar} noValidate>
          <div className="eq-campos">
            <label className="eq-campo eq-campo--ancho">
              Correo
              <input
                type="email"
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
                placeholder="persona@correo.com"
                aria-invalid={Boolean(error) || undefined}
              />
            </label>
            <label className="eq-campo">
              Rol
              <select value={rol} onChange={(e) => setRol(e.target.value)}>
                <option value="colaborador">Colaborador</option>
                <option value="observador">Observador</option>
              </select>
            </label>
            <label className="eq-campo eq-campo--ancho">
              Usuario de GitHub (opcional)
              <input value={github} onChange={(e) => setGithub(e.target.value)} placeholder="usuario" maxLength={39} />
            </label>
            <button type="submit" className="btn-primario" disabled={enviando}>
              {enviando ? 'Creando…' : 'Crear invitación'}
            </button>
            <button type="button" className="btn-cabecera" onClick={alternar}>
              Cancelar
            </button>
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <p className="plegable__nota">
            El enlace vence en 7 días, sirve una vez y solo para ese correo verificado. Con el usuario de GitHub se
            podrá mostrar en qué rama trabaja.
          </p>
        </form>
      )}
    </section>
  )
}
