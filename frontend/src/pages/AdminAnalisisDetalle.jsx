import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react'
import AdminLayout from '../components/AdminLayout.jsx'
import { ESTADOS_ANALISIS, ESTADOS_HALLAZGO } from '../constants/estados.js'
import { obtenerAnalisis } from '../services/adminService.js'
import { ORDEN_NIVEL, claveUI, etiquetaNivel } from '../utils/severidad.js'
import { formatearFecha } from '../utils/formato.js'

const POR_PAGINA = 20

export default function AdminAnalisisDetalle() {
  const { id } = useParams()
  const [analisis, setAnalisis] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [pagina, setPagina] = useState(1)
  const seccionHallazgos = useRef(null)

  useEffect(() => {
    let activo = true
    setCargando(true)
    setError('')
    setAnalisis(null)
    setPagina(1)
    obtenerAnalisis(id).then(({ data, error: fallo }) => {
      if (!activo) return
      if (fallo) setError('No se pudo cargar el análisis.')
      else if (!data) setError('No existe un análisis con ese identificador.')
      else setAnalisis(data)
      setCargando(false)
    })
    return () => {
      activo = false
    }
  }, [id])

  const hallazgos = useMemo(
    () =>
      [...(analisis?.hallazgos ?? [])].sort(
        (a, b) => (ORDEN_NIVEL[a.severidad] ?? 9) - (ORDEN_NIVEL[b.severidad] ?? 9)
      ),
    [analisis]
  )

  const paginas = Math.max(1, Math.ceil(hallazgos.length / POR_PAGINA))
  const inicio = (pagina - 1) * POR_PAGINA
  const visibles = hallazgos.slice(inicio, inicio + POR_PAGINA)

  function irAPagina(n) {
    setPagina(n)
    // Al cambiar de página se vuelve al inicio de la lista, no al pie donde están las flechas.
    seccionHallazgos.current?.scrollIntoView({ block: 'start' })
  }

  const repo = analisis?.repositorios
  const usuario = analisis?.perfiles

  return (
    <AdminLayout
      titulo="Detalle del análisis"
      descripcion={repo?.nombre ?? repo?.url ?? undefined}
    >
      <Link className="detalle__volver" to="/admin">
        <ArrowLeft size={16} aria-hidden="true" />
        Volver al panel
      </Link>

      {cargando && (
        <p className="estado-vacio" role="status">
          Cargando análisis…
        </p>
      )}
      {!cargando && error && (
        <p className="estado-vacio" role="alert">
          {error}
        </p>
      )}

      {analisis && (
        <>
          <section className="panel" aria-label="Información del análisis">
            <div className="panel__cabecera detalle__titulo">
              <h2>Información</h2>
              <span className={`sev est--${analisis.estado}`}>
                {ESTADOS_ANALISIS[analisis.estado] ?? analisis.estado}
              </span>
            </div>
            <dl className="ficha">
              <div>
                <dt>Usuario</dt>
                <dd>
                  {usuario?.nombre ?? '—'}
                  <span className="celda-sec">{usuario?.correo}</span>
                </dd>
              </div>
              <div>
                <dt>Repositorio</dt>
                <dd>
                  {repo?.url ? (
                    <a className="detalle__enlace" href={repo.url} target="_blank" rel="noreferrer">
                      {repo.nombre ?? repo.url} <ExternalLink size={13} aria-hidden="true" />
                    </a>
                  ) : (
                    '—'
                  )}
                </dd>
              </div>
              <div>
                <dt>Rama</dt>
                <dd>{repo?.rama ?? '—'}</dd>
              </div>
              <div>
                <dt>Inicio</dt>
                <dd>{formatearFecha(analisis.iniciado_en)}</dd>
              </div>
              <div>
                <dt>Finalización</dt>
                <dd>{formatearFecha(analisis.finalizado_en)}</dd>
              </div>
              <div>
                <dt>Commit</dt>
                <dd className="celda-mono">{analisis.commit_sha ?? '—'}</dd>
              </div>
              <div>
                <dt>Analizadores</dt>
                <dd>{analisis.version_bandit ?? '—'}</dd>
              </div>
              <div>
                <dt>Modelo de IA</dt>
                <dd>{analisis.modelo_llm ?? '—'}</dd>
              </div>
              <div>
                <dt>Alcance</dt>
                <dd>{analisis.alcance ?? '—'}</dd>
              </div>
            </dl>
          </section>

          <section className="panel" aria-label="Consulta del usuario">
            <div className="panel__cabecera">
              <h2>Consulta del usuario</h2>
            </div>
            <p className="texto-bloque">{analisis.consulta_nl || 'Sin consulta en lenguaje natural.'}</p>
          </section>

          <section className="panel" aria-label="Resumen de la IA">
            <div className="panel__cabecera">
              <h2>Resumen de la IA</h2>
            </div>
            <p className="texto-bloque">{analisis.resumen_ia || 'Todavía no hay resumen generado.'}</p>
          </section>

          <section className="panel" aria-label="Hallazgos" ref={seccionHallazgos}>
            <div className="panel__cabecera">
              <h2>Hallazgos ({hallazgos.length})</h2>
            </div>
            {hallazgos.length === 0 ? (
              <p className="estado-vacio">Este análisis no tiene hallazgos registrados.</p>
            ) : (
              <>
              <div className="lista-hall">
                {visibles.map((h) => (
                  <details key={h.id}>
                    <summary>
                      <span className={`sev sev--${claveUI(h.severidad)}`}>
                        {etiquetaNivel(h.severidad)}
                      </span>
                      <span>
                        <strong className="celda-mono">{h.regla_id}</strong>
                        <span className="celda-sec celda-mono">
                          {h.archivo}
                          {h.linea ? `:${h.linea}` : ''}
                        </span>
                      </span>
                      <span className="celda-mono ocultar-movil">{h.cwe_id ?? '—'}</span>
                      <span className="ocultar-movil">{ESTADOS_HALLAZGO[h.estado] ?? h.estado}</span>
                    </summary>
                    <div className="lista-hall__cuerpo">
                      <p className="celda-sec">
                        Confianza: {etiquetaNivel(h.confianza)} · Prioridad: {etiquetaNivel(h.prioridad)}
                      </p>
                      {h.fragmento_codigo && (
                        <div>
                          <p className="bloque__titulo">Código afectado</p>
                          <pre className="codigo">
                            <code>{h.fragmento_codigo}</code>
                          </pre>
                        </div>
                      )}
                      <div>
                        <p className="bloque__titulo">Explicación de la IA</p>
                        <p className="texto-bloque texto-bloque--suelto">
                          {h.explicacion_ia || 'Sin explicación generada.'}
                        </p>
                      </div>
                      <div>
                        <p className="bloque__titulo">Recomendación</p>
                        <p className="texto-bloque texto-bloque--suelto">
                          {h.recomendacion_ia || 'Sin recomendación generada.'}
                        </p>
                      </div>
                    </div>
                  </details>
                ))}
              </div>
              {paginas > 1 && (
                <div className="panel__pie">
                  <p aria-live="polite">
                    Hallazgos {inicio + 1} a {inicio + visibles.length} de {hallazgos.length} · Página {pagina} de{' '}
                    {paginas}
                  </p>
                  <nav className="paginacion" aria-label="Páginas de hallazgos">
                    <button
                      type="button"
                      className="pag-btn"
                      disabled={pagina === 1}
                      onClick={() => irAPagina(pagina - 1)}
                      aria-label="Hallazgos anteriores"
                    >
                      <ChevronLeft size={18} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="pag-btn"
                      disabled={pagina === paginas}
                      onClick={() => irAPagina(pagina + 1)}
                      aria-label="Hallazgos siguientes"
                    >
                      <ChevronRight size={18} aria-hidden="true" />
                    </button>
                  </nav>
                </div>
              )}
              </>
            )}
          </section>
        </>
      )}
    </AdminLayout>
  )
}