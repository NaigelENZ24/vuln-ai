import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import SiteHeader from '../components/SiteHeader.jsx'
import { MENSAJE_URL_INVALIDA, parseRepoGitHub } from '../utils/github.js'
import '../styles/landing.css'

const EJEMPLOS = [
  'OWASP/NodeGoat',
  'we45/Vulnerable-Flask-App',
  'digininja/DVWA',
]

const PASOS = [
  {
    n: '01',
    titulo: 'Análisis estático',
    texto: '30 reglas SAST detectan secretos, inyecciones, XSS, criptografía débil y configuraciones inseguras.',
  },
  {
    n: '02',
    titulo: 'Interpretación con LLM',
    texto: 'Cada hallazgo se explica en lenguaje natural con su impacto y una prioridad de P1 a P4.',
  },
  {
    n: '03',
    titulo: 'Consultas en lenguaje natural',
    texto: 'Pregunta qué atender primero, qué archivos concentran riesgo o cómo funciona un ataque.',
  },
  {
    n: '04',
    titulo: 'Sin cambios en tu código',
    texto: 'Acceso de solo lectura. La remediación queda siempre bajo responsabilidad del desarrollador.',
  },
]

export default function Landing() {
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const navigate = useNavigate()

  function enviar(e) {
    e.preventDefault()
    if (!parseRepoGitHub(url)) {
      setError(MENSAJE_URL_INVALIDA)
      return
    }
    setError('')
    navigate(`/analisis?repo=${encodeURIComponent(url.trim())}`)
  }

  return (
    <div className="landing">
      <SiteHeader />

      <main>
        <section className="hero">
          <p className="hero__eyebrow">Seguridad de aplicaciones asistida por IA</p>
          <h1>Encuentra y entiende las vulnerabilidades de tu repositorio</h1>
          <p className="hero__texto">
            Vincula un repositorio público de GitHub. Centinela ejecuta un análisis estático de
            seguridad, un modelo de lenguaje interpreta los resultados y prioriza el riesgo, y tú
            exploras los hallazgos conversando.
          </p>

          <form className="repo-form" onSubmit={enviar} noValidate>
            <label htmlFor="repo-url">URL del repositorio de GitHub</label>
            <div className="repo-form__fila">
              <input
                id="repo-url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://github.com/usuario/repositorio"
              />
              <button type="submit">Analizar repositorio</button>
            </div>
            {error && (
              <p className="repo-form__error" role="alert">
                {error}
              </p>
            )}
          </form>

          <div className="ejemplos">
            <span>Prueba con:</span>
            {EJEMPLOS.map((repo) => (
              <button
                key={repo}
                type="button"
                onClick={() => {
                  setUrl(`https://github.com/${repo}`)
                  setError('')
                }}
              >
                {repo}
              </button>
            ))}
          </div>
        </section>

        <section aria-label="Cómo funciona">
          <ol className="pasos">
            {PASOS.map((p) => (
              <li className="paso" key={p.n}>
                <span className="paso__num">{p.n}</span>
                <h2>{p.titulo}</h2>
                <p>{p.texto}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>
    </div>
  )
}