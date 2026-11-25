import SiteHeader from './SiteHeader.jsx'
import PiePagina from './PiePagina.jsx'
import { CORREO_CONTACTO, FECHA_LEGAL } from '../constants/legal.js'
import '../styles/legal.css'

// Plantilla de la política de privacidad y los términos. React 19 sube <title> al <head>.
// La meta description queda la de index.html: React añadiría otra en vez de reemplazarla.
export default function PaginaLegal({ titulo, children }) {
  return (
    <div className="legal">
      <title>{`${titulo} · Centinela`}</title>
      <SiteHeader />
      <main className="legal__main">
        <article className="legal__documento" aria-labelledby="legal-titulo">
          <h1 id="legal-titulo">{titulo}</h1>
          <p className="legal__fecha">Última actualización: {FECHA_LEGAL}</p>
          {children}
        </article>
      </main>
      <PiePagina />
    </div>
  )
}

export function Contacto() {
  return CORREO_CONTACTO ? (
    <a href={`mailto:${CORREO_CONTACTO}`}>{CORREO_CONTACTO}</a>
  ) : (
    'los autores del proyecto'
  )
}
