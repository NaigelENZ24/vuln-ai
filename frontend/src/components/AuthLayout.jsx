import SiteHeader from './SiteHeader.jsx'
import '../styles/auth.css'

export default function AuthLayout({ titulo, subtitulo, pie, children }) {
  return (
    <div className="auth">
      <SiteHeader />
      <main className="auth__main">
        <section className="auth__tarjeta" aria-labelledby="auth-titulo">
          <h1 id="auth-titulo">{titulo}</h1>
          <p className="auth__subtitulo">{subtitulo}</p>
          {children}
          <p className="auth__pie">{pie}</p>
        </section>
      </main>
    </div>
  )
}