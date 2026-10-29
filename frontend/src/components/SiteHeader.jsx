import { Link } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { cerrarSesion } from '../services/authService.js'
import '../styles/header.css'

export default function SiteHeader() {
  const { usuario, cargando } = useAuth()
  const nombre = usuario?.user_metadata?.nombre ?? usuario?.email

  return (
    <header className="sitio-header">
      <div className="sitio-header__interior">
        <Link className="marca" to="/">
          <span className="marca__logo">
            <ShieldCheck size={18} aria-hidden="true" />
          </span>
          <span className="marca__nombre">Centinela</span>
          <span className="marca__etiqueta">SAST + LLM</span>
        </Link>

        <div className="sitio-header__derecha">
          <p className="sitio-header__aviso">
            Solo lectura · El sistema no modifica tu código ni aplica correcciones
          </p>
          {!cargando && (
            <nav className="sitio-header__acciones" aria-label="Cuenta">
              {usuario ? (
                <>
                  <span className="sitio-header__usuario">{nombre}</span>
                  <button type="button" className="btn-cabecera" onClick={cerrarSesion}>
                    Cerrar sesión
                  </button>
                </>
              ) : (
                <>
                  <Link className="btn-cabecera" to="/login">
                    Iniciar sesión
                  </Link>
                  <Link className="btn-cabecera btn-cabecera--primario" to="/registro">
                    Registrarse
                  </Link>
                </>
              )}
            </nav>
          )}
        </div>
      </div>
    </header>
  )
}