import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../services/supabaseClient.js'
import { misEquipos, misInvitaciones } from '../services/equiposService.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [sesion, setSesion] = useState(null)
  const [cargandoSesion, setCargandoSesion] = useState(true)
  const [perfilEstado, setPerfilEstado] = useState({ id: null, datos: null })

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSesion(data.session)
      setCargandoSesion(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_evento, nuevaSesion) => {
      setSesion(nuevaSesion)
    })

    return () => subscription.unsubscribe()
  }, [])

  const idUsuario = sesion?.user?.id
  useEffect(() => {
    if (!idUsuario) {
      setPerfilEstado({ id: null, datos: null })
      return
    }
    let activo = true
    supabase
      .from('perfiles')
      .select('nombre, rol, cupo_equipos')
      .eq('id', idUsuario)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!activo) return
        if (error) console.error('[perfil]', error)
        setPerfilEstado({ id: idUsuario, datos: data ?? null })
      })
    return () => {
      activo = false
    }
  }, [idUsuario])

  // Equipos de los que es miembro e invitaciones pendientes: deciden si ve "Mi trabajo" y el aviso.
  const [equiposEstado, setEquiposEstado] = useState({ id: null, equipos: [], invitaciones: [] })
  const [recarga, setRecarga] = useState(0)
  useEffect(() => {
    if (!idUsuario) {
      setEquiposEstado({ id: null, equipos: [], invitaciones: [] })
      return
    }
    let activo = true
    Promise.all([misEquipos(idUsuario), misInvitaciones()]).then(([e, i]) => {
      if (activo) setEquiposEstado({ id: idUsuario, equipos: e.data ?? [], invitaciones: i.data ?? [] })
    })
    return () => {
      activo = false
    }
  }, [idUsuario, recarga])

  const perfil = perfilEstado.id === idUsuario ? perfilEstado.datos : null
  const cargandoPerfil = Boolean(idUsuario) && perfilEstado.id !== idUsuario
  const cargandoEquipos = Boolean(idUsuario) && equiposEstado.id !== idUsuario
  const equipos = equiposEstado.id === idUsuario ? equiposEstado.equipos : []

  const valor = {
    sesion,
    usuario: sesion?.user ?? null,
    perfil,
    esAdmin: perfil?.rol === 'administrador',
    // Líder de equipo: el admin le aprobó una solicitud (cupo > 0). Gestiona solo los equipos que crea.
    esLider: perfil?.rol !== 'administrador' && (perfil?.cupo_equipos ?? 0) > 0,
    cupoEquipos: perfil?.cupo_equipos ?? 0,
    equipos,
    esMiembro: equipos.length > 0,
    esColaborador: equipos.some((e) => e.rol === 'colaborador'),
    invitaciones: equiposEstado.id === idUsuario ? equiposEstado.invitaciones : [],
    recargarEquipos: () => setRecarga((n) => n + 1),
    cargando: cargandoSesion || cargandoPerfil || cargandoEquipos,
  }
  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}