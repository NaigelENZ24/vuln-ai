import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, Bot, Check, LoaderCircle } from 'lucide-react'
import SiteHeader from '../components/SiteHeader.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import {
  asignarIncidencia,
  cambiarEstado,
  comentar,
  obtenerIncidencia,
  resolverDescarte,
} from '../services/incidenciasService.js'
import { colaboradoresDe } from '../services/equiposService.js'
import { verificarIncidencia } from '../services/analyzerApi.js'
import { ESTADOS_INCIDENCIA } from '../constants/estados.js'
import { claveUI, etiquetaNivel } from '../utils/severidad.js'
import { plazo, textoCierre, ubicacion } from '../utils/incidencias.js'
import { formatearFecha } from '../utils/formato.js'
import '../styles/analisis.css'
import '../styles/equipos.css'

const PASOS = ['abierta', 'en_correccion', 'en_revision', 'resuelta']
const EVENTOS = {
  detectada: 'Detectada',
  tomar: 'Tomó la incidencia',
  corregir: 'Empezó a corregirla',
  liberar: 'La liberó',
  verificar: 'Pidió verificar la corrección',
  solicitar_descarte: 'Pidió revisión: dice que no es una vulnerabilidad',
  asignada: 'Asignó responsable',
  desasignada: 'Quitó el responsable',
  descarte_aprobado: 'La marcó como resuelta: no es una vulnerabilidad',
  descarte_rechazado: 'Rechazó la revisión: vuelve a corrección',
  reabierta: 'Volvió a aparecer',
  verificacion_fallida: 'Verificación fallida',
  verificacion_error: 'No se pudo verificar',
  resuelta: 'Resuelta',
}

