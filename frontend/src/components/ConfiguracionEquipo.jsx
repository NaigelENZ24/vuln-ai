import { useEffect, useState } from 'react'
import { BellRing, Clock, Gauge } from 'lucide-react'
import RecordatoriosEquipo, { SelectorDias } from './RecordatoriosEquipo.jsx'
import { actualizarReglas, recalcularPlazos } from '../services/equiposService.js'
import { claveUI, etiquetaNivel } from '../utils/severidad.js'

const PLAZOS = {
  plazo_alta_dias: { nivel: 'alto', opciones: [1, 3, 5, 7, 14] },
  plazo_media_dias: { nivel: 'medio', opciones: [7, 15, 30, 45, 60] },
  plazo_baja_dias: { nivel: 'bajo', opciones: [30, 60, 90, 180] },
}
const valoresDe = (e) => ({
  plazo_alta_dias: e.plazo_alta_dias,
  plazo_media_dias: e.plazo_media_dias,
  plazo_baja_dias: e.plazo_baja_dias,
  limite_en_correccion: e.limite_en_correccion,
  dias_estancada: e.dias_estancada,
})
const dias = (n) => `${n} día${n > 1 ? 's' : ''}`

// Engranaje del equipo: plazos de resolución, carga de trabajo y recordatorios por correo.
export default function ConfiguracionEquipo({ equipoId, datos, recargar }) {
  const [valores, setValores] = useState(() => valoresDe(datos.equipo))
  const [aplicarAbiertas, setAplicarAbiertas] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState('')

  useEffect(() => setValores(valoresDe(datos.equipo)), [datos.equipo])

  const cambiar = (campo) => (v) => setValores((x) => ({ ...x, [campo]: v }))
  const sinGuardar = JSON.stringify(valores) !== JSON.stringify(valoresDe(datos.equipo))

  async function guardar(e) {
    e.preventDefault()
    setGuardando(true)
    setAviso('')
    const r = await actualizarReglas(equipoId, valores)
    let texto = r.error ?? 'Cambios guardados. Los plazos nuevos se aplican a las incidencias que se detecten desde ahora.'
    if (!r.error && aplicarAbiertas) {
      const p = await recalcularPlazos(equipoId)
      texto = p.error ?? `Cambios guardados. Se recalculó el plazo de ${p.data} incidencia${p.data === 1 ? '' : 's'} abierta${p.data === 1 ? '' : 's'}.`
    }
    setGuardando(false)
    setAviso(texto)
    setAplicarAbiertas(false)
    if (!r.error) recargar()
  }

  return (
    <>
      <div className="config__cabecera">
        <h2>Configuración general</h2>
        <p className="celda-sec">Reglas de este equipo. Los cambios afectan solo a {datos.equipo.nombre}.</p>
      </div>

      <form className="config__generales" onSubmit={guardar}>
        <section className="panel config__seccion">
          <h3>
            <Clock size={18} aria-hidden="true" /> Plazos de resolución por severidad
          </h3>
          <p className="celda-sec">Días que tiene el equipo para corregir una incidencia desde que se detecta.</p>
          {Object.entries(PLAZOS).map(([campo, { nivel, opciones }]) => (
            <SelectorDias
              key={campo}
              etiqueta={<span className={`sev sev--${claveUI(nivel)}`}>{etiquetaNivel(nivel)}</span>}
              valor={valores[campo]}
              opciones={opciones}
              nunca="Sin plazo"
              formato={dias}
              onCambio={cambiar(campo)}
            />
          ))}
          <label className="regla regla--interruptor">
            <span className="regla__texto">Aplicar también a las incidencias que ya están abiertas</span>
            <input type="checkbox" checked={aplicarAbiertas} onChange={(e) => setAplicarAbiertas(e.target.checked)} />
          </label>
        </section>

        <section className="panel config__seccion">
          <h3>
            <Gauge size={18} aria-hidden="true" /> Carga de trabajo
          </h3>
          <p className="celda-sec">Evita que alguien acapare incidencias o deje una a medias.</p>
          <SelectorDias
            etiqueta="Máximo en corrección por persona"
            valor={valores.limite_en_correccion}
            opciones={[1, 2, 3, 4, 5]}
            formato={(n) => `${n} a la vez`}
            onCambio={cambiar('limite_en_correccion')}
          />
          <SelectorDias
            etiqueta="Marcar como estancada si sigue en corrección sin cambios"
            valor={valores.dias_estancada}
            opciones={[3, 5, 7, 10]}
            formato={dias}
            onCambio={cambiar('dias_estancada')}
          />
        </section>

        <div className="config__guardar">
          {aviso && (
            <p className="celda-sec" role="status">
              {aviso}
            </p>
          )}
          <button type="submit" className="btn-primario" disabled={guardando || (!sinGuardar && !aplicarAbiertas)}>
            {guardando ? 'Guardando…' : 'Guardar plazos y carga'}
          </button>
        </div>
      </form>

      <h3 className="config__subtitulo">
        <BellRing size={18} aria-hidden="true" /> Recordatorios por correo
      </h3>
      <RecordatoriosEquipo equipoId={equipoId} datos={datos} recargar={recargar} />
    </>
  )
}
