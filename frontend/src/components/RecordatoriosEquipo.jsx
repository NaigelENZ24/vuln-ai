import { useEffect, useMemo, useState } from 'react'
import { BellRing, Mail, Send } from 'lucide-react'
import { actualizarReglas } from '../services/equiposService.js'
import { listarIncidenciasEquipo, listarNotificaciones } from '../services/incidenciasService.js'
import { ejecutarRecordatorios } from '../services/analyzerApi.js'
import { claveUI, etiquetaNivel } from '../utils/severidad.js'
import { ordenarPlan, plazo, ubicacion } from '../utils/incidencias.js'
import { formatearFecha } from '../utils/formato.js'
import Esqueleto from './Esqueleto.jsx'

const CADA = [1, 2, 3, 5, 7, 14]
const HORAS = Array.from({ length: 15 }, (_, i) => i + 6) // 06:00 a 20:00
const RESULTADOS = { todos: 'Todos', enviado: 'Enviados', omitido: 'Omitidos', fallido: 'Fallidos' }
const TIPOS = { recordatorio: 'Recordatorio', escalamiento: 'Escalamiento' }
const DIAS_PAUSA = 3 // igual que el servicio

const reglasDe = (e) => ({
  recordatorios_activos: e.recordatorios_activos,
  hora_recordatorios: e.hora_recordatorios,
  frecuencia_alta_dias: e.frecuencia_alta_dias,
  frecuencia_media_dias: e.frecuencia_media_dias,
  frecuencia_baja_dias: e.frecuencia_baja_dias,
  pausa_en_correccion: e.pausa_en_correccion,
  dias_estancada_admin: e.dias_estancada_admin,
  dias_escalamiento: e.dias_escalamiento,
})

// El registro puede tener cientos de correos: se pintan de 50 en 50.
const POR_TANDA = 50

export function SelectorDias({ etiqueta, valor, opciones, nunca, onCambio, formato = (n) => `cada ${n} día${n > 1 ? 's' : ''}` }) {
  return (
    <label className="regla">
      <span className="regla__texto">{etiqueta}</span>
      <select value={valor ?? ''} onChange={(e) => onCambio(e.target.value === '' ? null : Number(e.target.value))}>
        {nunca && <option value="">{nunca}</option>}
        {opciones.map((n) => (
          <option key={n} value={n}>
            {formato(n)}
          </option>
        ))}
      </select>
    </label>
  )
}

