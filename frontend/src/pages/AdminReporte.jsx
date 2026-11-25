import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import AdminLayout from '../components/AdminLayout.jsx'
import Esqueleto from '../components/Esqueleto.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { ESTADOS_ANALISIS } from '../constants/estados.js'
import { listarAnalisis, obtenerResumen } from '../services/adminService.js'
import { listarEquipos } from '../services/equiposService.js'
import { metricasEquipo } from '../services/incidenciasService.js'
import { formatearFecha } from '../utils/formato.js'
import '../styles/reporte.css'

const LIMITE_ANALISIS = 500 // el mismo tope de listarAnalisis

const fecha = (iso) => (iso ? new Date(iso).toLocaleDateString('es-EC', { dateStyle: 'long' }) : '—')
const numero = (n) => (n ?? 0).toLocaleString('es-EC')
const plural = (n, uno, varios) => `${numero(n)} ${n === 1 ? uno : varios}`

async function cargarReporte() {
  const [resumen, analisis, equipos] = await Promise.all([obtenerResumen(), listarAnalisis(), listarEquipos()])
  if (resumen.error || analisis.error || equipos.error) throw new Error('carga')
  // Las métricas de incidencias las calcula la base por equipo; los equipos son pocos.
  const metricas = await Promise.all(equipos.data.map((e) => metricasEquipo(e.id)))
  return {
    resumen: resumen.data,
    analisis: analisis.data,
    equipos: equipos.data.map((e, i) => ({ ...e, m: metricas[i].data ?? null })),
  }
}

function totales(analisis) {
  const t = { total: 0, alto: 0, medio: 0, bajo: 0, completado: 0, error: 0, enCurso: 0, repos: new Set() }
  for (const a of analisis) {
    t.total += a.total
    t.alto += a.conteo.alto
    t.medio += a.conteo.medio
    t.bajo += a.conteo.bajo
    if (a.estado === 'completado') t.completado++
    else if (a.estado === 'error') t.error++
    else t.enCurso++
    t.repos.add(a.repo)
  }
  return t
}

export default function AdminReporte() {
  const { perfil, usuario } = useAuth()
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [intento, setIntento] = useState(0)

  useEffect(() => {
    let activo = true
    setError('')
    cargarReporte()
      .then((d) => activo && setDatos(d))
      .catch(() => activo && setError('No se pudieron cargar los datos del reporte. Inténtalo de nuevo.'))
    return () => {
      activo = false
    }
  }, [intento])

  const hoy = new Date()
  // El navegador propone este título como nombre del PDF.
  const nombreArchivo = `Reporte Centinela ${hoy.toISOString().slice(0, 10)}`

  return (
    <AdminLayout
      titulo="Reporte general"
      descripcion="Recopilación de todos los análisis y equipos de trabajo, lista para revisar y descargar en PDF."
    >
      <title>{nombreArchivo}</title>
      <div className="rep-barra">
        <p>
          Al pulsar el botón se abre el cuadro de impresión: elige <strong>Guardar como PDF</strong> como destino.
        </p>
        <button type="button" className="btn-primario" onClick={() => window.print()} disabled={!datos}>
          <Download size={18} aria-hidden="true" />
          Descargar PDF
        </button>
      </div>

      {error && (
        <div className="rep-error" role="alert">
          <p>{error}</p>
          <button type="button" className="btn-cabecera" onClick={() => setIntento((n) => n + 1)}>
            Reintentar
          </button>
        </div>
      )}
      {!datos && !error && <Esqueleto forma="lineas" cantidad={8} />}
      {datos && <Hoja datos={datos} hoy={hoy} autor={perfil?.nombre ?? usuario?.email} />}
    </AdminLayout>
  )
}

