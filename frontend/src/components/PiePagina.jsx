import { Link } from 'react-router-dom'
import '../styles/legal.css'

export default function PiePagina() {
  return (
    <footer className="pie">
      <p>Centinela · Proyecto académico de Ingeniería de Software</p>
      <nav aria-label="Información legal">
        <Link to="/privacidad">Política de privacidad</Link>
        <Link to="/terminos">Términos y condiciones</Link>
      </nav>
    </footer>
  )
}
