import { Routes, Route, Navigate } from 'react-router-dom'
import Landing from './pages/Landing.jsx'
import Analisis from './pages/Analisis.jsx'
import MisAnalisis from './pages/MisAnalisis.jsx'
import Login from './pages/Login.jsx'
import Registro from './pages/Registro.jsx'
import RutaAdmin from './components/RutaAdmin.jsx'
import RutaProtegida from './components/RutaProtegida.jsx'
import RutaMiembro from './components/RutaMiembro.jsx'
import AdminDashboard from './pages/AdminDashboard.jsx'
import AdminAnalisisDetalle from './pages/AdminAnalisisDetalle.jsx'
import AdminEquipos from './pages/AdminEquipos.jsx'
import AdminEquipo from './pages/AdminEquipo.jsx'
import Invitacion from './pages/Invitacion.jsx'
import MiTrabajo from './pages/MiTrabajo.jsx'
import Incidencia from './pages/Incidencia.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route element={<RutaProtegida />}>
        <Route path="/analisis" element={<Analisis />} />
        <Route path="/analisis/:id" element={<Analisis />} />
        <Route path="/mis-analisis" element={<MisAnalisis />} />
        <Route path="/invitacion/:codigo" element={<Invitacion />} />
        {/* Admin y miembros del equipo; la RLS decide qué incidencia puede ver cada uno. */}
        <Route path="/incidencias/:id" element={<Incidencia />} />
      </Route>
      <Route element={<RutaMiembro />}>
        <Route path="/mi-trabajo" element={<MiTrabajo />} />
      </Route>
      <Route path="/login" element={<Login />} />
      <Route path="/registro" element={<Registro />} />

      <Route element={<RutaAdmin />}>
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin/analisis/:id" element={<AdminAnalisisDetalle />} />
        <Route path="/admin/equipos" element={<AdminEquipos />} />
        <Route path="/admin/equipos/:id" element={<AdminEquipo />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}