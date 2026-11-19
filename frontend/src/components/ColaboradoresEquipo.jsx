import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Pencil, Scale } from 'lucide-react'
import PanelInvitar from './PanelInvitar.jsx'
import EnlaceInvitacion from './EnlaceInvitacion.jsx'
import EdicionColaborador from './EdicionColaborador.jsx'
import {
  actualizarInvitacion,
  actualizarMiembro,
  asignarRama,
  crearInvitacion,
  quitarMiembro,
  revocarInvitacion,
} from '../services/equiposService.js'
import {
  actividadEquipo,
  asignarIncidencia,
  listarIncidenciasEquipo,
  listarNotificaciones,
} from '../services/incidenciasService.js'
import { enviarInvitacion } from '../services/analyzerApi.js'
import { formatearFecha } from '../utils/formato.js'
import { cargaDe, diasDesde, ramaDeTrabajo } from '../utils/incidencias.js'
import { ORDEN_NIVEL } from '../utils/severidad.js'

const ROLES = { colaborador: 'Colaborador', observador: 'Observador' }
const COLUMNAS = 11
const ORDENES = {
  asignadas: { titulo: 'Más incidencias asignadas', valor: (f) => -f.carga.asignadas },
  rama: { titulo: 'Más incidencias en su rama', valor: (f) => -f.enRama },
  altas: { titulo: 'Más altas abiertas', valor: (f) => -f.carga.alta },
  vencidas: { titulo: 'Más vencidas', valor: (f) => -f.carga.vencidas },
  alertas: { titulo: 'Más alertas sin respuesta', valor: (f) => -f.alertas },
  resueltas: { titulo: 'Más resueltas', valor: (f) => -f.carga.resueltas },
  plazo: { titulo: 'Menor % en plazo', valor: (f) => f.carga.enPlazo ?? 101 },
  inactividad: { titulo: 'Más días sin actividad', valor: (f) => -(f.diasInactivo ?? 9999) },
  nombre: { titulo: 'Nombre', valor: null },
}
const CHIPS = {
  vencidas: { titulo: 'Con vencidas', cumple: (f) => f.carga.vencidas > 0 },
  altas: { titulo: 'Con altas abiertas', cumple: (f) => f.carga.alta > 0 },
  limite: { titulo: 'En el límite', cumple: (f, limite) => f.carga.enCorreccion >= limite },
  estancadas: { titulo: 'Con estancadas', cumple: (f) => f.carga.estancadas.length > 0 },
  inactivos: { titulo: 'Sin actividad 7+ días', cumple: (f) => f.diasInactivo === null || f.diasInactivo >= 7 },
  sinGithub: { titulo: 'Sin GitHub vinculado', cumple: (f) => !f.github },
}
const iniciales = (texto) =>
  texto
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('')

