import { Link, useLocation } from 'react-router-dom'
import { ClipboardList, History, LayoutDashboard, ShieldCheck } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { cerrarSesion } from '../services/authService.js'
import AvisoInvitaciones from './AvisoInvitaciones.jsx'
import SaltarContenido from './SaltarContenido.jsx'
import '../styles/header.css'

export default function SiteHeader() {
  const { usuario, cargando, esAdmin, esLider, esMiembro, esColaborador } = useAuth()
  const nombre = usuario?.user_metadata?.nombre ?? usuario?.email
  const enInvitacion = useLocation().pathname.startsWith('/invitacion')

  return (
    <header className="sitio-header">
      <SaltarContenido />
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
                  <Link className="btn-cabecera" to="/mis-analisis">
                    <History size={14} aria-hidden="true" style={{ marginRight: 6 }} />
                    Mis análisis
                  </Link>
                  {esMiembro && (
                    <Link className="btn-cabecera" to="/mi-trabajo">
                      <ClipboardList size={14} aria-hidden="true" style={{ marginRight: 6 }} />
                      {esColaborador ? 'Mi trabajo' : 'Mi equipo'}
                    </Link>
                  )}
                  {esLider && (
                    <Link className="btn-cabecera btn-cabecera--primario" to="/admin/equipos">
                      <LayoutDashboard size={14} aria-hidden="true" style={{ marginRight: 6 }} />
                      Mis equipos
                    </Link>
                  )}
                  {esAdmin && (
                    <Link className="btn-cabecera btn-cabecera--primario" to="/admin">
                      <LayoutDashboard size={14} aria-hidden="true" style={{ marginRight: 6 }} />
                      Panel admin
                    </Link>
                  )}
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
      {!cargando && usuario && !enInvitacion && <AvisoInvitaciones />}
    </header>
  )
}