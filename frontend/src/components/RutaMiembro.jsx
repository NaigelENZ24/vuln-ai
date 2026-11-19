import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

// Solo para miembros de algún equipo. A los demás los devuelve al inicio sin mencionar equipos;
// la protección real está en la RLS de la base.
export default function RutaMiembro() {
  const { usuario, esMiembro, cargando } = useAuth()
  const ubicacion = useLocation()

  if (cargando) return <p className="cargando" role="status">Cargando…</p>
  if (!usuario) return <Navigate to="/login" replace state={{ desde: ubicacion.pathname }} />
  if (!esMiembro) return <Navigate to="/" replace />
  return <Outlet />
}
