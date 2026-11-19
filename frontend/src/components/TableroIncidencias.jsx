import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { asignarIncidencia, listarIncidenciasEquipo, resolverDescarte } from '../services/incidenciasService.js'
import { claveUI, etiquetaNivel } from '../utils/severidad.js'
import { ordenarPlan, plazo, ramaDeTrabajo, textoCierre, ubicacion } from '../utils/incidencias.js'
import Carrusel from './Carrusel.jsx'

// Arriba, lo que ya está en manos de alguien; abajo, lo que falta atender, separado por severidad.
const FILAS_ESTADO = [
  {
    estado: 'en_correccion',
    titulo: 'En corrección',
    vacio: 'Nadie está corrigiendo nada ahora.',
  },
  {
    estado: 'en_revision',
    titulo: 'En revisión',
    vacio: 'No hay nada pendiente de verificar o revisar.',
  },
  {
    estado: 'resuelta',
    titulo: 'Resueltas (últimos 30 días)',
    vacio: 'Aún no hay incidencias resueltas.',
  },
]
const FILAS_SEVERIDAD = [
  { severidad: 'alto', titulo: 'Por atender · alta' },
  { severidad: 'medio', titulo: 'Por atender · media' },
  { severidad: 'bajo', titulo: 'Por atender · baja' },
]

