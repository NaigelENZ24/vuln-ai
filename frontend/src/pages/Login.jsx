import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import AuthLayout from '../components/AuthLayout.jsx'
import CampoFormulario from '../components/CampoFormulario.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { iniciarSesion } from '../services/authService.js'
import { hayErrores, validarClaveLogin, validarCorreo } from '../utils/validaciones.js'

export default function Login() {
  const { usuario, cargando } = useAuth()
  const [datos, setDatos] = useState({ correo: '', clave: '' })
  const [errores, setErrores] = useState({})
  const [errorGeneral, setErrorGeneral] = useState('')
  const [enviando, setEnviando] = useState(false)

  // Si ya hay sesión, no tiene sentido ver el login.
  if (!cargando && usuario) return <Navigate to="/" replace />

  function cambiar(e) {
    const { name, value } = e.target
    setDatos((d) => ({ ...d, [name]: value }))
    setErrores((er) => ({ ...er, [name]: '' }))
  }

  async function enviar(e) {
    e.preventDefault()
    const form = e.currentTarget
    const nuevos = {
      correo: validarCorreo(datos.correo),
      clave: validarClaveLogin(datos.clave),
    }
    setErrores(nuevos)
    if (hayErrores(nuevos)) {
      setTimeout(() => form.querySelector('[aria-invalid="true"]')?.focus(), 0)
      return
    }

    setErrorGeneral('')
    setEnviando(true)
    const { error } = await iniciarSesion({ correo: datos.correo.trim(), clave: datos.clave })
    setEnviando(false)
    if (error) setErrorGeneral(error)
    // Si todo sale bien, AuthContext detecta la sesión y este componente redirige a "/".
  }

  return (
    <AuthLayout
      titulo="Iniciar sesión"
      subtitulo="Ingresa para analizar tus repositorios."
      pie={
        <>
          ¿No tienes cuenta? <Link to="/registro">Regístrate</Link>
        </>
      }
    >
      <form className="auth__form" onSubmit={enviar} noValidate>
        {errorGeneral && (
          <p className="auth__error" role="alert">
            {errorGeneral}
          </p>
        )}
        <CampoFormulario
          etiqueta="Correo"
          name="correo"
          type="email"
          autoComplete="email"
          placeholder="correo@ejemplo.com"
          value={datos.correo}
          onChange={cambiar}
          error={errores.correo}
        />
        <CampoFormulario
          etiqueta="Contraseña"
          name="clave"
          type="password"
          autoComplete="current-password"
          value={datos.clave}
          onChange={cambiar}
          error={errores.clave}
        />
        <button className="auth__boton" type="submit" disabled={enviando}>
          {enviando ? 'Ingresando…' : 'Iniciar sesión'}
        </button>
      </form>
    </AuthLayout>
  )
}