import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ClipboardList } from 'lucide-react'
import SiteHeader from '../components/SiteHeader.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { cambiarEstado, listarMiTrabajo } from '../services/incidenciasService.js'
import { ESTADOS_INCIDENCIA } from '../constants/estados.js'
import { claveUI, etiquetaNivel } from '../utils/severidad.js'
import { ordenarPlan, plazo, ramaDeTrabajo, ubicacion } from '../utils/incidencias.js'
import { formatearFecha } from '../utils/formato.js'
import '../styles/analisis.css'
import '../styles/equipos.css'

const ROLES = { colaborador: 'Colaborador', observador: 'Observador (solo lectura)' }

function FilaIncidencia({ inc, children }) {
  const p = plazo(inc)
  return (
    <li className="mt-fila">
      <span className={`sev sev--${claveUI(inc.severidad)}`}>{etiquetaNivel(inc.severidad)}</span>
      <span className="mt-fila__texto">
        <Link to={`/incidencias/${inc.id}`}>{inc.titulo ?? inc.regla_id}</Link>
        <span className="celda-mono celda-sec">
          {inc.repositorios.nombre} · {inc.rama} · {ubicacion(inc)}
        </span>
      </span>
      {p.texto && <span className={`mt-fila__plazo ${p.vencida ? 'texto-vencida' : ''}`}>{p.texto}</span>}
      {children}
    </li>
  )
}