export default function TableroIncidencias({ equipoId, colaboradores, principales, limite }) {
  const [lista, setLista] = useState(null)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [intento, setIntento] = useState(0)
  const [rama, setRama] = useState('todas')
  const [persona, setPersona] = useState('todas')
  const [severidad, setSeveridad] = useState('todas')
  const [soloVencidas, setSoloVencidas] = useState(false)

  useEffect(() => {
    let activo = true
    listarIncidenciasEquipo(equipoId).then(({ data, error: fallo }) => {
      if (!activo) return
      if (fallo) setError(fallo)
      else {
        setError('')
        setLista(data)
      }
    })
    return () => {
      activo = false
    }
  }, [equipoId, intento])

  const ramas = useMemo(
    () => [...new Set((lista ?? []).map((i) => `${i.repositorios.nombre} · ${i.rama}`))].sort(),
    [lista],
  )

  const visibles = useMemo(
    () =>
      (lista ?? []).filter(
        (i) =>
          (rama === 'todas' || `${i.repositorios.nombre} · ${i.rama}` === rama) &&
          (persona === 'todas' || (persona === 'sin' ? !i.asignado_a : i.asignado_a === persona)) &&
          (severidad === 'todas' || i.severidad === severidad) &&
          (!soloVencidas || plazo(i).vencida),
      ),
    [lista, rama, persona, severidad, soloVencidas],
  )

  async function accion(promesa) {
    setAviso('')
    const { error: fallo } = await promesa
    if (fallo) setAviso(fallo)
    setIntento((n) => n + 1)
  }

  if (error) {
    return (
      <div className="panel estado-vacio" role="alert">
        <p>{error}</p>
      </div>
    )
  }
  if (lista === null)
    return (
      <p className="estado-vacio" role="status">
        Cargando incidencias…
      </p>
    )
  if (lista.length === 0) {
    return (
      <p className="panel estado-vacio">
        Todavía no hay incidencias. Vincula un repositorio en la pestaña Resumen y analiza sus ramas.
      </p>
    )
  }

  return (
    <>
      <div className="panel__herramientas panel__herramientas--suelto">
        <label className="herramienta">
          Rama
          <select value={rama} onChange={(e) => setRama(e.target.value)}>
            <option value="todas">Todas</option>
            {ramas.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="herramienta">
          Persona
          <select value={persona} onChange={(e) => setPersona(e.target.value)}>
            <option value="todas">Todas</option>
            <option value="sin">Sin asignar</option>
            {colaboradores.map((c) => (
              <option key={c.usuario_id} value={c.usuario_id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="herramienta">
          Severidad
          <select value={severidad} onChange={(e) => setSeveridad(e.target.value)}>
            <option value="todas">Todas</option>
            <option value="alto">Alta</option>
            <option value="medio">Media</option>
            <option value="bajo">Baja</option>
          </select>
        </label>
        <label className="herramienta">
          <input type="checkbox" checked={soloVencidas} onChange={(e) => setSoloVencidas(e.target.checked)} />
          Solo vencidas
        </label>
      </div>

      {aviso && (
        <p className="panel__aviso panel__aviso--suelto" role="alert">
          {aviso}
        </p>
      )}

      <div className="tablero">
        <div className="tablero__columnas">
          {FILAS_ESTADO.map((f) => {
            const items = ordenarPlan(visibles.filter((i) => i.estado === f.estado))
            return (
              <section key={f.estado} className="tablero__col" aria-label={f.titulo}>
                <h2 className="tablero__titulo">
                  {f.titulo} <span className="carrusel__cantidad">{items.length}</span>
                </h2>
                {f.estado === 'en_correccion' && <p className="carrusel__nota">Límite: {limite} por persona</p>}
                {items.length === 0 && <p className="carrusel__vacio">{f.vacio}</p>}
                {items.map(tarjeta)}
              </section>
            )
          })}
        </div>
        {FILAS_SEVERIDAD.map((f) => {
          const items = ordenarPlan(visibles.filter((i) => i.estado === 'abierta' && i.severidad === f.severidad))
          return (
            <Carrusel
              key={f.severidad}
              titulo={f.titulo}
              cantidad={items.length}
              marca={<span className={`sev sev--${claveUI(f.severidad)} carrusel__punto`} aria-hidden="true" />}
              vacio="Nada pendiente con esta severidad."
            >
              {items.map(tarjeta)}
            </Carrusel>
          )
        })}
      </div>
    </>
  )

  function tarjeta(i) {
    const p = plazo(i)
    return (
      <article key={i.id} className="tarjeta-inc">
        <span className={`sev sev--${claveUI(i.severidad)}`}>{etiquetaNivel(i.severidad)}</span>
        <Link className="tarjeta-inc__titulo" to={`/incidencias/${i.id}`}>
          {i.titulo ?? i.regla_id}
        </Link>
        <span className="celda-mono celda-sec">{ubicacion(i)}</span>
        <span className="tarjeta-inc__fila">
          <span className="celda-mono">{i.rama}</span>
          {p.texto && <span className={p.vencida ? 'texto-vencida' : ''}>{p.texto}</span>}
        </span>
        {i.veces_reabierta > 0 && (
          <span className="celda-sec">
            Reabierta {i.veces_reabierta} {i.veces_reabierta === 1 ? 'vez' : 'veces'}
          </span>
        )}

        {i.estado === 'resuelta' ? (
          <span className="texto-ok">{textoCierre(i)}</span>
        ) : (
          <label className="tarjeta-inc__asignar">
            <span className="sr-only">Responsable (el administrador libera o pasa a otro)</span>
            <select
              title="Liberar o pasar a otro colaborador"
              value={i.asignado_a ?? ''}
              onChange={(e) => accion(asignarIncidencia(i.id, e.target.value))}
            >
              <option value="">Sin asignar</option>
              {colaboradores
                // solo quien trabaja en la rama de esta incidencia (la base lo exige al asignar)
                .filter(
                  (c) =>
                    c.usuario_id === i.asignado_a ||
                    ramaDeTrabajo(i.repositorio_id, c.elegidas, principales) === i.rama,
                )
                .map((c) => (
                  <option key={c.usuario_id} value={c.usuario_id}>
                    {c.nombre}
                  </option>
                ))}
            </select>
          </label>
        )}

        {!i.asignado_a && i.sugerido_a && i.estado === 'abierta' && (
          <div className="tarjeta-inc__sugerencia">
            <span>
              Sugerido: <strong>{i.sugerido?.nombre ?? 'colaborador'}</strong> (último cambio en el archivo)
            </span>
            <button type="button" className="btn-tabla" onClick={() => accion(asignarIncidencia(i.id, i.sugerido_a))}>
              Asignar
            </button>
          </div>
        )}

        {i.descarte_solicitado && (
          <div className="tarjeta-inc__descarte">
            <span>
              {i.asignado?.nombre ?? 'El colaborador'} dice que no es una vulnerabilidad: «{i.motivo_descarte}»
            </span>
            <span className="acciones-fila">
              <button type="button" className="btn-tabla" onClick={() => accion(resolverDescarte(i.id, true))}>
                Marcar como resuelta
              </button>
              <button type="button" className="btn-cabecera" onClick={() => accion(resolverDescarte(i.id, false))}>
                Rechazar
              </button>
            </span>
          </div>
        )}
      </article>
    )
  }
}
