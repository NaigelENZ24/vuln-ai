export const MIN_CLAVE = 8

export function validarCorreo(valor) {
  const v = valor.trim()
  if (!v) return 'Ingresa tu correo.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
    return 'Ingresa un correo válido, por ejemplo nombre@dominio.com.'
  }
  return ''
}

export function validarUsuario(valor) {
  const v = valor.trim()
  if (!v) return 'Ingresa un nombre de usuario.'
  if (v.length < 3) return 'Debe tener al menos 3 caracteres.'
  if (v.length > 30) return 'Debe tener máximo 30 caracteres.'
  return ''
}

export function validarClaveNueva(valor) {
  if (!valor) return 'Ingresa una contraseña.'
  if (valor.length < MIN_CLAVE) return `Debe tener al menos ${MIN_CLAVE} caracteres.`
  return ''
}

export function validarClaveLogin(valor) {
  return valor ? '' : 'Ingresa tu contraseña.'
}

export function hayErrores(errores) {
  return Object.values(errores).some(Boolean)
}