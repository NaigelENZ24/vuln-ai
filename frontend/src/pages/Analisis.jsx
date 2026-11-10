import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ExternalLink, GitBranch, LoaderCircle, ScanSearch } from 'lucide-react'
import SiteHeader from '../components/SiteHeader.jsx'
import ResumenRiesgo from '../components/ResumenRiesgo.jsx'
import ListaHallazgos from '../components/ListaHallazgos.jsx'
import HallazgoDetalle from '../components/HallazgoDetalle.jsx'
import ChatAsistente from '../components/ChatAsistente.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { iniciarAnalisis, preguntarIA } from '../services/analyzerApi.js'
import { obtenerAnalisis } from '../services/adminService.js'
import { obtenerMensajes } from '../services/analisisService.js'
import { aHallazgoUI, riesgoGlobal } from '../utils/analisisUI.js'
import { MENSAJE_URL_INVALIDA, parseRepoGitHub } from '../utils/github.js'
import { ESTADOS_ANALISIS } from '../constants/estados.js'
import '../styles/analisis.css'

const EN_CURSO = ['pendiente', 'en_proceso']
const INTERVALO_MS = 3000

export default function Analisis() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { usuario } = useAuth()
  const repoParam = params.get('repo') ?? ''

  const [url, setUrl] = useState(repoParam)
  const [error, setError] = useState('')
  const [iniciando, setIniciando] = useState(false)
  const [analisis, setAnalisis] = useState(null)
  const [seleccionado, setSeleccionado] = useState(null)
  const [mensajes, setMensajes] = useState([])
  const [enviando, setEnviando] = useState(false)
  const [errorChat, setErrorChat] = useState('')
  const iniciado = useRef('')

  // 1. /analisis?repo=... -> pide al servicio que cree el análisis y salta a /analisis/:id
  useEffect(() => {
    if (id || !parseRepoGitHub(repoParam) || iniciado.current === repoParam) return
    iniciado.current = repoParam // evita crear dos análisis (StrictMode ejecuta el efecto dos veces)
    setUrl(repoParam)
    setError('')
    setIniciando(true)
    iniciarAnalisis(repoParam.trim()).then(({ data, error: fallo }) => {
      setIniciando(false)
      if (fallo) setError(fallo)
      else navigate(`/analisis/${data.id}`, { replace: true })
    })
  }, [id, repoParam, navigate])

  // 2. /analisis/:id -> consulta Supabase cada 3 s mientras el análisis siga en curso
  useEffect(() => {
    if (!id) return
    let activo = true
    let temporizador
    setAnalisis(null)
    setSeleccionado(null)
    setError('')

    async function cargar() {
      const { data, error: fallo } = await obtenerAnalisis(id)
      if (!activo) return
      if (fallo || !data) {
        setError(fallo ? 'No se pudo cargar el análisis.' : 'No existe un análisis con ese identificador.')
        return
      }
      setAnalisis(data)
      if (EN_CURSO.includes(data.estado)) temporizador = setTimeout(cargar, INTERVALO_MS)
    }
    cargar()
    return () => {
      activo = false
      clearTimeout(temporizador)
    }
  }, [id])

  const completado = analisis?.estado === 'completado'

  useEffect(() => {
    if (!completado || !usuario) return
    let activo = true
    obtenerMensajes(id, usuario.id).then(({ data }) => {
      if (activo && data) setMensajes(data)
    })
    return () => {
      activo = false
    }
  }, [id, completado, usuario])

  const hallazgos = useMemo(() => (analisis?.hallazgos ?? []).map(aHallazgoUI), [analisis])
  const repo = analisis?.repositorios
  const info = parseRepoGitHub(repo?.url ?? repoParam)

  function analizar(e) {
    e.preventDefault()
    if (!parseRepoGitHub(url)) {
      setError(MENSAJE_URL_INVALIDA)
      return
    }
    iniciado.current = '' // permite reintentar la misma URL
    setError('')
    navigate(`/analisis?repo=${encodeURIComponent(url.trim())}`)
  }

  async function enviarPregunta(pregunta) {
    setErrorChat('')
    setEnviando(true)
    setMensajes((m) => [...m, { rol: 'usuario', texto: pregunta }])
    const { data, error: fallo } = await preguntarIA(id, pregunta)
    setEnviando(false)
    if (fallo) {
      setErrorChat(fallo)
      setMensajes((m) => m.slice(0, -1))
    } else {
      setMensajes((m) => [...m, { rol: 'ia', texto: data.respuesta }])
    }
  }

  return (
    <div className="analisis">
      <SiteHeader />

      <div className="analisis__contenedor">
        <form className="barra-repo" onSubmit={analizar} noValidate>
          <label className="barra-repo__campo">
            <span className="sr-only">URL del repositorio de GitHub</span>
            <GitBranch size={18} aria-hidden="true" />
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://github.com/usuario/repositorio"
            />
          </label>
          <button className="btn-primario" type="submit" disabled={iniciando}>
            <ScanSearch size={18} aria-hidden="true" />
            Analizar repositorio
          </button>
          {error && (
            <p className="barra-repo__error" role="alert">
              {error}
            </p>
          )}
        </form>

        <div className="analisis__rejilla">
          <div className="analisis__principal">
            <div>
              {info ? (
                <>
                  <div className="repo__titulo">
                    <h1>
                      {info.owner}/{info.repo}
                    </h1>
                    <a
                      className="repo__enlace"
                      href={`https://github.com/${info.owner}/${info.repo}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Ver en GitHub <ExternalLink size={14} aria-hidden="true" />
                    </a>
                  </div>
                  {completado && (
                    <p className="repo__meta">
                      <span>rama {repo?.rama}</span>
                      <span>
                        {analisis.archivos_analizados ?? '—'} archivos · {analisis.lineas ?? '—'} líneas ·{' '}
                        {analisis.segundos ?? '—'} s
                      </span>
                    </p>
                  )}
                </>
              ) : (
                <>
                  <h1 className="sr-only">Análisis de repositorio</h1>
                  <p className="repo__aviso">
                    {repoParam
                      ? MENSAJE_URL_INVALIDA
                      : 'Ingresa la URL de un repositorio de GitHub para comenzar el análisis.'}
                  </p>
                </>
              )}
            </div>

            {analisis?.estado === 'error' && (
              <p className="analisis__error" role="alert">
                El análisis falló: {analisis.error_mensaje ?? 'error desconocido.'}
              </p>
            )}

            {completado ? (
              <>
                <ResumenRiesgo
                  hallazgos={hallazgos}
                  riesgoGlobal={riesgoGlobal(hallazgos)}
                  interpretacion={
                    analisis.resumen_ia
                      ? { estado: 'ok', parrafos: analisis.resumen_ia.split(/\n\s*\n/) }
                      : {
                          estado: 'error',
                          mensaje: 'La IA no pudo generar la interpretación. Se muestran los hallazgos de Bandit.',
                        }
                  }
                />
                {seleccionado && <HallazgoDetalle hallazgo={seleccionado} onCerrar={() => setSeleccionado(null)} />}
                <ListaHallazgos hallazgos={hallazgos} onAbrir={setSeleccionado} />
              </>
            ) : (
              (iniciando || EN_CURSO.includes(analisis?.estado)) && (
                <section className="pendiente" role="status">
                  <LoaderCircle size={28} aria-hidden="true" />
                  <h2>{iniciando ? 'Preparando el análisis…' : `${ESTADOS_ANALISIS[analisis.estado]}…`}</h2>
                  <p>
                    Clonamos el repositorio, lo analizamos con Bandit y la IA interpreta los hallazgos. Puede tardar
                    unos minutos; esta página se actualiza sola.
                  </p>
                </section>
              )
            )}
          </div>

          <ChatAsistente
            habilitado={completado && !enviando}
            mensajes={mensajes}
            onEnviar={enviarPregunta}
            error={errorChat}
          />
        </div>
      </div>
    </div>
  )
}
