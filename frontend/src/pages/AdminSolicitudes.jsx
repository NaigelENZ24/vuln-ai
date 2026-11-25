import { useEffect, useState } from 'react'
import { Check, Inbox, X } from 'lucide-react'
import AdminLayout from '../components/AdminLayout.jsx'
import Esqueleto from '../components/Esqueleto.jsx'
import { INTEGRANTES, aprobarSolicitud, listarSolicitudes, rechazarSolicitud } from '../services/solicitudesService.js'
import { formatearFecha } from '../utils/formato.js'
import '../styles/equipos.css'
import '../styles/solicitudes.css'

const FILTROS = { pendiente: 'Pendientes', aprobada: 'Aprobadas', rechazada: 'Rechazadas', todas: 'Todas' }
const ESTADO = { pendiente: ['Pendiente', 'est--pendiente'], aprobada: ['Aprobada', 'est--completado'], rechazada: ['Rechazada', 'est--error'] }

export default function AdminSolicitudes() {
  const [lista, setLista] = useState(null)
  const [error, setError] = useState('')
  const [filtro, setFiltro] = useState('pendiente')
  const [intento, setIntento] = useState(0)
  const [ocupado, setOcupado] = useState(null)
  const [rechazando, setRechazando] = useState(null)
  const [motivo, setMotivo] = useState('')
  const [aviso, setAviso] = useState('')

  useEffect(() => {
    let activo = true
    listarSolicitudes().then(({ data, error: fallo }) => {
      if (!activo) return
      if (fallo) setError(fallo)
      else setLista(data)
    })
    return () => {
      activo = false
    }
  }, [intento])

  async function resolver(s, aprobar) {
    setOcupado(s.id)
    setAviso('')
    const { error: fallo } = aprobar ? await aprobarSolicitud(s.id) : await rechazarSolicitud(s.id, motivo.trim())
    setOcupado(null)
    setRechazando(null)
    setMotivo('')
    setAviso(
      fallo ||
        (aprobar
          ? `Aprobada: ${s.solicitante?.nombre ?? 'la persona'} ya puede crear ${s.equipos_solicitados === 1 ? 'su equipo' : `${s.equipos_solicitados} equipos`}.`
          : 'Solicitud rechazada.')
    )
    setIntento((n) => n + 1)
  }

  const visibles = (lista ?? []).filter((s) => filtro === 'todas' || s.estado === filtro)
  const conteo = (f) => (lista ?? []).filter((s) => f === 'todas' || s.estado === f).length

  return (
    <AdminLayout
      titulo="Solicitudes de equipo"
      descripcion="Personas que piden crear equipos de trabajo. Al aprobar, se convierten en líderes y gestionan solo sus propios equipos."
    >
      <div className="chips chips--sueltos" role="group" aria-label="Filtrar por estado">
        {Object.entries(FILTROS).map(([clave, texto]) => (
          <button
            key={clave}
            type="button"
            className={`chip ${filtro === clave ? 'chip--activo' : ''}`}
            aria-pressed={filtro === clave}
            onClick={() => setFiltro(clave)}
          >
            {texto} ({conteo(clave)})
          </button>
        ))}
      </div>

      {aviso && (
        <p className="panel__aviso panel__aviso--suelto" role="status">
          {aviso}
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {!error && lista === null && <Esqueleto forma="tarjetas" etiqueta="Cargando solicitudes…" />}

      {lista && visibles.length === 0 && (
        <section className="panel vacio-equipos">
          <Inbox size={28} aria-hidden="true" />
          <h2>No hay solicitudes {filtro === 'todas' ? '' : FILTROS[filtro].toLowerCase()}</h2>
          <p>Las personas las envían desde la página principal. Te llega un correo con cada solicitud nueva.</p>
        </section>
      )}

      <ul className="sol-lista" aria-label="Solicitudes">
        {visibles.map((s) => {
          const [etiqueta, clase] = ESTADO[s.estado]
          return (
            <li key={s.id} className="panel sol-tarjeta">
              <div className="sol-tarjeta__cabecera">
                <h2>{s.nombre_equipo}</h2>
                <span className={`sev ${clase}`}>{etiqueta}</span>
              </div>
              <dl className="sol-datos">
                <div>
                  <dt>Solicitante</dt>
                  <dd>
                    {s.solicitante?.nombre ?? '—'}
                    <span className="celda-sec">{s.solicitante?.correo}</span>
                  </dd>
                </div>
                <div>
                  <dt>Integrantes</dt>
                  <dd>{INTEGRANTES[s.integrantes]}</dd>
                </div>
                <div>
                  <dt>Equipos que necesita</dt>
                  <dd>{s.equipos_solicitados}</dd>
                </div>
                <div>
                  <dt>Enviada</dt>
                  <dd>{formatearFecha(s.creada_en)}</dd>
                </div>
              </dl>
              {s.descripcion && <p className="sol-tarjeta__desc">{s.descripcion}</p>}
              {s.estado === 'rechazada' && s.motivo && <p className="celda-sec">Motivo: {s.motivo}</p>}

              {s.estado === 'pendiente' &&
                (rechazando === s.id ? (
                  <form
                    className="sol-rechazo"
                    onSubmit={(e) => {
                      e.preventDefault()
                      resolver(s, false)
                    }}
                  >
                    <label className="eq-campo eq-campo--ancho">
                      Motivo del rechazo (opcional, lo verá la persona)
                      <input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} autoFocus />
                    </label>
                    <button type="submit" className="btn-peligro" disabled={ocupado === s.id}>
                      Confirmar rechazo
                    </button>
                    <button type="button" className="btn-tabla" onClick={() => setRechazando(null)}>
                      Cancelar
                    </button>
                  </form>
                ) : (
                  <div className="sol-acciones">
                    <button type="button" className="btn-primario" disabled={ocupado === s.id} onClick={() => resolver(s, true)}>
                      <Check size={16} aria-hidden="true" />
                      {ocupado === s.id ? 'Aprobando…' : 'Aprobar'}
                    </button>
                    <button type="button" className="btn-peligro" disabled={ocupado === s.id} onClick={() => setRechazando(s.id)}>
                      <X size={16} aria-hidden="true" />
                      Rechazar
                    </button>
                  </div>
                ))}
            </li>
          )
        })}
      </ul>
    </AdminLayout>
  )
}
