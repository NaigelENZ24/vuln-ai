import { supabase } from './supabaseClient.js'

const API = import.meta.env.VITE_API_URL

async function llamar(ruta, cuerpo) {
  const { data } = await supabase.auth.getSession()
  try {
    const respuesta = await fetch(`${API}${ruta}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${data.session?.access_token ?? ''}`,
      },
      body: JSON.stringify(cuerpo),
    })
    const json = await respuesta.json().catch(() => ({}))
    if (!respuesta.ok) {
      return {
        error: typeof json.detail === 'string' ? json.detail : 'El servicio de análisis rechazó la solicitud.',
      }
    }
    return { data: json }
  } catch (error) {
    console.error('[analyzer]', ruta, error)
    return { error: 'No se pudo conectar con el servicio de análisis. Verifica que esté encendido.' }
  }
}

export const iniciarAnalisis = (repoUrl) => llamar('/analyses', { repo_url: repoUrl })

export const preguntarIA = (analisisId, pregunta) => llamar('/chat', { analisis_id: analisisId, pregunta })

export const vincularRepositorio = (equipoId, repoUrl, ramas) =>
  llamar(`/equipos/${equipoId}/repositorios`, { repo_url: repoUrl, ramas })

export const analizarRama = (ramaId) => llamar(`/ramas/${ramaId}/analizar`, {})

// Revisa solo el archivo de la incidencia (la incidencia debe estar en revisión).
export const verificarIncidencia = (incidenciaId) => llamar(`/incidencias/${incidenciaId}/verificar`, {})

export const ejecutarRecordatorios = (equipoId) => llamar(`/equipos/${equipoId}/recordatorios/ejecutar`, {})

export const preguntarEquipo = (equipoId, pregunta) => llamar(`/equipos/${equipoId}/asistente`, { pregunta })

export const enviarInvitacion = (equipoId, codigo) => llamar('/invitaciones/enviar', { equipo_id: equipoId, codigo })

// Pide al administrador poder crear equipos (líder de equipo). El servicio la guarda y le avisa por correo.
export const enviarSolicitudEquipo = ({ nombreEquipo, integrantes, equipos, descripcion }) =>
  llamar('/solicitudes', { nombre_equipo: nombreEquipo, integrantes, equipos, descripcion })
