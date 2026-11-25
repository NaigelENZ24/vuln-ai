import { useEffect, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { FileText, Globe, Inbox, LayoutDashboard, LogOut, Menu, ShieldCheck, Users } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { cerrarSesion } from '../services/authService.js'
import { contarPendientes } from '../services/solicitudesService.js'
import SaltarContenido from './SaltarContenido.jsx'
import '../styles/header.css'
import '../styles/admin.css'

export default function AdminLayout({ titulo, descripcion, children }) {
  const { perfil, usuario, esAdmin } = useAuth()
  const [menuAbierto, setMenuAbierto] = useState(false)
  const [pendientes, setPendientes] = useState(0)
  useEffect(() => {
    if (esAdmin) contarPendientes().then(({ data }) => setPendientes(data))
  }, [esAdmin])
  const clase = ({ isActive }) => `lateral__enlace ${isActive ? 'lateral__enlace--activo' : ''}`
  const nombre = perfil?.nombre ?? usuario?.email
  const cerrarMenu = () => setMenuAbierto(false)

  return (
    <div className={`admin ${menuAbierto ? 'admin--menu' : ''}`}>
      <SaltarContenido />
      <aside className="admin__lateral" aria-label="Navegación del panel">
        <Link className="marca admin__marca" to={esAdmin ? '/admin' : '/admin/equipos'} onClick={cerrarMenu}>
          <span className="marca__logo">
            <ShieldCheck size={18} aria-hidden="true" />
          </span>
          <span className="marca__nombre">Centinela</span>
          <span className="marca__etiqueta">{esAdmin ? 'ADMIN' : 'LÍDER'}</span>
        </Link>

        <p className="lateral__titulo">{esAdmin ? 'Administración' : 'Líder de equipo'}</p>
        {esAdmin && (
          <NavLink to="/admin" end className={clase} onClick={cerrarMenu}>
            <LayoutDashboard size={18} aria-hidden="true" />
            Panel general
          </NavLink>
        )}
        <NavLink to="/admin/equipos" className={clase} onClick={cerrarMenu}>
          <Users size={18} aria-hidden="true" />
          {esAdmin ? 'Equipos de trabajo' : 'Mis equipos'}
        </NavLink>
        {esAdmin && (
          <NavLink to="/admin/solicitudes" className={clase} onClick={cerrarMenu}>
            <Inbox size={18} aria-hidden="true" />
            Solicitudes
            {pendientes > 0 && (
              <span className="lateral__contador" aria-label={`${pendientes} pendientes`}>
                {pendientes}
              </span>
            )}
          </NavLink>
        )}
        {esAdmin && (
          <NavLink to="/admin/reporte" className={clase} onClick={cerrarMenu}>
            <FileText size={18} aria-hidden="true" />
            Reporte general
          </NavLink>
        )}

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
            <span className="sev est--completado">{esAdmin ? 'Administrador' : 'Líder de equipo'}</span>
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