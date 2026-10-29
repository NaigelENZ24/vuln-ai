import { supabase } from './supabaseClient.js'

const MENSAJES = {
  user_already_exists: 'Ya existe una cuenta con ese correo.',
  email_exists: 'Ya existe una cuenta con ese correo.',
  weak_password: 'La contraseña es demasiado débil. Usa una más larga o más variada.',
  invalid_credentials: 'Correo o contraseña incorrectos.',
  email_not_confirmed: 'Debes confirmar tu correo antes de iniciar sesión.',
  over_request_rate_limit: 'Demasiados intentos. Espera un momento e inténtalo de nuevo.',
  over_email_send_rate_limit: 'Se enviaron demasiados correos. Espera un momento e inténtalo de nuevo.',
}

function traducir(error, porDefecto) {
  console.error('[auth]', error)
  return MENSAJES[error.code] ?? porDefecto
}

export async function registrar({ nombre, correo, clave }) {
  const { data, error } = await supabase.auth.signUp({
    email: correo,
    password: clave,
    options: { data: { nombre } },
  })
  if (error) return { error: traducir(error, 'No se pudo crear la cuenta. Inténtalo de nuevo.') }
  // Si la confirmación por correo está activa, no hay sesión hasta que se confirme.
  return { requiereConfirmacion: !data.session }
}

export async function iniciarSesion({ correo, clave }) {
  const { error } = await supabase.auth.signInWithPassword({ email: correo, password: clave })
  if (error) return { error: traducir(error, 'No se pudo iniciar sesión. Inténtalo de nuevo.') }
  return {}
}

export async function cerrarSesion() {
  await supabase.auth.signOut()
}