export default function Incidencia() {
  const { id } = useParams()
  const { usuario, esAdmin, equipos } = useAuth()
  const [inc, setInc] = useState(undefined)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [intento, setIntento] = useState(0)
  const [ocupado, setOcupado] = useState(false)
  const [colaboradores, setColaboradores] = useState([])
  const [descartando, setDescartando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [texto, setTexto] = useState('')

  const recargar = () => setIntento((n) => n + 1)

  useEffect(() => {
    let activo = true
    let temporizador
    obtenerIncidencia(id).then(({ data, error: fallo }) => {
      if (!activo) return
      if (fallo) setError(fallo)
      else {
        setInc(data)
        // Mientras se verifica, se actualiza sola para mostrar el resultado de la verificación.
        if (data?.estado === 'en_revision' && !data.descarte_solicitado) temporizador = setTimeout(recargar, 5000)
      }
    })
    return () => {
      activo = false
      clearTimeout(temporizador)
    }
  }, [id, intento])

  const equipoId = inc?.repositorios.equipo_id
  // Admin, o líder (creador) del equipo de esta incidencia: asigna, libera y resuelve revisiones.
  const gestiona = esAdmin || (Boolean(usuario) && inc?.repositorios.equipos?.creado_por === usuario.id)
  useEffect(() => {
    if (gestiona && equipoId) colaboradoresDe(equipoId).then(({ data }) => data && setColaboradores(data))
  }, [gestiona, equipoId])

  const historial = useMemo(() => {
    if (!inc) return []
    return [
      ...inc.eventos.map((e) => ({ ...e, clase: 'evento' })),
      ...inc.comentarios.map((c) => ({ ...c, clase: 'comentario' })),
    ].sort((a, b) => new Date(b.creado_en) - new Date(a.creado_en))
  }, [inc])

  async function ejecutar(promesa, despues) {
    setOcupado(true)
    setAviso('')
    const { error: fallo } = await promesa
    if (fallo) setAviso(fallo)
    else if (despues) await despues()
    setOcupado(false)
    recargar()
  }

  const verificar = () =>
    ejecutar(cambiarEstado(inc.id, 'verificar'), async () => {
      const { error: fallo } = await verificarIncidencia(inc.id)
      if (fallo) setAviso(`Quedó en revisión, pero no se pudo iniciar la verificación: ${fallo}`)
    })

  async function enviarComentario(e) {
    e.preventDefault()
    if (!texto.trim()) return
    await ejecutar(comentar(inc.id, texto))
    setTexto('')
  }

  async function pedirDescarte(e) {
    e.preventDefault()
    await ejecutar(cambiarEstado(inc.id, 'solicitar_descarte', motivo))
    setDescartando(false)
  }

  if (error || inc === null) {
    return (
      <div className="analisis">
        <SiteHeader />
        <main className="analisis__contenedor">
          <p className="analisis__error" role="alert">
            {error || 'No existe esa incidencia o no tienes acceso a ella.'}
          </p>
        </main>
      </div>
    )
  }
  if (inc === undefined) return <p className="cargando" role="status">Cargando…</p>

  const rol = equipos.find((e) => e.equipo_id === equipoId)?.rol
  const esColab = rol === 'colaborador'
  const esMia = inc.asignado_a === usuario.id
  const activa = ['abierta', 'en_correccion'].includes(inc.estado)
  const p = plazo(inc)
  const ultimo = inc.eventos[0]
  const fallida =
    inc.estado === 'en_correccion' && ['verificacion_fallida', 'verificacion_error'].includes(ultimo?.tipo) ? ultimo : null
  const paso = PASOS.indexOf(inc.estado)

  return (
    <div className="analisis">
      <SiteHeader />
      <main className="analisis__contenedor inc">
        <Link className="detalle__volver" to={gestiona ? `/admin/equipos/${equipoId}` : '/mi-trabajo'}>
          <ArrowLeft size={16} aria-hidden="true" />
          {gestiona ? 'Seguimiento del equipo' : 'Mi trabajo'}
        </Link>

        <div className="inc__cabecera">
          <span className={`sev sev--${claveUI(inc.severidad)}`}>{etiquetaNivel(inc.severidad)}</span>
          <h1>{inc.titulo ?? inc.regla_id}</h1>
          <p className="celda-mono celda-sec">
            {inc.repositorios.nombre} · {inc.rama} · {ubicacion(inc)}
          </p>
        </div>

        {fallida && (
          <div className="inc__alerta" role="status">
            <AlertTriangle size={18} aria-hidden="true" />
            <p>
              <strong>{EVENTOS[fallida.tipo]}:</strong> {fallida.nota} La incidencia volvió a «En corrección».
            </p>
          </div>
        )}
        {inc.estado === 'en_revision' && (
          <div className="inc__alerta inc__alerta--info" role="status">
            <LoaderCircle size={18} aria-hidden="true" />
            <p>
              {inc.descarte_solicitado
                ? `En revisión del administrador: ${inc.asignado?.nombre ?? 'el colaborador'} indicó que no es una vulnerabilidad («${inc.motivo_descarte}»). No se re-analiza ni se usa la IA.`
                : `Verificando: Centinela revisa solo ${inc.archivo}, no todo el repositorio. Esta página se actualiza sola.`}
            </p>
          </div>
        )}
        {aviso && (
          <p className="analisis__error" role="alert">
            {aviso}
          </p>
        )}

        {inc.estado === 'descartada' ? (
          <p className="panel__aviso panel__aviso--suelto">Descartada por el administrador: «{inc.motivo_descarte}»</p>
        ) : (
          <ol className="inc-pasos" aria-label="Estado">
            {PASOS.map((s, i) => (
              <li
                key={s}
                className={`inc-pasos__item ${i < paso ? 'inc-pasos__item--hecho' : ''} ${i === paso ? 'inc-pasos__item--actual' : ''}`}
                aria-current={i === paso ? 'step' : undefined}
              >
                <span className="inc-pasos__bola">{i < paso ? <Check size={14} aria-hidden="true" /> : i + 1}</span>
                {ESTADOS_INCIDENCIA[s]}
              </li>
            ))}
          </ol>
        )}

        <div className="inc__rejilla">
          <div className="inc__principal">
            <section className="panel inc__bloque">
              <h2>Código afectado</h2>
              {inc.fragmento_codigo ? (
                <pre className="codigo">
                  <code>{inc.fragmento_codigo}</code>
                </pre>
              ) : (
                <p className="celda-sec">No hay fragmento de código disponible.</p>
              )}
              <dl className="inc__datos">
                <div>
                  <dt>Regla</dt>
                  <dd className="celda-mono">{inc.regla_id}</dd>
                </div>
                <div>
                  <dt>CWE</dt>
                  <dd>{inc.cwe_id ?? '—'}</dd>
                </div>
                <div>
                  <dt>Detectada</dt>
                  <dd>{formatearFecha(inc.creada_en)}</dd>
                </div>
                <div>
                  <dt>Reabierta</dt>
                  <dd>
                    {inc.veces_reabierta} {inc.veces_reabierta === 1 ? 'vez' : 'veces'}
                  </dd>
                </div>
              </dl>
            </section>

            <section className="panel inc__bloque">
              <h2 className="inc__titulo-ia">
                <Bot size={18} aria-hidden="true" />
                Explicación de la IA
              </h2>
              <p>{inc.explicacion_ia || 'La IA no generó una explicación para esta incidencia.'}</p>
              <h3>Recomendación</h3>
              <p>{inc.recomendacion_ia || 'Sin recomendación generada.'}</p>
            </section>

            <section className="panel inc__bloque">
              <h2>Historial y comentarios</h2>
              <ul className="historial">
                {historial.map((h) => (
                  <li key={`${h.clase}-${h.id}`} className={`historial__item historial__item--${h.clase}`}>
                    <strong>
                      {h.clase === 'comentario'
                        ? h.autor?.nombre ?? 'Administrador'
                        : h.actor_id
                          ? h.actor?.nombre ?? 'Administrador'
                          : 'Sistema'}
                    </strong>{' '}
                    {h.clase === 'comentario' ? 'comentó:' : `· ${EVENTOS[h.tipo] ?? h.tipo}`}
                    {(h.texto || h.nota) && <span className="historial__texto">{h.texto ?? h.nota}</span>}
                    <span className="celda-sec">{formatearFecha(h.creado_en)}</span>
                  </li>
                ))}
              </ul>
              {(gestiona || esColab) && (
                <form className="comentar" onSubmit={enviarComentario}>
                  <label htmlFor="comentario" className="celda-sec">
                    Agregar un comentario
                  </label>
                  <textarea
                    id="comentario"
                    rows={3}
                    maxLength={2000}
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    placeholder="Escribe una nota para el equipo…"
                  />
                  <button type="submit" className="btn-cabecera" disabled={ocupado || !texto.trim()}>
                    Comentar
                  </button>
                </form>
              )}
            </section>
          </div>

          <aside className="panel inc__lateral">
            <dl className="inc__datos inc__datos--columna">
              <div>
                <dt>Responsable</dt>
                <dd>{inc.asignado ? `${inc.asignado.nombre}${esMia ? ' (tú)' : ''}` : 'Sin asignar'}</dd>
              </div>
              {p.texto && (
                <div>
                  <dt>Fecha límite</dt>
                  <dd className={p.vencida ? 'texto-vencida' : ''}>{p.texto}</dd>
                </div>
              )}
              {inc.estado === 'resuelta' && (
                <div>
                  <dt>Cierre</dt>
                  <dd className="texto-ok">
                    {textoCierre(inc)}
                    {inc.motivo_cierre === 'descartada' && inc.motivo_descarte && (
                      <span className="celda-sec">Motivo: «{inc.motivo_descarte}»</span>
                    )}
                  </dd>
                </div>
              )}
            </dl>

            {esColab && !inc.asignado_a && inc.estado === 'abierta' && (
              <button type="button" className="btn-primario" disabled={ocupado} onClick={() => ejecutar(cambiarEstado(inc.id, 'tomar'))}>
                Tomar esta incidencia
              </button>
            )}
            {esMia && inc.estado === 'abierta' && (
              <button type="button" className="btn-primario" disabled={ocupado} onClick={() => ejecutar(cambiarEstado(inc.id, 'corregir'))}>
                Estoy corrigiendo esto
              </button>
            )}
            {esMia && activa && (
              <>
                <button type="button" className="btn-primario" disabled={ocupado} onClick={verificar}>
                  Ya la corregí, verificar
                </button>
                {descartando ? (
                  <form className="comentar" onSubmit={pedirDescarte}>
                    <label htmlFor="motivo" className="celda-sec">
                      ¿Por qué no es una vulnerabilidad? (falso positivo o riesgo aceptado). Pasará a revisión del
                      administrador.
                    </label>
                    <textarea id="motivo" rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
                    <span className="acciones-fila">
                      <button type="submit" className="btn-tabla" disabled={ocupado || motivo.trim().length < 10}>
                        Enviar solicitud
                      </button>
                      <button type="button" className="btn-cabecera" onClick={() => setDescartando(false)}>
                        Cancelar
                      </button>
                    </span>
                  </form>
                ) : (
                  <button type="button" className="btn-cabecera" onClick={() => setDescartando(true)}>
                    No es una vulnerabilidad…
                  </button>
                )}
              </>
            )}

            {gestiona && inc.descarte_solicitado && (
              <div className="tarjeta-inc__descarte">
                <span>
                  {inc.asignado?.nombre ?? 'El colaborador'} dice que no es una vulnerabilidad: «{inc.motivo_descarte}»
                </span>
                <span className="acciones-fila">
                  <button type="button" className="btn-tabla" disabled={ocupado} onClick={() => ejecutar(resolverDescarte(inc.id, true))}>
                    Marcar como resuelta
                  </button>
                  <button type="button" className="btn-cabecera" disabled={ocupado} onClick={() => ejecutar(resolverDescarte(inc.id, false))}>
                    Rechazar: vuelve a corrección
                  </button>
                </span>
              </div>
            )}
            {gestiona && !['resuelta', 'descartada'].includes(inc.estado) && (
              <label className="eq-campo eq-campo--ancho">
                Responsable: liberar o pasar a otro colaborador
                <select
                  value={inc.asignado_a ?? ''}
                  disabled={ocupado}
                  onChange={(e) => ejecutar(asignarIncidencia(inc.id, e.target.value))}
                >
                  <option value="">Sin asignar</option>
                  {colaboradores.map((c) => (
                    <option key={c.usuario_id} value={c.usuario_id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <p className="celda-sec">
              «Ya la corregí» re-analiza la rama: si el problema ya no aparece se marca como resuelta con el commit que
              la corrigió; si sigue, vuelve a «En corrección».
            </p>
          </aside>
        </div>
      </main>
    </div>
  )
}
