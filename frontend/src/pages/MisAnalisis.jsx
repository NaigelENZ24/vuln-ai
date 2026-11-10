import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, ScanSearch } from 'lucide-react'
import SiteHeader from '../components/SiteHeader.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { listarAnalisis } from '../services/adminService.js'
import { ESTADOS_ANALISIS } from '../constants/estados.js'
import { claveUI, etiquetaNivel } from '../utils/severidad.js'
import { formatearFecha } from '../utils/formato.js'
import '../styles/analisis.css'

const NIVELES = ['alto', 'medio', 'bajo']

export default function MisAnalisis() {
  const { usuario } = useAuth()
  const [filas, setFilas] = useState(null)
  const [error, setError] = useState('')
  const [intento, setIntento] = useState(0)

  useEffect(() => {
    let activo = true
    setError('')
    listarAnalisis({ usuarioId: usuario.id }).then(({ data, error: fallo }) => {
      if (!activo) return
      if (fallo) setError('No se pudieron cargar tus análisis.')
      else setFilas(data)
    })
    return () => {
      activo = false
    }
  }, [usuario.id, intento])

  return (
    <div className="analisis">
      <SiteHeader />
      <main className="analisis__contenedor">
        <div className="mis__cabecera">
          <h1>Mis análisis</h1>
          <Link className="btn-primario" to="/">
            <ScanSearch size={18} aria-hidden="true" />
            Nuevo análisis
          </Link>
        </div>

        {error && (
          <div className="analisis__error" role="alert">
            <p>{error}</p>
            <button type="button" className="btn-primario" onClick={() => setIntento((n) => n + 1)}>
              Reintentar
            </button>
          </div>
        )}

        {!error && filas === null && (
          <p className="vacio" role="status">
            Cargando tus análisis…
          </p>
        )}

        {filas?.length === 0 && (
          <section className="pendiente">
            <ScanSearch size={28} aria-hidden="true" />
            <h2>Todavía no has analizado ningún repositorio</h2>
            <p>Pega la URL de un repositorio público de GitHub en la página de inicio para empezar.</p>
          </section>
        )}

        {filas?.length > 0 && (
          <ul className="hallazgos mis__lista" aria-label="Análisis realizados">
            {filas.map((f) => (
              <li key={f.id}>
                <Link className="hallazgo mis__fila" to={`/analisis/${f.id}`}>
                  <span className={`sev est--${f.estado}`}>{ESTADOS_ANALISIS[f.estado] ?? f.estado}</span>
                  <span>
                    <span className="hallazgo__titulo">{f.repo}</span>
                    <span className="hallazgo__ruta">
                      {formatearFecha(f.iniciadoEn)}
                      {f.consulta && ` · «${f.consulta}»`}
                    </span>
                  </span>
                  <span className="mis__conteo">
                    {f.estado === 'completado' &&
                      (f.total === 0 ? (
                        <span className="hallazgo__cwe">Sin hallazgos</span>
                      ) : (
                        NIVELES.filter((n) => f.conteo[n] > 0).map((n) => (
                          <span key={n} className={`sev sev--${claveUI(n)}`}>
                            <span className="sr-only">{etiquetaNivel(n)}: </span>
                            {f.conteo[n]}
                          </span>
                        ))
                      ))}
                  </span>
                  <ChevronRight size={18} aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
