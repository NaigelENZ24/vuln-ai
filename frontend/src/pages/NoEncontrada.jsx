import { Link, useLocation } from 'react-router-dom'
import SiteHeader from '../components/SiteHeader.jsx'
import PiePagina from '../components/PiePagina.jsx'
import '../styles/legal.css'

export default function NoEncontrada() {
  const { pathname } = useLocation()
  return (
    <div className="legal">
      <title>Página no encontrada · Centinela</title>
      <meta name="robots" content="noindex" />
      <SiteHeader />
      <main className="legal__main legal__main--centro">
        <p className="legal__codigo" aria-hidden="true">
          404
        </p>
        <h1>Página no encontrada</h1>
        <p className="legal__texto">
          No existe ninguna página en <code>{pathname}</code>. Puede que el enlace esté mal escrito o que la página se
          haya movido.
        </p>
        <Link className="btn-primario" to="/">
          Volver al inicio
        </Link>
      </main>
      <PiePagina />
    </div>
  )
}