function Hoja({ datos, hoy, autor }) {
  const { resumen, analisis, equipos } = datos
  const t = totales(analisis)
  const fechas = analisis.map((a) => a.iniciadoEn).filter(Boolean).sort()
  const recortado = analisis.length >= LIMITE_ANALISIS

  return (
    <article className="rep-hoja" aria-label="Vista previa del reporte">
      <header className="rep-cabecera">
        <p className="rep-marca">Centinela</p>
        <h2 className="rep-titulo">Reporte general de seguridad</h2>
        <dl className="rep-meta">
          <div>
            <dt>Periodo</dt>
            <dd>{fechas.length ? `${fecha(fechas[0])} al ${fecha(fechas.at(-1))}` : 'Sin análisis registrados'}</dd>
          </div>
          <div>
            <dt>Generado</dt>
            <dd>
              {formatearFecha(hoy.toISOString())}
              {autor && `, por ${autor}`}
            </dd>
          </div>
        </dl>
      </header>

      <p className="rep-entrada">
        {analisis.length === 0
          ? 'Todavía no se ha realizado ningún análisis.'
          : `Se realizaron ${plural(analisis.length, 'análisis', 'análisis')} sobre ${plural(t.repos.size, 'repositorio', 'repositorios')}. ` +
            `Bandit y Semgrep registraron ${plural(t.total, 'hallazgo', 'hallazgos')}, de los cuales ${numero(t.alto)} ` +
            `${t.alto === 1 ? 'es' : 'son'} de severidad alta. ` +
            (equipos.length
              ? `${plural(equipos.length, 'equipo de trabajo da', 'equipos de trabajo dan')} seguimiento a la corrección.`
              : 'Aún no hay equipos de trabajo.')}
      </p>

      <section className="rep-seccion" aria-labelledby="rep-s1">
        <h3 id="rep-s1">1. Resumen</h3>
        <table className="rep-tabla rep-tabla--resumen">
          <tbody>
            <Fila etiqueta="Análisis realizados" valor={numero(analisis.length)} />
            <Fila etiqueta="Completados" valor={numero(t.completado)} />
            <Fila etiqueta="Terminados con error" valor={numero(t.error)} />
            <Fila etiqueta="Pendientes o en proceso" valor={numero(t.enCurso)} />
            <Fila etiqueta="Repositorios distintos" valor={numero(t.repos.size)} />
            <Fila etiqueta="Usuarios registrados" valor={numero(resumen.usuarios)} />
            <Fila etiqueta="Hallazgos en total" valor={numero(t.total)} />
            <Fila etiqueta="Severidad alta" valor={numero(t.alto)} sev="alta" />
            <Fila etiqueta="Severidad media" valor={numero(t.medio)} sev="media" />
            <Fila etiqueta="Severidad baja" valor={numero(t.bajo)} sev="baja" />
            <Fila etiqueta="Equipos de trabajo" valor={numero(equipos.length)} />
          </tbody>
        </table>
      </section>

      <section className="rep-seccion" aria-labelledby="rep-s2">
        <h3 id="rep-s2">2. Análisis realizados</h3>
        {recortado && (
          <p className="rep-nota">Se incluyen los {numero(LIMITE_ANALISIS)} análisis más recientes.</p>
        )}
        {analisis.length === 0 ? (
          <p className="rep-nota">No hay análisis registrados.</p>
        ) : (
          <table className="rep-tabla">
            <thead>
              <tr>
                <th scope="col">Fecha</th>
                <th scope="col">Repositorio</th>
                <th scope="col">Solicitó</th>
                <th scope="col">Estado</th>
                <th scope="col" className="rep-num">
                  Alta
                </th>
                <th scope="col" className="rep-num">
                  Media
                </th>
                <th scope="col" className="rep-num">
                  Baja
                </th>
                <th scope="col" className="rep-num">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {analisis.map((a) => (
                <tr key={a.id}>
                  <td className="rep-fecha">{formatearFecha(a.iniciadoEn)}</td>
                  <td className="rep-repo">{a.repo}</td>
                  <td>{a.usuario}</td>
                  <td>{ESTADOS_ANALISIS[a.estado] ?? a.estado}</td>
                  <td className="rep-num rep-num--alta">{numero(a.conteo.alto)}</td>
                  <td className="rep-num rep-num--media">{numero(a.conteo.medio)}</td>
                  <td className="rep-num rep-num--baja">{numero(a.conteo.bajo)}</td>
                  <td className="rep-num rep-total">{numero(a.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="rep-seccion" aria-labelledby="rep-s3">
        <h3 id="rep-s3">3. Equipos de trabajo</h3>
        {equipos.length === 0 ? (
          <p className="rep-nota">No hay equipos de trabajo creados.</p>
        ) : (
          <>
            <p className="rep-nota">
              Abiertas: incidencias sin resolver por severidad (alta / media / baja). Vencidas: abiertas que ya pasaron su
              plazo. A tiempo: de las resueltas en los últimos 30 días, cuántas se cerraron dentro del plazo. El puntaje va
              de 0 a 100 y baja con cada incidencia abierta o vencida.
            </p>
            <table className="rep-tabla">
              <thead>
                <tr>
                  <th scope="col">Equipo</th>
                  <th scope="col">Líder</th>
                  <th scope="col" className="rep-num">
                    Miembros
                  </th>
                  <th scope="col" className="rep-num">
                    Repos
                  </th>
                  <th scope="col" className="rep-num">
                    Abiertas
                  </th>
                  <th scope="col" className="rep-num">
                    Resueltas 30 d
                  </th>
                  <th scope="col" className="rep-num">
                    Vencidas
                  </th>
                  <th scope="col" className="rep-num">
                    A tiempo
                  </th>
                  <th scope="col" className="rep-num">
                    Puntaje
                  </th>
                </tr>
              </thead>
              <tbody>
                {equipos.map((e) => (
                  <FilaEquipo key={e.id} e={e} />
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>

      <footer className="rep-pie">
        Generado por Centinela. Los hallazgos provienen de Bandit y Semgrep; las explicaciones de la IA son orientativas.
      </footer>
    </article>
  )
}

function Fila({ etiqueta, valor, sev }) {
  return (
    <tr>
      <th scope="row">{etiqueta}</th>
      <td className={`rep-num${sev ? ` rep-num--${sev}` : ''}`}>{valor}</td>
    </tr>
  )
}

function FilaEquipo({ e }) {
  const m = e.m
  return (
    <tr>
      <td>
        <span className="rep-equipo">{e.nombre}</span>
        {e.creado_en && <span className="rep-sub">Creado el {fecha(e.creado_en)}</span>}
      </td>
      <td>{e.lider?.nombre ?? '—'}</td>
      <td className="rep-num">{numero(e.miembros)}</td>
      <td className="rep-num">{numero(e.repos)}</td>
      {m ? (
        <>
          <td className="rep-num">
            {numero(m.abiertas_alta)} / {numero(m.abiertas_media)} / {numero(m.abiertas_baja)}
          </td>
          <td className="rep-num">{numero(m.resueltas_30d)}</td>
          <td className="rep-num">{numero(m.vencidas)}</td>
          <td className="rep-num">{m.en_plazo_pct === null ? '—' : `${m.en_plazo_pct} %`}</td>
          <td className="rep-num rep-total">{m.puntaje}</td>
        </>
      ) : (
        <td className="rep-num" colSpan={5}>
          Sin métricas
        </td>
      )}
    </tr>
  )
}
