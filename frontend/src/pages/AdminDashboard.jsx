import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDown, ArrowUp, ArrowUpDown, Eye } from 'lucide-react'
import AdminLayout from '../components/AdminLayout.jsx'
import { ESTADOS_ANALISIS } from '../constants/estados.js'
import { listarAnalisis, obtenerResumen } from '../services/adminService.js'
import { claveUI, etiquetaNivel } from '../utils/severidad.js'
import { formatearFecha } from '../utils/formato.js'

const COLUMNAS = [
  { clave: 'repo', etiqueta: 'Repositorio' },
  { clave: 'usuario', etiqueta: 'Usuario' },
  { clave: 'estado', etiqueta: 'Estado' },
  { clave: 'total', etiqueta: 'Hallazgos' },
  { clave: 'iniciadoEn', etiqueta: 'Fecha' },
]
const POR_PAGINA = [10, 25, 50]
const NIVELES = ['critico', 'alto', 'medio', 'bajo']

function ventana(actual, total) {
  const inicio = Math.max(1, Math.min(actual - 2, total - 4))
  const fin = Math.min(total, inicio + 4)
  return Array.from({ length: fin - inicio + 1 }, (_, i) => inicio + i)
}

export default function AdminDashboard() {
  const [resumen, setResumen] = useState(null)
  const [filas, setFilas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [intento, setIntento] = useState(0)

  const [busqueda, setBusqueda] = useState('')
  const [estado, setEstado] = useState('todos')
  const [porPagina, setPorPagina] = useState(10)
  const [pagina, setPagina] = useState(1)
  const [orden, setOrden] = useState({ clave: 'iniciadoEn', dir: 'desc' })

  useEffect(() => {
    let activo = true
    setCargando(true)
    setError('')
    Promise.all([obtenerResumen(), listarAnalisis()]).then(([r, l]) => {
      if (!activo) return
      if (r.error || l.error) {
        setError('No se pudieron cargar los datos. Inténtalo de nuevo.')
      } else {
        setResumen(r.data)
        setFilas(l.data)
      }
      setCargando(false)
    })
    return () => {
      activo = false
    }
  }, [intento])

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    const signo = orden.dir === 'asc' ? 1 : -1
    return filas
      .filter(
        (f) =>
          (estado === 'todos' || f.estado === estado) &&
          (!q || `${f.repo} ${f.usuario} ${f.correo} ${f.consulta}`.toLowerCase().includes(q))
      )
      .sort((a, b) => {
        const x = a[orden.clave]
        const y = b[orden.clave]
        const c =
          typeof x === 'number' && typeof y === 'number'
            ? x - y
            : String(x).localeCompare(String(y), 'es')
        return c * signo
      })
  }, [filas, busqueda, estado, orden])

  const total = filtradas.length
  const paginas = Math.max(1, Math.ceil(total / porPagina))
  const actual = Math.min(pagina, paginas)
  const inicio = (actual - 1) * porPagina
  const visibles = filtradas.slice(inicio, inicio + porPagina)

  function ordenarPor(clave) {
    setOrden((o) =>
      o.clave === clave
        ? { clave, dir: o.dir === 'asc' ? 'desc' : 'asc' }
        : { clave, dir: 'asc' }
    )
    setPagina(1)
  }

  const tarjetas = resumen && [
    { etiqueta: 'Análisis realizados', valor: resumen.analisis, color: 'var(--accent)' },
    { etiqueta: 'Usuarios registrados', valor: resumen.usuarios, color: 'var(--sev-baja)' },
    { etiqueta: 'Hallazgos detectados', valor: resumen.hallazgos, color: 'var(--sev-media)' },
    { etiqueta: 'Severidad alta', valor: resumen.altos, color: 'var(--sev-alta)' },
  ]

  return (
    <AdminLayout
      titulo="Panel de administración"
      descripcion="Análisis de seguridad realizados por todos los usuarios."
    >
      {tarjetas && (
        <section className="kpis" aria-label="Totales">
          {tarjetas.map((t) => (
            <div key={t.etiqueta} className="kpi" style={{ '--c': t.color }}>
              <p className="kpi__etiqueta">{t.etiqueta}</p>
              <p className="kpi__valor">{t.valor}</p>
            </div>
          ))}
        </section>
      )}

      <section className="panel" aria-label="Análisis de proyectos">
        <div className="panel__cabecera">
          <h2>Análisis de proyectos</h2>
        </div>

        {cargando && (
          <p className="estado-vacio" role="status">
            Cargando análisis…
          </p>
        )}

        {!cargando && error && (
          <div className="estado-vacio" role="alert">
            <p>{error}</p>
            <button
              type="button"
              className="btn-primario"
              style={{ marginTop: 12 }}
              onClick={() => setIntento((n) => n + 1)}
            >
              Reintentar
            </button>
          </div>
        )}

        {!cargando && !error && filas.length === 0 && (
          <p className="estado-vacio">
            Todavía no hay análisis registrados. Aparecerán aquí cuando los usuarios analicen
            repositorios.
          </p>
        )}

        {!cargando && !error && filas.length > 0 && (
          <>
            <div className="panel__herramientas">
              <label className="herramienta">
                Mostrar
                <select
                  value={porPagina}
                  onChange={(e) => {
                    setPorPagina(Number(e.target.value))
                    setPagina(1)
                  }}
                >
                  {POR_PAGINA.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                registros
              </label>

              <div className="herramienta">
                <label className="herramienta">
                  Estado
                  <select
                    value={estado}
                    onChange={(e) => {
                      setEstado(e.target.value)
                      setPagina(1)
                    }}
                  >
                    <option value="todos">Todos</option>
                    {Object.entries(ESTADOS_ANALISIS).map(([clave, etiqueta]) => (
                      <option key={clave} value={clave}>
                        {etiqueta}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="herramienta">
                  Buscar:
                  <input
                    type="search"
                    value={busqueda}
                    onChange={(e) => {
                      setBusqueda(e.target.value)
                      setPagina(1)
                    }}
                    placeholder="Repositorio, usuario o correo"
                  />
                </label>
              </div>
            </div>

            <div className="tabla__scroll">
              <table className="tabla">
                <thead>
                  <tr>
                    {COLUMNAS.map((c) => (
                      <th
                        key={c.clave}
                        scope="col"
                        aria-sort={
                          orden.clave === c.clave
                            ? orden.dir === 'asc'
                              ? 'ascending'
                              : 'descending'
                            : 'none'
                        }
                      >
                        <button type="button" className="tabla__orden" onClick={() => ordenarPor(c.clave)}>
                          {c.etiqueta}
                          {orden.clave === c.clave ? (
                            orden.dir === 'asc' ? (
                              <ArrowUp size={14} aria-hidden="true" />
                            ) : (
                              <ArrowDown size={14} aria-hidden="true" />
                            )
                          ) : (
                            <ArrowUpDown size={14} aria-hidden="true" />
                          )}
                        </button>
                      </th>
                    ))}
                    <th scope="col">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((f) => (
                    <tr key={f.id}>
                      <td className="celda-mono">{f.repo}</td>
                      <td>
                        {f.usuario}
                        <span className="celda-sec">{f.correo}</span>
                      </td>
                      <td>
                        <span className={`sev est--${f.estado}`}>
                          {ESTADOS_ANALISIS[f.estado] ?? f.estado}
                        </span>
                      </td>
                      <td>
                        <div className="celda-badges">
                          <span className="celda-mono">{f.total}</span>
                          {NIVELES.filter((n) => f.conteo[n] > 0).map((n) => (
                            <span key={n} className={`sev sev--${claveUI(n)}`}>
                              <span className="sr-only">{etiquetaNivel(n)}: </span>
                              {f.conteo[n]}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>{formatearFecha(f.iniciadoEn)}</td>
                      <td>
                        <Link className="btn-tabla" to={`/admin/analisis/${f.id}`}>
                          <Eye size={14} aria-hidden="true" />
                          Ver detalle
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {total === 0 && (
              <p className="estado-vacio">Ningún análisis coincide con la búsqueda.</p>
            )}

            <div className="panel__pie">
              <p>
                {total === 0
                  ? 'No hay registros que mostrar'
                  : `Mostrando registros del ${inicio + 1} al ${inicio + visibles.length} de un total de ${total} registros`}
              </p>
              <nav className="paginacion" aria-label="Paginación">
                <button
                  type="button"
                  className="pag-btn"
                  disabled={actual === 1}
                  onClick={() => setPagina(actual - 1)}
                >
                  Anterior
                </button>
                {ventana(actual, paginas).map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`pag-btn ${n === actual ? 'pag-btn--activo' : ''}`}
                    aria-current={n === actual ? 'page' : undefined}
                    onClick={() => setPagina(n)}
                  >
                    {n}
                  </button>
                ))}
                <button
                  type="button"
                  className="pag-btn"
                  disabled={actual === paginas}
                  onClick={() => setPagina(actual + 1)}
                >
                  Siguiente
                </button>
              </nav>
            </div>
          </>
        )}
      </section>
    </AdminLayout>
  )
}