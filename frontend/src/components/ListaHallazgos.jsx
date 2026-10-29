import { useMemo, useState } from 'react'
import { ChevronRight, Search } from 'lucide-react'
import { SEVERIDADES } from '../constants/severidades.js'

const ORDEN = Object.fromEntries(SEVERIDADES.map((s, i) => [s.clave, i]))
const ETIQUETA = Object.fromEntries(SEVERIDADES.map((s) => [s.clave, s.etiqueta]))

export default function ListaHallazgos({ hallazgos, onAbrir }) {
  const [busqueda, setBusqueda] = useState('')
  const [severidad, setSeveridad] = useState('todas')
  const [categoria, setCategoria] = useState('todas')
  const [orden, setOrden] = useState('severidad')

  const categorias = useMemo(() => [...new Set(hallazgos.map((h) => h.categoria))], [hallazgos])

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return hallazgos
      .filter((h) => severidad === 'todas' || h.severidad === severidad)
      .filter((h) => categoria === 'todas' || h.categoria === categoria)
      .filter((h) => !q || `${h.titulo} ${h.ruta} ${h.cwe}`.toLowerCase().includes(q))
      .sort((a, b) => {
        if (orden === 'archivo') return a.ruta.localeCompare(b.ruta)
        if (orden === 'cwe') return a.cwe.localeCompare(b.cwe)
        return ORDEN[a.severidad] - ORDEN[b.severidad]
      })
  }, [hallazgos, busqueda, severidad, categoria, orden])

  return (
    <section aria-label="Hallazgos">
      <div className="lista__cabecera">
        <h2>
          Hallazgos <span>({hallazgos.length})</span>
        </h2>
        <label className="buscador">
          <span className="sr-only">Filtrar por archivo, regla o CWE</span>
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Filtrar por archivo, regla o CWE"
          />
        </label>
      </div>

      <div className="filtros">
        <button
          type="button"
          className={`filtro ${severidad === 'todas' ? 'filtro--activo' : ''}`}
          aria-pressed={severidad === 'todas'}
          onClick={() => setSeveridad('todas')}
        >
          Todas
        </button>
        {SEVERIDADES.map((s) => (
          <button
            key={s.clave}
            type="button"
            className={`filtro ${severidad === s.clave ? 'filtro--activo' : ''}`}
            aria-pressed={severidad === s.clave}
            onClick={() => setSeveridad(s.clave)}
          >
            {s.etiqueta}
          </button>
        ))}
        <select aria-label="Categoría" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
          <option value="todas">Todas las categorías</option>
          {categorias.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select aria-label="Orden" value={orden} onChange={(e) => setOrden(e.target.value)}>
          <option value="severidad">Ordenar por severidad</option>
          <option value="archivo">Ordenar por archivo</option>
          <option value="cwe">Ordenar por CWE</option>
        </select>
      </div>

      <div className="hallazgos">
        {visibles.length === 0 ? (
          <p className="vacio">Ningún hallazgo coincide con los filtros.</p>
        ) : (
          visibles.map((h) => (
            <button key={h.id} type="button" className="hallazgo" onClick={() => onAbrir?.(h)}>
              <span className={`sev sev--${h.severidad}`}>{ETIQUETA[h.severidad]}</span>
              <span>
                <span className="hallazgo__titulo">{h.titulo}</span>
                <span className="hallazgo__ruta">{h.ruta}</span>
              </span>
              <span className="hallazgo__cwe">{h.cwe}</span>
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          ))
        )}
      </div>
    </section>
  )
}