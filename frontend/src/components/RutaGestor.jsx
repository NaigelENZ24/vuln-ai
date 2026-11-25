import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

// Pantallas de equipos: el administrador o un líder de equipo. Solo es UX: la RLS decide qué equipos ve cada uno.
export default function RutaGestor() {
  const { usuario, esAdmin, esLider, cargando } = useAuth()
  const ubicacion = useLocation()

  if (cargando) return <p className="cargando" role="status">Cargando…</p>
  if (!usuario) return <Navigate to="/login" replace state={{ desde: ubicacion.pathname }} />
  if (!esAdmin && !esLider) return <Navigate to="/" replace />
  return <Outlet />
}
