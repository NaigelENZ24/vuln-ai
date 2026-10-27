import { useState } from 'react'
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

  function enviar(e) {
    e.preventDefault()
    // Pendiente (lógica): validar la URL, exigir sesión e iniciar el análisis.
    console.log('Repositorio a analizar:', url)
  }

  return (
    <div className="landing">
      <header className="landing__header">
        <a className="marca" href="/">
          <svg className="marca__logo" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3l8 3v6c0 4.5-3.2 8.2-8 9-4.8-.8-8-4.5-8-9V6l8-3z" />
            <path d="M9 12l2 2 4-4" />
          </svg>
          <span className="marca__nombre">Centinela</span>
          <span className="marca__etiqueta">SAST + LLM</span>
        </a>
        <p className="landing__aviso">
          Solo lectura · El sistema no modifica tu código ni aplica correcciones
        </p>
      </header>

      <main>
        <section className="hero">
          <p className="hero__eyebrow">Seguridad de aplicaciones asistida por IA</p>
          <h1>Encuentra y entiende las vulnerabilidades de tu repositorio</h1>
          <p className="hero__texto">
            Vincula un repositorio público de GitHub. Centinela ejecuta un análisis estático de
            seguridad, un modelo de lenguaje interpreta los resultados y prioriza el riesgo, y tú
            exploras los hallazgos conversando.
          </p>

          <form className="repo-form" onSubmit={enviar}>
            <label htmlFor="repo-url">URL del repositorio de GitHub</label>
            <div className="repo-form__fila">
              <input
                id="repo-url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://github.com/usuario/repositorio"
                required
              />
              <button type="submit">Analizar repositorio</button>
            </div>
          </form>

          <div className="ejemplos">
            <span>Prueba con:</span>
            {EJEMPLOS.map((repo) => (
              <button
                key={repo}
                type="button"
                onClick={() => setUrl(`https://github.com/${repo}`)}
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