import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import AuthLayout from '../components/AuthLayout.jsx'
import CampoFormulario from '../components/CampoFormulario.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { registrar } from '../services/authService.js'
import {
  MIN_CLAVE,
  hayErrores,
  validarClaveNueva,
  validarCorreo,
  validarUsuario,
} from '../utils/validaciones.js'

const VACIO = { nombre: '', correo: '', clave: '' }

export default function Registro() {
  const { usuario, cargando } = useAuth()
  const [datos, setDatos] = useState(VACIO)
  const [errores, setErrores] = useState({})
  const [errorGeneral, setErrorGeneral] = useState('')
  const [aviso, setAviso] = useState('')
  const [enviando, setEnviando] = useState(false)

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
      nombre: validarUsuario(datos.nombre),
      correo: validarCorreo(datos.correo),
      clave: validarClaveNueva(datos.clave),
    }
    setErrores(nuevos)
    if (hayErrores(nuevos)) {
      setTimeout(() => form.querySelector('[aria-invalid="true"]')?.focus(), 0)
      return
    }

    setErrorGeneral('')
    setAviso('')
    setEnviando(true)
    const { error, requiereConfirmacion } = await registrar({
      nombre: datos.nombre.trim(),
      correo: datos.correo.trim(),
      clave: datos.clave,
    })
    setEnviando(false)

    if (error) {
      setErrorGeneral(error)
      return
    }
    if (requiereConfirmacion) {
      setAviso('Cuenta creada. Revisa tu correo para confirmarla y luego inicia sesión.')
      setDatos(VACIO)
    }
    // Si no requiere confirmación, ya hay sesión y este componente redirige a "/".
  }

  return (
    <AuthLayout
      titulo="Crear cuenta"
      subtitulo="Regístrate para guardar y revisar tus análisis."
      pie={
        <>
          ¿Ya tienes cuenta? <Link to="/login">Inicia sesión</Link>
        </>
      }
    >
      <form className="auth__form" onSubmit={enviar} noValidate>
        {errorGeneral && (
          <p className="auth__error" role="alert">
            {errorGeneral}
          </p>
        )}
        {aviso && (
          <p className="auth__exito" role="status">
            {aviso}
          </p>
        )}
        <CampoFormulario
          etiqueta="Nombre de usuario"
          name="nombre"
          autoComplete="username"
          placeholder="tu_usuario"
          value={datos.nombre}
          onChange={cambiar}
          error={errores.nombre}
        />
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
          autoComplete="new-password"
          ayuda={`Mínimo ${MIN_CLAVE} caracteres.`}
          value={datos.clave}
          onChange={cambiar}
          error={errores.clave}
        />
        <button className="auth__boton" type="submit" disabled={enviando}>
          {enviando ? 'Creando cuenta…' : 'Crear cuenta'}
        </button>
      </form>
    </AuthLayout>
  )
}