export default function MiTrabajo() {
  const { usuario, equipos, esColaborador } = useAuth()
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [intento, setIntento] = useState(0)
  const [ocupado, setOcupado] = useState('')

  useEffect(() => {
    if (!esColaborador) return
    let activo = true
    listarMiTrabajo(usuario.id).then(({ data, error: fallo }) => {
      if (!activo) return
      if (fallo) setError(fallo)
      else setDatos(data)
    })
    return () => {
      activo = false
    }
  }, [usuario.id, esColaborador, intento])

  const equiposColab = useMemo(() => equipos.filter((e) => e.rol === 'colaborador'), [equipos])
  const limite = equiposColab[0]?.equipos?.limite_en_correccion ?? 3

  const { plan, enCurso, libres } = useMemo(() => {
    if (!datos) return { plan: [], enCurso: 0, libres: [] }
    const ids = new Set(equiposColab.map((e) => e.equipo_id))
    return {
      plan: ordenarPlan(datos.mias.filter((i) => i.estado !== 'en_revision')).slice(0, 3),
      enCurso: datos.mias.filter((i) => i.estado === 'en_correccion').length,
      // Solo se puede tomar en equipos donde es colaborador y en su rama de trabajo (igual que la base).
      libres: ordenarPlan(
        datos.libres.filter(
          (i) =>
            ids.has(i.repositorios.equipo_id) &&
            ramaDeTrabajo(i.repositorio_id, datos.elegidas, datos.principales) === i.rama
        )
      ),
    }
  }, [datos, equiposColab])

  // Repositorios de los equipos donde es colaborador (no los de observador).
  const reposColab = datos
    ? Object.keys(datos.principales).filter((r) => equiposColab.some((e) => e.equipo_id === datos.equipoDe[r]))
    : []

  async function accion(inc, nombre) {
    setOcupado(inc.id)
    setAviso('')
    const { error: fallo } = await cambiarEstado(inc.id, nombre)
    setOcupado('')
    if (fallo) setAviso(fallo)
    setIntento((n) => n + 1)
  }

  const botonCorregir = (inc) =>
    inc.estado === 'abierta' ? (
      <button type="button" className="btn-tabla" disabled={ocupado === inc.id || enCurso >= limite} onClick={() => accion(inc, 'corregir')}>
        Estoy corrigiendo esto
      </button>
    ) : (
      <Link className="btn-cabecera" to={`/incidencias/${inc.id}`}>
        {inc.estado === 'en_correccion' ? 'Ya la corregí, verificar' : 'Ver estado'}
      </Link>
    )

  return (
    <div className="analisis">
      <SiteHeader />
      <main className="analisis__contenedor">
        <div className="mis__cabecera">
          <h1>{esColaborador ? 'Mi trabajo' : 'Mi equipo'}</h1>
          {esColaborador && (
            <span className={`mt-limite ${enCurso >= limite ? 'mt-limite--lleno' : ''}`}>
              En corrección: {enCurso} de {limite} permitidas
            </span>
          )}
        </div>

        {esColaborador && datos && reposColab.length > 0 && (
          <p className="mt-ramas">
            Trabajas en:{' '}
            {reposColab.map((repoId) => (
              <span key={repoId} className="rol celda-mono">
                {datos.repos[repoId]} · {ramaDeTrabajo(repoId, datos.elegidas, datos.principales)}
              </span>
            ))}
          </p>
        )}

        {error && (
          <p className="analisis__error" role="alert">
            {error}
          </p>
        )}
        {aviso && (
          <p className="analisis__error" role="alert">
            {aviso}
          </p>
        )}

        {esColaborador && datos === null && !error && (
          <p className="vacio" role="status">
            Cargando tu trabajo…
          </p>
        )}

        {esColaborador && datos && datos.mias.length === 0 && (
          <section className="pendiente">
            <ClipboardList size={28} aria-hidden="true" />
            <h2>No tienes vulnerabilidades asignadas</h2>
            <p>
              {libres.length > 0
                ? 'Puedes tomar una de las disponibles de abajo, o esperar a que el administrador te asigne.'
                : 'Cuando el administrador te asigne una, aparecerá aquí con lo que debes corregir y en qué orden.'}
            </p>
          </section>
        )}

        {plan.length > 0 && (
          <section className="panel mt-seccion mt-seccion--plan">
            <h2>Tu plan de hoy</h2>
            <ol className="mt-lista">
              {plan.map((inc) => (
                <FilaIncidencia key={inc.id} inc={inc}>
                  {botonCorregir(inc)}
                </FilaIncidencia>
              ))}
            </ol>
          </section>
        )}

        {datos && datos.mias.length > 0 && (
          <section className="panel mt-seccion">
            <h2>Todas mis incidencias ({datos.mias.length})</h2>
            <ul className="mt-lista">
              {ordenarPlan(datos.mias).map((inc) => (
                <FilaIncidencia key={inc.id} inc={inc}>
                  <span className={`sev est-inc--${inc.estado}`}>{ESTADOS_INCIDENCIA[inc.estado]}</span>
                </FilaIncidencia>
              ))}
            </ul>
          </section>
        )}

        {libres.length > 0 && (
          <section className="panel mt-seccion">
            <h2>Disponibles para tomar ({libres.length})</h2>
            <ul className="mt-lista">
              {libres.slice(0, 20).map((inc) => (
                <FilaIncidencia key={inc.id} inc={inc}>
                  <button
                    type="button"
                    className="btn-cabecera"
                    disabled={ocupado === inc.id || enCurso >= limite}
                    onClick={() => accion(inc, 'tomar')}
                  >
                    Tomar
                  </button>
                </FilaIncidencia>
              ))}
            </ul>
            {enCurso >= limite && (
              <p className="celda-sec">Llegaste al límite de {limite} en corrección: termina o libera una para tomar otra.</p>
            )}
          </section>
        )}

        <section className="panel mt-seccion">
          <h2>Tus equipos</h2>
          <ul className="mis-equipos">
            {equipos.map((e) => (
              <li key={e.equipo_id} className="mis-equipos__fila">
                <span>
                  <span className="mis-equipos__nombre">{e.equipos?.nombre}</span>
                  {e.equipos?.descripcion && <span className="celda-sec">{e.equipos.descripcion}</span>}
                </span>
                <span className="mis-equipos__meta">
                  <span className="sev est--completado">{ROLES[e.rol]}</span>
                  <span className="celda-sec">Desde {formatearFecha(e.unido_en)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  )
}
