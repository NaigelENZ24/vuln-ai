import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../services/supabaseClient.js'

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
      .select('nombre, rol')
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

  const perfil = perfilEstado.id === idUsuario ? perfilEstado.datos : null
  const cargandoPerfil = Boolean(idUsuario) && perfilEstado.id !== idUsuario

  const valor = {
    sesion,
    usuario: sesion?.user ?? null,
    perfil,
    esAdmin: perfil?.rol === 'administrador',
    cargando: cargandoSesion || cargandoPerfil,
  }
  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}