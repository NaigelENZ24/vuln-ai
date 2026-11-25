import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Esqueleto from './components/Esqueleto.jsx'
import Landing from './pages/Landing.jsx'
import Login from './pages/Login.jsx'
import Registro from './pages/Registro.jsx'
import RutaAdmin from './components/RutaAdmin.jsx'
import RutaProtegida from './components/RutaProtegida.jsx'
import RutaMiembro from './components/RutaMiembro.jsx'
import RutaGestor from './components/RutaGestor.jsx'

// Se descargan al visitar la ruta: la landing, el login y el registro cargan sin el código del panel.
const Analisis = lazy(() => import('./pages/Analisis.jsx'))
const MisAnalisis = lazy(() => import('./pages/MisAnalisis.jsx'))
const AdminDashboard = lazy(() => import('./pages/AdminDashboard.jsx'))
const AdminAnalisisDetalle = lazy(() => import('./pages/AdminAnalisisDetalle.jsx'))
const AdminEquipos = lazy(() => import('./pages/AdminEquipos.jsx'))
const AdminEquipo = lazy(() => import('./pages/AdminEquipo.jsx'))
const Invitacion = lazy(() => import('./pages/Invitacion.jsx'))
const MiTrabajo = lazy(() => import('./pages/MiTrabajo.jsx'))
const Incidencia = lazy(() => import('./pages/Incidencia.jsx'))
const AdminSolicitudes = lazy(() => import('./pages/AdminSolicitudes.jsx'))

export default function App() {
  return (
    <Suspense fallback={<main className="carga-ruta"><Esqueleto forma="lineas" cantidad={4} /></main>}>
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
        <Route path="/admin/solicitudes" element={<AdminSolicitudes />} />
      </Route>

      {/* Equipos: el admin (todos) o un líder (los suyos, por RLS). */}
      <Route element={<RutaGestor />}>
        <Route path="/admin/equipos" element={<AdminEquipos />} />
        <Route path="/admin/equipos/:id" element={<AdminEquipo />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  )
}