import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { Globe, LayoutDashboard, LogOut, Menu, ShieldCheck } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { cerrarSesion } from '../services/authService.js'
import '../styles/header.css'
import '../styles/admin.css'

export default function AdminLayout({ titulo, descripcion, children }) {
  const { perfil, usuario } = useAuth()
  const [menuAbierto, setMenuAbierto] = useState(false)
  const nombre = perfil?.nombre ?? usuario?.email
  const cerrarMenu = () => setMenuAbierto(false)

  return (
    <div className={`admin ${menuAbierto ? 'admin--menu' : ''}`}>
      <aside className="admin__lateral" aria-label="Navegación del panel">
        <Link className="marca admin__marca" to="/admin" onClick={cerrarMenu}>
          <span className="marca__logo">
            <ShieldCheck size={18} aria-hidden="true" />
          </span>
          <span className="marca__nombre">Centinela</span>
          <span className="marca__etiqueta">ADMIN</span>
        </Link>

        <p className="lateral__titulo">Administración</p>
        <NavLink
          to="/admin"
          className={({ isActive }) => `lateral__enlace ${isActive ? 'lateral__enlace--activo' : ''}`}
          onClick={cerrarMenu}
        >
          <LayoutDashboard size={18} aria-hidden="true" />
          Panel general
        </NavLink>

        <p className="lateral__titulo">Sitio</p>
        <Link className="lateral__enlace" to="/" onClick={cerrarMenu}>
          <Globe size={18} aria-hidden="true" />
          Ir al sitio
        </Link>
      </aside>

      {menuAbierto && (
        <button type="button" className="admin__velo" aria-label="Cerrar menú" onClick={cerrarMenu} />
      )}

      <div className="admin__cuerpo">
        <header className="admin__barra">
          <button
            type="button"
            className="admin__menu"
            aria-label="Abrir menú"
            aria-expanded={menuAbierto}
            onClick={() => setMenuAbierto((v) => !v)}
          >
            <Menu size={20} aria-hidden="true" />
          </button>
          <div className="admin__usuario">
            <span>{nombre}</span>
            <span className="sev est--completado">Administrador</span>
            <button type="button" className="btn-cabecera" onClick={cerrarSesion}>
              <LogOut size={14} aria-hidden="true" />
              Cerrar sesión
            </button>
          </div>
        </header>

        <main className="admin__contenido">
          <div className="admin__titulo">
            <h1>{titulo}</h1>
            {descripcion && <p>{descripcion}</p>}
          </div>
          {children}
        </main>
      </div>
    </div>
  )
}