import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Trash2, Users, X } from 'lucide-react'
import AdminLayout from '../components/AdminLayout.jsx'
import { crearEquipo, eliminarEquipo, listarEquipos } from '../services/equiposService.js'
import { formatearFecha } from '../utils/formato.js'
import '../styles/equipos.css'

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`

export default function AdminEquipos() {
  const navigate = useNavigate()
  const [equipos, setEquipos] = useState(null)
  const [error, setError] = useState('')
  const [intento, setIntento] = useState(0)
  const [aviso, setAviso] = useState('')
  const [formAbierto, setFormAbierto] = useState(false)
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [errorForm, setErrorForm] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    let activo = true
    setError('')
    listarEquipos().then(({ data, error: fallo }) => {
      if (!activo) return
      if (fallo) setError(fallo)
      else setEquipos(data)
    })
    return () => {
      activo = false
    }
  }, [intento])

  async function crear(e) {
    e.preventDefault()
    if (!nombre.trim()) {
      setErrorForm('Escribe un nombre para el equipo.')
      return
    }
    setGuardando(true)
    setErrorForm('')
    const { data, error: fallo } = await crearEquipo({ nombre, descripcion })
    setGuardando(false)
    if (fallo) setErrorForm(fallo)
    else navigate(`/admin/equipos/${data.id}`)
  }

  // No se puede deshacer: se pide escribir el nombre del equipo para confirmar.
  async function eliminar(equipo) {
    const escrito = window.prompt(
      `Se eliminará «${equipo.nombre}» por completo: sus repositorios, ramas, análisis, incidencias, historial, ` +
        `colaboradores, invitaciones y la conversación del asistente. No se puede deshacer.\n\n` +
        `Escribe el nombre del equipo para confirmar:`
    )
    if (escrito === null) return
    if (escrito.trim() !== equipo.nombre) {
      setAviso('El nombre no coincide: no se eliminó nada.')
      return
    }
    const { error: fallo } = await eliminarEquipo(equipo.id)
    setAviso(fallo || `Se eliminó el equipo «${equipo.nombre}».`)
    if (!fallo) setIntento((n) => n + 1)
  }

  const abrirForm = () => {
    setFormAbierto(true)
    setErrorForm('')
  }

  return (
    <AdminLayout
      titulo="Equipos de trabajo"
      descripcion="Agrupa a las personas que corrigen las vulnerabilidades de un mismo proyecto."
    >
      {formAbierto ? (
        <form className="panel equipo-nuevo" onSubmit={crear} noValidate>
          <div className="equipo-nuevo__cabecera">
            <h2>Nuevo equipo</h2>
            <button type="button" className="icono-btn" aria-label="Cerrar" onClick={() => setFormAbierto(false)}>
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          <div className="eq-campos">
            <label className="eq-campo">
              Nombre
              <input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                maxLength={80}
                placeholder="Equipo Biblioteca"
                aria-invalid={Boolean(errorForm) || undefined}
                autoFocus
              />
            </label>
            <label className="eq-campo eq-campo--ancho">
              Descripción (opcional)
              <input
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                maxLength={300}
                placeholder="Qué proyecto corrigen"
              />
            </label>
            <button type="submit" className="btn-primario" disabled={guardando}>
              {guardando ? 'Creando…' : 'Crear equipo'}
            </button>
          </div>
          {errorForm && (
            <p className="form-error" role="alert">
              {errorForm}
            </p>
          )}
        </form>
      ) : (
        <div>
          <button type="button" className="btn-primario" onClick={abrirForm}>
            <Plus size={18} aria-hidden="true" />
            Nuevo equipo
          </button>
        </div>
      )}

      {error && (
        <div className="panel estado-vacio" role="alert">
          <p>{error}</p>
          <button type="button" className="btn-primario" style={{ marginTop: 12 }} onClick={() => setIntento((n) => n + 1)}>
            Reintentar
          </button>
        </div>
      )}

      {!error && equipos === null && (
        <p className="estado-vacio" role="status">
          Cargando equipos…
        </p>
      )}

      {equipos?.length === 0 && !formAbierto && (
        <section className="panel vacio-equipos">
          <Users size={28} aria-hidden="true" />
          <h2>Todavía no hay equipos</h2>
          <p>
            Crea un equipo, invita a sus colaboradores y asígnales las vulnerabilidades que encuentre Centinela en sus
            ramas.
          </p>
          <button type="button" className="btn-primario" onClick={abrirForm}>
            <Plus size={18} aria-hidden="true" />
            Crear el primer equipo
          </button>
        </section>
      )}

      {aviso && (
        <p className="panel__aviso panel__aviso--suelto" role="status">
          {aviso}
        </p>
      )}

      {equipos?.length > 0 && (
        <ul className="equipos-grid" aria-label="Equipos">
          {equipos.map((e) => (
            <li key={e.id} className="equipo-tarjeta__contenedor">
              <button
                type="button"
                className="icono-btn icono-btn--chico equipo-tarjeta__eliminar"
                aria-label={`Eliminar el equipo ${e.nombre}`}
                title="Eliminar equipo"
                onClick={() => eliminar(e)}
              >
                <Trash2 size={16} aria-hidden="true" />
              </button>
              <Link className="equipo-tarjeta" to={`/admin/equipos/${e.id}`}>
                <h2>{e.nombre}</h2>
                {e.descripcion && <p className="equipo-tarjeta__desc">{e.descripcion}</p>}
                <dl className="equipo-tarjeta__datos">
                  <div>
                    <dt>Miembros</dt>
                    <dd>{e.miembros}</dd>
                  </div>
                  <div>
                    <dt>Invitaciones pendientes</dt>
                    <dd>{e.pendientes}</dd>
                  </div>
                </dl>
                <p className="equipo-tarjeta__pie">
                  Creado el {formatearFecha(e.creado_en)} · {plural(e.miembros, 'miembro', 'miembros')}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AdminLayout>
  )
}
