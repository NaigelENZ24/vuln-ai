import { useEffect, useState } from 'react'
import { ExternalLink, GitBranch, RefreshCw, Trash2 } from 'lucide-react'
import { analizarRama, vincularRepositorio } from '../services/analyzerApi.js'
import { listarRamas, quitarRepositorio, semaforoRamas } from '../services/incidenciasService.js'
import { ESTADOS_ANALISIS } from '../constants/estados.js'
import { MENSAJE_URL_INVALIDA, parseRepoGitHub } from '../utils/github.js'
import { formatearFecha } from '../utils/formato.js'
import Esqueleto from './Esqueleto.jsx'

const EN_CURSO = ['pendiente', 'en_proceso']

// Semáforo de fusión de una rama frente a la principal (lo calcula la base comparando huellas).
function Semaforo({ rama, s }) {
  if (rama.es_principal) return <span className="celda-sec">Rama principal</span>
  if (!s) return <span className="celda-sec">Analiza esta rama y la principal para compararlas</span>
  const nuevas = s.nuevas_alta + s.nuevas_media + s.nuevas_baja
  const estado = s.nuevas_alta > 0 ? 'no' : nuevas > 0 ? 'obs' : 'lista'
  const texto = { no: 'No recomendada', obs: 'Con observaciones', lista: 'Lista para fusionar' }[estado]
  return (
    <span className="semaforo">
      <span className={`sev semaforo--${estado}`}>{texto}</span>
      <span className="celda-sec">
        +{nuevas} nueva{nuevas === 1 ? '' : 's'}
        {s.nuevas_alta > 0 && ` (${s.nuevas_alta} alta${s.nuevas_alta > 1 ? 's' : ''})`} · {s.corregidas} corregida
        {s.corregidas === 1 ? '' : 's'} frente a la principal
      </span>
    </span>
  )
}

