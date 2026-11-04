import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

export default function RutaAdmin() {
  const { usuario, esAdmin, cargando } = useAuth()
  const ubicacion = useLocation()

  if (cargando) return <p className="cargando" role="status">Cargando…</p>
  if (!usuario) return <Navigate to="/login" replace state={{ desde: ubicacion.pathname }} />
  if (!esAdmin) return <Navigate to="/" replace />
  return <Outlet />
}