export default function ColaboradoresEquipo({ equipoId, datos, nombreRama, principales, recargar }) {
  const { equipo, miembros, invitaciones, repos } = datos
  const [enlace, setEnlace] = useState(null)
  const [aviso, setAviso] = useState('')
  const [editando, setEditando] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [filtroRol, setFiltroRol] = useState('todos')
  const [filtroRama, setFiltroRama] = useState('todas')
  const [periodo, setPeriodo] = useState(30)
  const [orden, setOrden] = useState('asignadas')
  const [chips, setChips] = useState([])
  const [ignoradas, setIgnoradas] = useState([])
  const [extra, setExtra] = useState({ incidencias: [], actividad: {}, notificaciones: [] })

  // Datos de carga: incidencias (con resueltas de hasta 90 días), última actividad y recordatorios recibidos.
  useEffect(() => {
    let activo = true
    Promise.all([listarIncidenciasEquipo(equipoId, 90), actividadEquipo(equipoId), listarNotificaciones(equipoId, 90)]).then(
      ([i, a, n]) => {
        if (!activo) return
        if (i.error || a.error || n.error) setAviso(i.error || a.error || n.error)
        setExtra({ incidencias: i.data ?? [], actividad: a.data ?? {}, notificaciones: n.data ?? [] })
      }
    )
    return () => {
      activo = false
    }
  }, [equipoId, datos])

  const limite = equipo.limite_en_correccion

  const personas = useMemo(() => {
    const ahora = Date.now()
    const desde = ahora - periodo * 24 * 60 * 60 * 1000
    return miembros.map((m) => {
      const elegidas = Object.fromEntries((m.miembro_ramas ?? []).map((x) => [x.repositorio_id, nombreRama[x.rama_vigilada_id]]))
      const ultima = extra.actividad[m.usuario_id] ?? null
      return {
        tipo: 'miembro',
        clave: m.usuario_id,
        nombre: m.perfiles?.nombre ?? '—',
        correo: m.perfiles?.correo ?? '',
        rol: m.rol,
        github: m.github_usuario,
        fecha: m.unido_en,
        ramasIds: Object.fromEntries((m.miembro_ramas ?? []).map((x) => [x.repositorio_id, x.rama_vigilada_id])),
        elegidas,
        carga: cargaDe(m.usuario_id, extra.incidencias, { periodoDias: periodo, diasEstancada: equipo.dias_estancada, ahora }),
        enRama: extra.incidencias.filter(
          (i) => i.estado !== 'resuelta' && ramaDeTrabajo(i.repositorio_id, elegidas, principales) === i.rama
        ).length,
        alertas: extra.notificaciones.filter(
          (n) => n.usuario_id === m.usuario_id && n.tipo === 'recordatorio' && n.resultado === 'enviado' && new Date(n.creado_en) >= desde
        ).length,
        ultima,
        diasInactivo: diasDesde(ultima, ahora),
      }
    })
  }, [miembros, extra, periodo, nombreRama, principales, equipo.dias_estancada])

  const colaboradores = personas.filter((p) => p.rol === 'colaborador')

  const filas = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    const [repoId, rama] = filtroRama === 'todas' ? [] : filtroRama.split('|')
    const coincide = (f) =>
      (!q || `${f.nombre} ${f.correo} ${f.github ?? ''}`.toLowerCase().includes(q)) &&
      (filtroRol === 'todos' || (filtroRol === 'pendiente' ? f.tipo === 'invitacion' : f.rol === filtroRol))
    const orden_ = ORDENES[orden].valor
    const miembrosFiltrados = personas
      .filter(
        (f) =>
          coincide(f) &&
          f.tipo === 'miembro' &&
          (!repoId || (f.rol === 'colaborador' && ramaDeTrabajo(repoId, f.elegidas, principales) === rama)) &&
          chips.every((c) => f.rol === 'colaborador' && CHIPS[c].cumple(f, limite))
      )
      .sort((a, b) => (orden_ ? orden_(a) - orden_(b) : 0) || a.nombre.localeCompare(b.nombre, 'es'))
    // Las invitaciones aún no tienen carga: solo aparecen sin filtros de carga ni de rama.
    const pendientes =
      chips.length || repoId
        ? []
        : invitaciones
            .map((i) => ({
              tipo: 'invitacion',
              clave: i.id,
              nombre: i.correo,
              correo: i.correo,
              rol: i.rol,
              github: i.github_usuario,
              vencida: new Date(i.vence_en) < new Date(),
              venceEn: i.vence_en,
            }))
            .filter(coincide)
    return [...miembrosFiltrados, ...pendientes]
  }, [personas, invitaciones, busqueda, filtroRol, filtroRama, orden, chips, limite, principales])

  // ---------- acciones ----------
  async function mostrarYEnviar(correo, codigo) {
    setEnlace({ correo, codigo, envio: 'enviando' })
    const { error: fallo } = await enviarInvitacion(equipoId, codigo)
    setEnlace((e) => (e?.codigo === codigo ? { ...e, envio: fallo ? 'error' : 'enviado', detalle: fallo } : e))
  }

  async function ejecutar(promesa, exito) {
    setAviso('')
    const { error: fallo } = await promesa
    if (fallo) setAviso(fallo)
    else {
      if (exito) setAviso(exito)
      recargar()
    }
  }

  async function reenviar(f) {
    setAviso('')
    const { data, error: fallo } = await crearInvitacion({ equipoId, correo: f.correo, rol: f.rol, github: f.github ?? '' })
    if (fallo) setAviso(fallo)
    else {
      mostrarYEnviar(f.correo, data)
      recargar()
    }
  }

  async function guardarEdicion(f, { correo, rol, github, ramas }) {
    let r
    if (f.tipo === 'miembro') {
      r = await actualizarMiembro({ equipoId, usuarioId: f.clave, rol, github })
      // Solo los repos donde cambió la rama; '' = vuelve a la principal.
      for (const [repositorioId, ramaId] of Object.entries(rol === 'colaborador' ? ramas : {})) {
        if (r.error || ramaId === (f.ramasIds[repositorioId] ?? '')) continue
        r = await asignarRama({ usuarioId: f.clave, repositorioId, ramaId })
      }
    } else if (correo !== f.correo) {
      // El código va ligado al correo: se crea una invitación nueva y luego se anula la anterior.
      r = await crearInvitacion({ equipoId, correo, rol, github })
      if (!r.error) {
        mostrarYEnviar(correo, r.data)
        r = await revocarInvitacion(f.clave)
      }
    } else {
      r = await actualizarInvitacion({ id: f.clave, rol, github })
    }
    if (!r.error) {
      setEditando(null)
      setAviso('Cambios guardados.')
      recargar()
    }
    return r
  }

  function quitar(f) {
    if (!window.confirm(`¿Quitar a ${f.nombre} del equipo? Dejará de ver el equipo y de recibir avisos.`)) return
    ejecutar(quitarMiembro({ equipoId, usuarioId: f.clave }), `${f.nombre} ya no es parte del equipo.`)
  }

  // ---------- destacados y sugerencias ----------
  const destacado = (valor) => {
    const top = [...colaboradores].sort((a, b) => valor(b) - valor(a))[0]
    return top && valor(top) > 0 ? { nombre: top.nombre, valor: valor(top) } : null
  }
  const destacados = [
    { titulo: 'Más incidencias asignadas', d: destacado((f) => f.carga.asignadas) },
    { titulo: 'Más vencidas', d: destacado((f) => f.carga.vencidas), tono: 'texto-vencida' },
    { titulo: `Más alertas sin respuesta (${periodo} d)`, d: destacado((f) => f.alertas) },
    { titulo: `Más resueltas (${periodo} d)`, d: destacado((f) => f.carga.resueltas), tono: 'texto-ok' },
  ]

  const sugerencias = useMemo(() => {
    const lista = []
    // Reasignación: de quien tiene vencidas a quien no tiene y lleva menos, en la misma rama.
    for (const a of [...colaboradores].sort((x, y) => y.carga.vencidas - x.carga.vencidas)) {
      if (!a.carga.vencidas) break
      const candidatas = extra.incidencias
        .filter((i) => i.asignado_a === a.clave && i.estado === 'abierta' && !ignoradas.includes(i.id))
        .sort((x, y) => ORDEN_NIVEL[y.severidad] - ORDEN_NIVEL[x.severidad])
      for (const inc of candidatas) {
        const b = colaboradores.find(
          (c) =>
            c.clave !== a.clave &&
            c.carga.vencidas === 0 &&
            c.carga.asignadas < a.carga.asignadas &&
            ramaDeTrabajo(inc.repositorio_id, c.elegidas, principales) === inc.rama
        )
        if (b) {
          lista.push({ tipo: 'reasignar', inc, a, b })
          break
        }
      }
    }
    for (const p of colaboradores) {
      for (const inc of p.carga.estancadas) lista.push({ tipo: 'estancada', inc, a: p })
      if (p.carga.enCorreccion >= limite) lista.push({ tipo: 'limite', a: p })
    }
    return lista.slice(0, 6)
  }, [colaboradores, extra.incidencias, ignoradas, limite, principales])

  // ---------- celdas ----------
  const trabajaEn = (f) =>
    f.rol !== 'colaborador' || repos.length === 0 ? (
      <span className="celda-sec">—</span>
    ) : (
      repos.map((r) => (
        <span key={r.id} className="celda-mono trabaja-en">
          {repos.length > 1 && `${r.nombre} · `}
          {ramaDeTrabajo(r.id, f.elegidas, principales) ?? '—'}
          {!f.elegidas[r.id] && <span className="celda-sec"> (principal)</span>}
        </span>
      ))
    )

  const barra = ({ alta, media, baja, asignadas }) =>
    asignadas === 0 ? (
      <span className="celda-sec">Sin carga</span>
    ) : (
      <span className="carga-barra" role="img" aria-label={`${alta} altas, ${media} medias y ${baja} bajas`}>
        <span style={{ width: `${(100 * alta) / asignadas}%`, background: 'var(--sev-alta)' }} />
        <span style={{ width: `${(100 * media) / asignadas}%`, background: 'var(--sev-media)' }} />
        <span style={{ width: `${(100 * baja) / asignadas}%`, background: 'var(--sev-baja)' }} />
      </span>
    )

  const botonEditar = (f) => (
    <button
      type="button"
      className="icono-btn icono-btn--chico"
      aria-label={`Editar a ${f.nombre}`}
      title="Editar"
      onClick={() => setEditando(f.clave)}
    >
      <Pencil size={15} aria-hidden="true" />
    </button>
  )

  const conteoChip = (c) => colaboradores.filter((f) => CHIPS[c].cumple(f, limite)).length
  const alternarChip = (c) => setChips((x) => (x.includes(c) ? x.filter((y) => y !== c) : [...x, c]))
  const opcionesRama = repos.flatMap((r) =>
    r.ramas_vigiladas.map((v) => ({ valor: `${r.id}|${v.rama}`, texto: `${r.nombre} · ${v.rama}` }))
  )

  return (
    <>
      <PanelInvitar
        equipoId={equipoId}
        equipoVacio={miembros.length === 0}
        onInvitada={(nueva) => {
          mostrarYEnviar(nueva.correo, nueva.codigo)
          recargar()
        }}
      />

      {enlace && <EnlaceInvitacion {...enlace} onCerrar={() => setEnlace(null)} />}

      <section className="panel" aria-label="Colaboradores">
        <div className="panel__cabecera">
          <h2>
            Colaboradores ({miembros.length})
            {invitaciones.length > 0 && (
              <span className="panel__sub">
                {' '}
                · {invitaciones.length} invitación{invitaciones.length > 1 && 'es'} pendiente{invitaciones.length > 1 && 's'}
              </span>
            )}
          </h2>
        </div>

        <div className="panel__herramientas filtros-carga">
          <label className="herramienta">
            Buscar:
            <input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Nombre, correo o GitHub" />
          </label>
          <label className="herramienta">
            Rol
            <select value={filtroRol} onChange={(e) => setFiltroRol(e.target.value)}>
              <option value="todos">Todos</option>
              <option value="colaborador">Colaboradores</option>
              <option value="observador">Observadores</option>
              <option value="pendiente">Invitaciones pendientes</option>
            </select>
          </label>
          {opcionesRama.length > 0 && (
            <label className="herramienta">
              Trabaja en
              <select value={filtroRama} onChange={(e) => setFiltroRama(e.target.value)}>
                <option value="todas">Todas las ramas</option>
                {opcionesRama.map((o) => (
                  <option key={o.valor} value={o.valor}>
                    {o.texto}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="herramienta">
            Periodo
            <select value={periodo} onChange={(e) => setPeriodo(Number(e.target.value))}>
              <option value={7}>Últimos 7 días</option>
              <option value={30}>Últimos 30 días</option>
              <option value={90}>Últimos 90 días</option>
            </select>
          </label>
          <label className="herramienta">
            Ordenar por
            <select value={orden} onChange={(e) => setOrden(e.target.value)}>
              {Object.entries(ORDENES).map(([clave, o]) => (
                <option key={clave} value={clave}>
                  {o.titulo}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="chips" role="group" aria-label="Filtros rápidos">
          <span className="celda-sec">Filtros rápidos:</span>
          {Object.entries(CHIPS).map(([clave, c]) => (
            <button
              key={clave}
              type="button"
              className={`chip ${chips.includes(clave) ? 'chip--activo' : ''}`}
              aria-pressed={chips.includes(clave)}
              onClick={() => alternarChip(clave)}
            >
              {c.titulo} <span className="chip__cantidad">{conteoChip(clave)}</span>
            </button>
          ))}
          {(chips.length > 0 || busqueda || filtroRol !== 'todos' || filtroRama !== 'todas') && (
            <button
              type="button"
              className="btn-cabecera chips__limpiar"
              onClick={() => {
                setChips([])
                setBusqueda('')
                setFiltroRol('todos')
                setFiltroRama('todas')
              }}
            >
              Limpiar filtros
            </button>
          )}
        </div>

        {aviso && (
          <p className="panel__aviso" role="status">
            {aviso}
          </p>
        )}

        {miembros.length + invitaciones.length === 0 ? (
          <p className="estado-vacio">Aún no hay nadie en el equipo. Usa «Invitar colaborador» para agregar a la primera persona.</p>
        ) : filas.length === 0 ? (
          <p className="estado-vacio">Nadie cumple estos filtros.</p>
        ) : (
          <div className="tabla__scroll">
            <table className="tabla tabla--equipo tabla--carga">
              <thead>
                <tr className="tabla__grupos">
                  <th colSpan={2}>Quién es</th>
                  <th colSpan={4} className="sep">
                    Carga actual
                  </th>
                  <th colSpan={3} className="sep">
                    Rendimiento ({periodo} días)
                  </th>
                  <th colSpan={2} className="sep" />
                </tr>
                <tr>
                  <th scope="col">Persona</th>
                  <th scope="col">Trabaja en</th>
                  <th scope="col" className="sep">
                    Por severidad
                  </th>
                  <th scope="col">Asignadas</th>
                  <th scope="col">Vencidas</th>
                  <th scope="col">En corrección</th>
                  <th scope="col" className="sep">
                    Resueltas
                  </th>
                  <th scope="col">% en plazo</th>
                  <th scope="col">Alertas</th>
                  <th scope="col" className="sep">
                    Última actividad
                  </th>
                  <th scope="col">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) =>
                  editando === f.clave ? (
                    <EdicionColaborador
                      key={f.clave}
                      fila={f}
                      repos={repos}
                      columnas={COLUMNAS}
                      onGuardar={(cambios) => guardarEdicion(f, cambios)}
                      onCancelar={() => setEditando(null)}
                    />
                  ) : f.tipo === 'miembro' ? (
                    <tr key={f.clave}>
                      <td>
                        <span className="persona">
                          <span className="avatar">{iniciales(f.nombre)}</span>
                          <span>
                            {f.nombre}
                            <span className="celda-sec">
                              <span className="rol">{ROLES[f.rol]}</span> {f.github ? `@${f.github}` : 'sin GitHub'}
                            </span>
                          </span>
                        </span>
                      </td>
                      <td>{trabajaEn(f)}</td>
                      {f.rol === 'colaborador' ? (
                        <>
                          <td className="sep">{barra(f.carga)}</td>
                          <td className="celda-num">{f.carga.asignadas}</td>
                          <td className={`celda-num ${f.carga.vencidas ? 'texto-vencida' : ''}`}>{f.carga.vencidas}</td>
                          <td className={`celda-num ${f.carga.enCorreccion >= limite ? 'texto-limite' : ''}`}>
                            {f.carga.enCorreccion} / {limite}
                          </td>
                          <td className="sep celda-num">{f.carga.resueltas}</td>
                          <td className="celda-num">{f.carga.enPlazo === null ? '—' : `${f.carga.enPlazo} %`}</td>
                          <td className="celda-num">{f.alertas}</td>
                        </>
                      ) : (
                        <>
                          <td className="sep celda-sec" colSpan={4}>
                            Solo lectura: no recibe asignaciones
                          </td>
                          <td className="sep celda-sec" colSpan={3}>
                            —
                          </td>
                        </>
                      )}
                      <td className="sep celda-sec">
                        {f.ultima ? formatearFecha(f.ultima) : `Miembro desde ${formatearFecha(f.fecha)}`}
                      </td>
                      <td>
                        <div className="acciones-fila">
                          {botonEditar(f)}
                          <button type="button" className="btn-peligro" onClick={() => quitar(f)}>
                            Quitar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={f.clave} className="fila-pendiente">
                      <td>
                        <span className="persona">
                          <span className="avatar avatar--pendiente">{iniciales(f.correo)}</span>
                          <span>
                            <span className="celda-mono">{f.correo}</span>
                            <span className="celda-sec">
                              <span className="rol">{ROLES[f.rol]}</span> {f.github ? `@${f.github}` : ''}
                            </span>
                          </span>
                        </span>
                      </td>
                      <td className="celda-sec">Al aceptar: principal</td>
                      <td className="sep" colSpan={8}>
                        <span className={`sev ${f.vencida ? 'est--error' : 'est--en_proceso'}`}>
                          {f.vencida ? 'Invitación vencida' : 'Invitación pendiente'}
                        </span>{' '}
                        <span className="celda-sec">
                          {f.vencida ? 'Venció' : 'Vence'} el {formatearFecha(f.venceEn)}
                        </span>
                      </td>
                      <td>
                        <div className="acciones-fila">
                          {botonEditar(f)}
                          <button type="button" className="btn-tabla" onClick={() => reenviar(f)}>
                            Reenviar
                          </button>
                          <button
                            type="button"
                            className="btn-peligro"
                            onClick={() => ejecutar(revocarInvitacion(f.clave), `Invitación a ${f.correo} revocada.`)}
                          >
                            Revocar
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
        <p className="panel__nota">
          Solo tú ves esta comparación; cada colaborador ve únicamente sus propias métricas. «Alertas» son los recordatorios
          que recibió en el periodo.
        </p>
      </section>

      {colaboradores.length > 0 && (
        <section className="destacados" aria-label="Destacados del periodo">
          {destacados.map(({ titulo, d, tono }) => (
            <div key={titulo} className="destacado">
              <span className="avatar">{d ? iniciales(d.nombre) : '—'}</span>
              <span>
                <span className="celda-sec">{titulo}</span>
                <strong className={d ? tono : 'celda-sec'}>{d ? `${d.nombre} · ${d.valor}` : 'Nadie por ahora'}</strong>
              </span>
            </div>
          ))}
        </section>
      )}

      {colaboradores.length > 0 && (
        <section className="panel sugerencias" aria-label="Sugerencias para equilibrar la carga">
          <h2 className="sugerencias__titulo">
            <Scale size={18} aria-hidden="true" />
            Sugerencias para equilibrar la carga
          </h2>
          {sugerencias.length === 0 && (
            <p className="celda-sec">La carga está equilibrada: nadie tiene vencidas, estancadas ni llegó al límite.</p>
          )}
          {sugerencias.map((s, n) => (
            <div key={n} className="sugerencia">
              {s.tipo === 'reasignar' && (
                <>
                  <span className="chip-tipo chip-tipo--ok">Reasignación</span>
                  <p>
                    {s.a.nombre} tiene {s.a.carga.vencidas} vencida{s.a.carga.vencidas > 1 && 's'} y {s.b.nombre} ninguna.
                    ¿Pasar <Link to={`/incidencias/${s.inc.id}`}>«{s.inc.titulo ?? s.inc.regla_id}»</Link> a {s.b.nombre}?
                  </p>
                  <span className="acciones-fila">
                    <button
                      type="button"
                      className="btn-tabla"
                      onClick={() => ejecutar(asignarIncidencia(s.inc.id, s.b.clave), `Reasignada a ${s.b.nombre}.`)}
                    >
                      Reasignar a {s.b.nombre}
                    </button>
                    <button type="button" className="btn-cabecera" onClick={() => setIgnoradas((x) => [...x, s.inc.id])}>
                      Ignorar
                    </button>
                  </span>
                </>
              )}
              {s.tipo === 'estancada' && (
                <>
                  <span className="chip-tipo chip-tipo--alerta">Estancada</span>
                  <p>
                    <Link to={`/incidencias/${s.inc.id}`}>«{s.inc.titulo ?? s.inc.regla_id}»</Link> lleva{' '}
                    {diasDesde(s.inc.actualizada_en)} días en corrección sin cambios ({s.a.nombre}).
                  </p>
                </>
              )}
              {s.tipo === 'limite' && (
                <>
                  <span className="chip-tipo chip-tipo--info">Límite</span>
                  <p>
                    {s.a.nombre} llegó al límite de {limite} en corrección: no podrá tomar otra hasta terminar o pedir
                    verificación.
                  </p>
                </>
              )}
            </div>
          ))}
          <p className="celda-sec">Las calcula el sistema con reglas fijas; ninguna se aplica sin tu aprobación.</p>
        </section>
      )}
    </>
  )
}