export default function RecordatoriosEquipo({ equipoId, datos, recargar }) {
  const { equipo, miembros } = datos
  const [reglas, setReglas] = useState(() => reglasDe(equipo))
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [incidencias, setIncidencias] = useState([])
  const [registro, setRegistro] = useState(null)
  const [filtro, setFiltro] = useState('todos')
  const [visibles, setVisibles] = useState(POR_TANDA)
  const colaboradores = miembros.filter((m) => m.rol === 'colaborador')
  const [persona, setPersona] = useState(colaboradores[0]?.usuario_id ?? '')
  const [intento, setIntento] = useState(0)

  useEffect(() => setReglas(reglasDe(equipo)), [equipo])

  useEffect(() => {
    let activo = true
    Promise.all([listarIncidenciasEquipo(equipoId), listarNotificaciones(equipoId)]).then(([i, n]) => {
      if (!activo) return
      setIncidencias(i.data ?? [])
      setRegistro(n.data ?? [])
      if (i.error || n.error) setAviso(i.error || n.error)
    })
    return () => {
      activo = false
    }
  }, [equipoId, intento])

  const cambiar = (campo) => (valor) => setReglas((r) => ({ ...r, [campo]: valor }))
  const sinGuardar = JSON.stringify(reglas) !== JSON.stringify(reglasDe(equipo))

  async function guardar(e) {
    e.preventDefault()
    setGuardando(true)
    setAviso('')
    const { error } = await actualizarReglas(equipoId, reglas)
    setGuardando(false)
    if (error) setAviso(error)
    else {
      setAviso('Reglas guardadas.')
      recargar()
    }
  }

  async function enviarAhora() {
    setEnviando(true)
    setResultado(null)
    const r = await ejecutarRecordatorios(equipoId)
    setEnviando(false)
    setResultado(r)
    setIntento((n) => n + 1)
  }

  // Lo que le llega con «Enviar recordatorios ahora»: todo lo pendiente asignado (el envío diario aplica las reglas).
  const vista = useMemo(
    () => ordenarPlan(incidencias.filter((i) => i.asignado_a === persona && ['abierta', 'en_correccion'].includes(i.estado))),
    [incidencias, persona]
  )
  const nombrePersona = colaboradores.find((c) => c.usuario_id === persona)?.perfiles?.nombre ?? ''
  const vencidas = vista.filter((i) => plazo(i).vencida).length

  const filas = (registro ?? []).filter((n) => filtro === 'todos' || n.resultado === filtro)
  const conteo = (r) => (registro ?? []).filter((n) => r === 'todos' || n.resultado === r).length

  return (
    <>
      <div className="rec-acciones">
        <p className="celda-sec">
          {reglas.recordatorios_activos
            ? `Se envían solos cada día a las ${String(equipo.hora_recordatorios).padStart(2, '0')}:00. Ese envío aplica las reglas (máximo un correo al día por persona). «Enviar ahora» manda a todos su pendiente sin esperar.`
            : 'Los recordatorios automáticos están desactivados. Puedes enviarlos a mano.'}
        </p>
        <button type="button" className="btn-primario" disabled={enviando} onClick={enviarAhora}>
          <Send size={16} aria-hidden="true" />
          {enviando ? 'Enviando…' : 'Enviar recordatorios ahora'}
        </button>
      </div>

      {resultado && (
        <p className={`panel__aviso panel__aviso--suelto ${resultado.error ? 'aviso--error' : ''}`} role="status">
          {resultado.error ??
            `Listo: ${resultado.data.enviados} enviados · ${resultado.data.omitidos} omitidos · ${resultado.data.fallidos} fallidos. El detalle está en el registro.`}
        </p>
      )}
      {aviso && (
        <p className="panel__aviso panel__aviso--suelto" role="status">
          {aviso}
        </p>
      )}

      <div className="rec-rejilla">
        <form className="panel rec-reglas" onSubmit={guardar}>
          <h2>Reglas de recordatorio</h2>

          <fieldset className="rec-grupo">
            <legend>Envío</legend>
            <label className="regla regla--interruptor">
              <span className="regla__texto">Enviar recordatorios automáticamente</span>
              <input type="checkbox" checked={reglas.recordatorios_activos} onChange={(e) => cambiar('recordatorios_activos')(e.target.checked)} />
            </label>
            <SelectorDias
              etiqueta="Hora de envío"
              valor={reglas.hora_recordatorios}
              opciones={HORAS}
              formato={(h) => `${String(h).padStart(2, '0')}:00`}
              onCambio={cambiar('hora_recordatorios')}
            />
          </fieldset>

          <fieldset className="rec-grupo">
            <legend>Frecuencia por severidad</legend>
            {[
              ['alto', 'frecuencia_alta_dias'],
              ['medio', 'frecuencia_media_dias'],
              ['bajo', 'frecuencia_baja_dias'],
            ].map(([nivel, campo]) => (
              <SelectorDias
                key={campo}
                etiqueta={<span className={`sev sev--${claveUI(nivel)}`}>{etiquetaNivel(nivel)}</span>}
                valor={reglas[campo]}
                opciones={CADA}
                nunca="Nunca"
                onCambio={cambiar(campo)}
              />
            ))}
          </fieldset>

          <fieldset className="rec-grupo">
            <legend>Pausas y escalamiento</legend>
            <label className="regla regla--interruptor">
              <span className="regla__texto">No recordar lo que se está corrigiendo durante {DIAS_PAUSA} días</span>
              <input type="checkbox" checked={reglas.pausa_en_correccion} onChange={(e) => cambiar('pausa_en_correccion')(e.target.checked)} />
            </label>
            <SelectorDias
              etiqueta="Avisarte de una estancada a los"
              valor={reglas.dias_estancada_admin}
              opciones={[5, 8, 10, 14]}
              formato={(n) => `${n} días`}
              onCambio={cambiar('dias_estancada_admin')}
            />
            <SelectorDias
              etiqueta="Avisarte de lo que lleva sin atención"
              valor={reglas.dias_escalamiento}
              opciones={[7, 14, 21, 30]}
              formato={(n) => `${n} días`}
              onCambio={cambiar('dias_escalamiento')}
            />
            <p className="celda-sec">Lo vencido siempre se te avisa, en un único correo al día.</p>
          </fieldset>

          <button type="submit" className="btn-primario" disabled={guardando || !sinGuardar}>
            {guardando ? 'Guardando…' : sinGuardar ? 'Guardar reglas' : 'Reglas guardadas'}
          </button>
        </form>

        <section className="panel rec-vista" aria-label="Vista previa del correo">
          <div className="rec-vista__cabecera">
            <h2>
              <Mail size={18} aria-hidden="true" /> Vista previa
            </h2>
            {colaboradores.length > 0 && (
              <label className="herramienta">
                <span className="sr-only">Colaborador</span>
                <select value={persona} onChange={(e) => setPersona(e.target.value)}>
                  {colaboradores.map((c) => (
                    <option key={c.usuario_id} value={c.usuario_id}>
                      {c.perfiles?.nombre ?? '—'}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {colaboradores.length === 0 ? (
            <p className="celda-sec">Cuando el equipo tenga colaboradores verás aquí el correo que recibirían.</p>
          ) : vista.length === 0 ? (
            <p className="celda-sec">
              {nombrePersona} no tiene incidencias pendientes asignadas, así que no recibiría ningún correo. Asígnale alguna
              en Seguimiento.
            </p>
          ) : (
            <div className="correo">
              <p className="correo__asunto">
                {vencidas
                  ? `Tienes ${vencidas} vulnerabilidad${vencidas > 1 ? 'es' : ''} vencida${vencidas > 1 ? 's' : ''} en ${equipo.nombre}`
                  : `Tienes ${vista.length} vulnerabilidad${vista.length > 1 ? 'es' : ''} pendiente${vista.length > 1 ? 's' : ''} en ${equipo.nombre}`}
              </p>
              <p>Hola {nombrePersona}, esto es lo que tienes pendiente:</p>
              <ul className="correo__lista">
                {vista.slice(0, 5).map((i) => {
                  const p = plazo(i)
                  return (
                    <li key={i.id}>
                      <span className={`sev sev--${claveUI(i.severidad)}`}>{etiquetaNivel(i.severidad)}</span>
                      <span>
                        <strong>{i.titulo ?? i.regla_id}</strong>
                        <span className="celda-mono celda-sec">
                          {ubicacion(i)} · {i.rama} {p.texto && <span className={p.vencida ? 'texto-vencida' : ''}>· {p.texto}</span>}
                        </span>
                      </span>
                    </li>
                  )
                })}
              </ul>
              {vista.length > 5 && <p className="celda-sec">…y {vista.length - 5} más.</p>}
              <p className="celda-sec">Así llega con «Enviar ahora». Sin código del repositorio.</p>
            </div>
          )}
        </section>
      </div>

      <section className="panel" aria-label="Registro de envíos">
        <div className="panel__cabecera rec-registro__cabecera">
          <h2>
            <BellRing size={18} aria-hidden="true" /> Registro de envíos
          </h2>
          <div className="chips chips--sueltos" role="group" aria-label="Filtrar por resultado">
            {Object.entries(RESULTADOS).map(([clave, texto]) => (
              <button
                key={clave}
                type="button"
                className={`chip ${filtro === clave ? 'chip--activo' : ''}`}
                aria-pressed={filtro === clave}
                onClick={() => {
                  setFiltro(clave)
                  setVisibles(POR_TANDA)
                }}
              >
                {texto} <span className="chip__cantidad">{conteo(clave)}</span>
              </button>
            ))}
          </div>
        </div>
        {registro === null ? (
          <Esqueleto forma="tabla" etiqueta="Cargando registro…" />
        ) : filas.length === 0 ? (
          <p className="estado-vacio">Todavía no hay envíos{filtro !== 'todos' ? ' con este resultado' : ''}.</p>
        ) : (
          <div className="tabla__scroll">
            <table className="tabla">
              <thead>
                <tr>
                  <th scope="col">Fecha</th>
                  <th scope="col">Para</th>
                  <th scope="col">Tipo</th>
                  <th scope="col">Contenido</th>
                  <th scope="col">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {filas.slice(0, visibles).map((n) => (
                  <tr key={n.id}>
                    <td>{formatearFecha(n.creado_en)}</td>
                    <td>
                      {n.tipo === 'escalamiento' ? 'Administrador' : n.perfiles?.nombre ?? '—'}
                      <span className="celda-sec">{n.correo}</span>
                    </td>
                    <td>{TIPOS[n.tipo] ?? n.tipo}</td>
                    <td>
                      {n.resumen ?? '—'}
                      {n.detalle && <span className="celda-sec">{n.detalle}</span>}
                    </td>
                    <td>
                      <span className={`sev res--${n.resultado}`}>{RESULTADOS[n.resultado]?.replace(/s$/, '') ?? n.resultado}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filas.length > visibles && (
              <button type="button" className="btn-tabla" onClick={() => setVisibles((v) => v + POR_TANDA)}>
                Mostrar más ({filas.length - visibles} restantes)
              </button>
            )}
          </div>
        )}
      </section>
    </>
  )
}
