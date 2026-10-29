import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ExternalLink, GitBranch, ScanSearch, Star } from 'lucide-react'
import SiteHeader from '../components/SiteHeader.jsx'
import ResumenRiesgo from '../components/ResumenRiesgo.jsx'
import ListaHallazgos from '../components/ListaHallazgos.jsx'
import ChatAsistente from '../components/ChatAsistente.jsx'
import { MENSAJE_URL_INVALIDA, parseRepoGitHub } from '../utils/github.js'
import '../styles/analisis.css'

export default function Analisis() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const repoParam = params.get('repo') ?? ''
  const [url, setUrl] = useState(repoParam)
  const [error, setError] = useState('')
  const info = parseRepoGitHub(repoParam)

  // Pendiente (lógica): aquí se guardará la respuesta del microservicio de análisis.
  // Forma esperada cuando exista:
  // {
  //   repo: { rama, lenguaje, estrellas, archivos, lineas, reglas, segundos },
  //   riesgoGlobal: { etiqueta, severidad },
  //   interpretacion: { estado: 'ok' | 'error', parrafos: [], mensaje },
  //   hallazgos: [{ id, severidad, titulo, ruta, cwe, categoria }],
  // }
  const [resultado] = useState(null)

  useEffect(() => {
    setUrl(repoParam)
    setError('')
  }, [repoParam])

  function analizar(e) {
    e.preventDefault()
    if (!parseRepoGitHub(url)) {
      setError(MENSAJE_URL_INVALIDA)
      return
    }
    setError('')
    navigate(`/analisis?repo=${encodeURIComponent(url.trim())}`)
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
          <button className="btn-primario" type="submit">
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
                  {resultado && (
                    <p className="repo__meta">
                      <span>rama {resultado.repo.rama}</span>
                      <span>{resultado.repo.lenguaje}</span>
                      <span>
                        <Star size={14} aria-hidden="true" /> {resultado.repo.estrellas}
                      </span>
                      <span>
                        {resultado.repo.archivos} · {resultado.repo.lineas} líneas ·{' '}
                        {resultado.repo.reglas} reglas · {resultado.repo.segundos} s
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

            {info &&
              (resultado ? (
                <>
                  <ResumenRiesgo
                    hallazgos={resultado.hallazgos}
                    riesgoGlobal={resultado.riesgoGlobal}
                    interpretacion={resultado.interpretacion}
                    onReintentar={() => {}}
                  />
                  <ListaHallazgos hallazgos={resultado.hallazgos} />
                </>
              ) : (
                <section className="pendiente">
                  <ScanSearch size={28} aria-hidden="true" />
                  <h2>Análisis pendiente</h2>
                  <p>
                    Todavía no hay resultados para este repositorio. Cuando el análisis termine,
                    aquí aparecerán el riesgo global, la interpretación del LLM y la lista de
                    hallazgos.
                  </p>
                </section>
              ))}
          </div>

          <ChatAsistente habilitado={Boolean(resultado)} mensajes={[]} onEnviar={() => {}} />
        </div>
      </div>
    </div>
  )
}