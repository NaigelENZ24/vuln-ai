import { Routes, Route, Navigate } from 'react-router-dom'
import Landing from './pages/Landing.jsx'
import Analisis from './pages/Analisis.jsx'
import Login from './pages/Login.jsx'
import Registro from './pages/Registro.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/analisis" element={<Analisis />} />
      <Route path="/login" element={<Login />} />
      <Route path="/registro" element={<Registro />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}