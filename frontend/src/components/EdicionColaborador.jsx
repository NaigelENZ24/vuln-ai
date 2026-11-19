import { useState } from 'react'
import { validarCorreo, validarGithub } from '../utils/validaciones.js'

// Fila de la tabla en modo edición. En un miembro se editan rol, GitHub y la rama de trabajo por repositorio
// (nombre y correo son de su cuenta); en una invitación pendiente también el correo.
export default function EdicionColaborador({ fila, repos, columnas = 6, onGuardar, onCancelar }) {
  const esInvitacion = fila.tipo === 'invitacion'
  const [correo, setCorreo] = useState(fila.correo)
  const [rol, setRol] = useState(fila.rol)
  const [github, setGithub] = useState(fila.github ?? '')
  // { repoId: id de la rama elegida, '' = la principal }
  const [ramas, setRamas] = useState(() =>
    Object.fromEntries(repos.map((r) => [r.id, fila.ramasIds?.[r.id] ?? '']))
  )
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  async function guardar(e) {
    e.preventDefault()
    const fallo = (esInvitacion && validarCorreo(correo)) || validarGithub(github)
    if (fallo) {
      setError(fallo)
      return
    }
    setGuardando(true)
    setError('')
    const { error: errorBase } = await onGuardar({ correo: correo.trim().toLowerCase(), rol, github, ramas })
    setGuardando(false)
    if (errorBase) setError(errorBase)
  }

  const conRamas = !esInvitacion && rol === 'colaborador' && repos.length > 0

  return (
    <tr className="fila-edicion">
      <td colSpan={columnas}>
        <form onSubmit={guardar} noValidate>
          <div className="eq-campos">
            {esInvitacion ? (
              <label className="eq-campo eq-campo--ancho">
                Correo
                <input type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} autoFocus />
              </label>
            ) : (
              <p className="fila-edicion__persona">
                <strong>{fila.nombre}</strong>
                <span className="celda-sec">{fila.correo} · el nombre y el correo los cambia la persona en su cuenta</span>
              </p>
            )}
            <label className="eq-campo">
              Rol
              <select value={rol} onChange={(e) => setRol(e.target.value)}>
                <option value="colaborador">Colaborador</option>
                <option value="observador">Observador</option>
              </select>
            </label>
            <label className="eq-campo eq-campo--ancho">
              Usuario de GitHub
              <input value={github} onChange={(e) => setGithub(e.target.value)} placeholder="usuario" maxLength={39} />
            </label>
          </div>

          {conRamas && (
            <fieldset className="fila-edicion__ramas">
              <legend>Rama en la que trabaja</legend>
              {repos.map((r) => {
                const principal = r.ramas_vigiladas.find((v) => v.es_principal)
                return (
                  <label key={r.id} className="eq-campo eq-campo--ancho">
                    {repos.length > 1 ? r.nombre : 'Rama'}
                    <select value={ramas[r.id]} onChange={(e) => setRamas((x) => ({ ...x, [r.id]: e.target.value }))}>
                      <option value="">{principal ? `${principal.rama} (principal, por defecto)` : 'Principal'}</option>
                      {r.ramas_vigiladas
                        .filter((v) => !v.es_principal)
                        .map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.rama}
                          </option>
                        ))}
                    </select>
                  </label>
                )
              })}
              <p className="plegable__nota">
                Solo podrá tomar y recibir incidencias de esa rama. Lo que ya tiene asignado lo puede seguir verificando.
              </p>
            </fieldset>
          )}

          <div className="acciones-fila fila-edicion__botones">
            <button type="submit" className="btn-primario" disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
            <button type="button" className="btn-cabecera" onClick={onCancelar}>
              Cancelar
            </button>
          </div>
        </form>
        {esInvitacion && correo.trim().toLowerCase() !== fila.correo && (
          <p className="plegable__nota">Al cambiar el correo se anula esta invitación y se envía una nueva al correo corregido.</p>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </td>
    </tr>
  )
}