// Repositorios del equipo y sus ramas vigiladas, con re-análisis manual por rama.
export default function RepositoriosEquipo({ equipoId }) {
  const [repos, setRepos] = useState(null)
  const [error, setError] = useState('')
  const [intento, setIntento] = useState(0)
  const [url, setUrl] = useState('')
  const [ramas, setRamas] = useState('')
  const [errorForm, setErrorForm] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState('')
  const [semaforo, setSemaforo] = useState({})

  const recargar = () => setIntento((n) => n + 1)

  useEffect(() => {
    let activo = true
    let temporizador
    Promise.all([listarRamas(equipoId), semaforoRamas(equipoId)]).then(([{ data, error: fallo }, s]) => {
      if (!activo) return
      if (fallo) setError(fallo)
      else {
        setError('')
        setRepos(data)
        setSemaforo(s.data ?? {})
        // Mientras alguna rama se esté analizando, se actualiza sola cada 5 s.
        if (data.some((r) => r.ramas_vigiladas.some((v) => EN_CURSO.includes(v.ultimo?.estado)))) {
          temporizador = setTimeout(recargar, 5000)
        }
      }
    })
    return () => {
      activo = false
      clearTimeout(temporizador)
    }
  }, [equipoId, intento])

  async function vincular(e) {
    e.preventDefault()
    if (!parseRepoGitHub(url)) {
      setErrorForm(MENSAJE_URL_INVALIDA)
      return
    }
    setGuardando(true)
    setErrorForm('')
    const lista = ramas.split(',').map((r) => r.trim()).filter(Boolean)
    const { data, error: fallo } = await vincularRepositorio(equipoId, url.trim(), lista)
    setGuardando(false)
    if (fallo) {
      setErrorForm(fallo)
      return
    }
    setUrl('')
    setRamas('')
    setAviso(`Repositorio vinculado. Ramas vigiladas: ${data.ramas.join(', ')}. Analízalas para crear las incidencias.`)
    recargar()
  }

  async function quitar(repo) {
    const ok = window.confirm(
      `¿Quitar ${repo.nombre} del equipo?\n\nSe borrarán sus ramas vigiladas, análisis, incidencias, comentarios e historial. No se puede deshacer.`
    )
    if (!ok) return
    setAviso('')
    const { error: fallo } = await quitarRepositorio(repo.id)
    setAviso(fallo || `${repo.nombre} se quitó del equipo.`)
    recargar()
  }

  async function analizar(rama) {
    setAviso('')
    const { error: fallo } = await analizarRama(rama.id)
    if (fallo) setAviso(fallo)
    else recargar()
  }

  return (
    <>
      <form className="panel equipo-nuevo" onSubmit={vincular} noValidate data-tutorial="vincular">
        <h2 className="equipo-nuevo__titulo">Vincular un repositorio</h2>
        <div className="eq-campos">
          <label className="eq-campo eq-campo--ancho">
            URL del repositorio público
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://github.com/usuario/repositorio"
              aria-invalid={Boolean(errorForm) || undefined}
            />
          </label>
          <label className="eq-campo eq-campo--ancho">
            Otras ramas a vigilar (opcional)
            <input value={ramas} onChange={(e) => setRamas(e.target.value)} placeholder="feature/login, fix/upload" />
          </label>
          <button type="submit" className="btn-primario" disabled={guardando}>
            {guardando ? 'Comprobando en GitHub…' : 'Vincular'}
          </button>
        </div>
        <p className="plegable__nota">La rama principal se vigila siempre. Separa las demás con comas.</p>
        {errorForm && (
          <p className="form-error" role="alert">
            {errorForm}
          </p>
        )}
      </form>

      {aviso && (
        <p className="panel__aviso panel__aviso--suelto" role="status">
          {aviso}
        </p>
      )}

      {error && (
        <div className="panel estado-vacio" role="alert">
          <p>{error}</p>
          <button type="button" className="btn-primario" style={{ marginTop: 12 }} onClick={recargar}>
            Reintentar
          </button>
        </div>
      )}

      {!error && repos === null && (
        <Esqueleto forma="tarjetas" etiqueta="Cargando repositorios…" />
      )}

      {repos?.length === 0 && (
        <p className="panel estado-vacio">El equipo aún no tiene repositorios. Vincula el primero con el formulario de arriba.</p>
      )}

      {repos?.map((repo) => (
        <section key={repo.id} className="panel" aria-label={repo.nombre}>
          <div className="panel__cabecera repo-equipo__cabecera">
            <h2 className="celda-mono">{repo.nombre}</h2>
            <span className="acciones-fila">
              <a className="detalle__enlace" href={repo.url} target="_blank" rel="noreferrer">
                Ver en GitHub <ExternalLink size={14} aria-hidden="true" />
              </a>
              <button type="button" className="btn-peligro" onClick={() => quitar(repo)}>
                <Trash2 size={14} aria-hidden="true" /> Quitar
              </button>
            </span>
          </div>
          <ul className="ramas">
            {repo.ramas_vigiladas.map((v) => {
              const u = v.ultimo
              const enCurso = EN_CURSO.includes(u?.estado)
              return (
                <li key={v.id} className="ramas__fila">
                  <span className="ramas__nombre">
                    <GitBranch size={16} aria-hidden="true" />
                    <span className="celda-mono">{v.rama}</span>
                    {v.es_principal && <span className="rol">Principal</span>}
                  </span>
                  <span className="ramas__estado">
                    {u ? (
                      <>
                        <span className={`sev est--${u.estado}`}>{ESTADOS_ANALISIS[u.estado]}</span>
                        <span className="celda-sec">
                          {u.estado === 'error' ? u.error_mensaje : formatearFecha(u.finalizado_en ?? u.iniciado_en)}
                          {v.ultimo_sha && u.estado === 'completado' && ` · ${v.ultimo_sha.slice(0, 7)}`}
                        </span>
                      </>
                    ) : (
                      <span className="celda-sec">Sin analizar</span>
                    )}
                  </span>
                  <span className="ramas__semaforo">
                    <Semaforo rama={v} s={semaforo[v.id]} />
                  </span>
                  <button type="button" className="btn-tabla" disabled={enCurso} onClick={() => analizar(v)}>
                    <RefreshCw size={14} aria-hidden="true" />
                    {enCurso ? 'Analizando…' : u ? 'Re-analizar' : 'Analizar'}
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </>
  )
}
