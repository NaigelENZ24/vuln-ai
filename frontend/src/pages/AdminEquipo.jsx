import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Settings } from 'lucide-react'
import AdminLayout from '../components/AdminLayout.jsx'
import ResumenEquipo from '../components/ResumenEquipo.jsx'
import TableroIncidencias from '../components/TableroIncidencias.jsx'
import ColaboradoresEquipo from '../components/ColaboradoresEquipo.jsx'
import ConfiguracionEquipo from '../components/ConfiguracionEquipo.jsx'
import AsistenteEquipo from '../components/AsistenteEquipo.jsx'
import { obtenerEquipo } from '../services/equiposService.js'
import '../styles/equipos.css'

const PESTANAS = [
  { clave: 'resumen', titulo: 'Resumen' },
  { clave: 'seguimiento', titulo: 'Seguimiento' },
  { clave: 'colaboradores', titulo: 'Colaboradores' },
  { clave: 'asistente', titulo: 'Asistente IA' },
  { clave: 'configuracion', titulo: 'Configuración general', icono: true },
]

export default function AdminEquipo() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const tab = PESTANAS.some((p) => p.clave === params.get('tab')) ? params.get('tab') : 'resumen'
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [intento, setIntento] = useState(0)

  useEffect(() => {
    let activo = true
    setError('')
    obtenerEquipo(id).then(({ data, error: fallo }) => {
      if (!activo) return
      if (fallo) setError(fallo)
      else if (!data.equipo) setError('No existe ese equipo.')
      else setDatos(data)
    })
    return () => {
      activo = false
    }
  }, [id, intento])

  const recargar = () => setIntento((n) => n + 1)

  // Nombre de cada rama vigilada y rama principal de cada repositorio del equipo.
  const { nombreRama, principales } = useMemo(() => {
    const nombreRama = {}
    const principales = {}
    for (const repo of datos?.repos ?? []) {
      for (const v of repo.ramas_vigiladas) {
        nombreRama[v.id] = v.rama
        if (v.es_principal) principales[repo.id] = v.rama
      }
    }
    return { nombreRama, principales }
  }, [datos])

  if (error) {
    return (
      <AdminLayout titulo="Equipo">
        <div className="panel estado-vacio" role="alert">
          <p>{error}</p>
          <button type="button" className="btn-primario" style={{ marginTop: 12 }} onClick={recargar}>
            Reintentar
          </button>
        </div>
      </AdminLayout>
    )
  }

  if (!datos) {
    return (
      <AdminLayout titulo="Equipo">
        <p className="estado-vacio" role="status">
          Cargando equipo…
        </p>
      </AdminLayout>
    )
  }

  const { equipo, miembros } = datos

  return (
    <AdminLayout titulo={equipo.nombre} descripcion={equipo.descripcion}>
      <Link className="detalle__volver" to="/admin/equipos">
        <ArrowLeft size={16} aria-hidden="true" />
        Equipos de trabajo
      </Link>

      <nav className="pestanas" aria-label="Secciones del equipo">
        {PESTANAS.map((p) => (
          <button
            key={p.clave}
            type="button"
            className={`pestana ${p.icono ? 'pestana--icono' : ''} ${tab === p.clave ? 'pestana--activa' : ''}`}
            aria-current={tab === p.clave ? 'page' : undefined}
            aria-label={p.icono ? p.titulo : undefined}
            title={p.icono ? p.titulo : undefined}
            onClick={() => setParams({ tab: p.clave }, { replace: true })}
          >
            {p.icono ? <Settings size={19} aria-hidden="true" /> : p.titulo}
          </button>
        ))}
      </nav>

      {tab === 'resumen' && <ResumenEquipo equipoId={id} />}

      {tab === 'seguimiento' && (
        <TableroIncidencias
          equipoId={id}
          limite={equipo.limite_en_correccion}
          principales={principales}
          colaboradores={miembros
            .filter((m) => m.rol === 'colaborador')
            .map((m) => ({
              usuario_id: m.usuario_id,
              nombre: m.perfiles?.nombre ?? '—',
              elegidas: Object.fromEntries((m.miembro_ramas ?? []).map((x) => [x.repositorio_id, nombreRama[x.rama_vigilada_id]])),
            }))}
        />
      )}

      {tab === 'colaboradores' && (
        <ColaboradoresEquipo equipoId={id} datos={datos} nombreRama={nombreRama} principales={principales} recargar={recargar} />
      )}

      {tab === 'asistente' && <AsistenteEquipo equipoId={id} />}

      {tab === 'configuracion' && <ConfiguracionEquipo equipoId={id} datos={datos} recargar={recargar} />}
    </AdminLayout>
  )
}
