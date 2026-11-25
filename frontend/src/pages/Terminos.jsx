import { Link } from 'react-router-dom'
import PaginaLegal, { Contacto } from '../components/PaginaLegal.jsx'

export default function Terminos() {
  return (
    <PaginaLegal titulo="Términos y condiciones">
      <section>
        <h2>1. Qué es Centinela</h2>
        <p>
          Centinela es un proyecto académico de Ingeniería de Software, desarrollado por estudiantes con fines de
          aprendizaje. Analiza repositorios
          públicos de GitHub con Bandit y Semgrep, y usa un modelo de inteligencia artificial para explicar y priorizar
          los hallazgos. Al crear una cuenta aceptas estos términos y la{' '}
          <Link to="/privacidad">política de privacidad</Link>.
        </p>
      </section>

      <section>
        <h2>2. Tu cuenta</h2>
        <p>
          Usa datos verdaderos y mantén tu contraseña en secreto: eres responsable de lo que se haga con tu cuenta. Los
          roles de administrador y de líder de equipo los asignan los responsables del proyecto; no se pueden obtener
          de otra forma.
        </p>
      </section>

      <section>
        <h2>3. Uso permitido</h2>
        <ul>
          <li>Analiza solo repositorios públicos y con fines de aprendizaje o de mejora de su seguridad.</li>
          <li>No uses los resultados para atacar sistemas de terceros.</li>
          <li>
            No intentes saltarte los límites de uso, acceder a datos de otros usuarios ni automatizar peticiones al
            servicio.
          </li>
          <li>Invita a un equipo solo a personas que estén de acuerdo en recibir los correos de Centinela.</li>
        </ul>
      </section>

      <section>
        <h2>4. Alcance y límites del análisis</h2>
        <p>
          Centinela no modifica el código analizado ni aplica correcciones: solo lo lee. Las explicaciones de la IA son
          orientativas y pueden contener errores. Que un análisis no encuentre vulnerabilidades no garantiza que el
          código sea seguro, y la corrección siempre es responsabilidad de quien desarrolla el proyecto.
        </p>
      </section>

      <section>
        <h2>5. Propiedad del código</h2>
        <p>
          El código analizado sigue siendo de sus autores. Centinela lo descarga temporalmente para analizarlo y lo
          borra al terminar; solo guarda los fragmentos relacionados con cada hallazgo.
        </p>
      </section>

      <section>
        <h2>6. Disponibilidad</h2>
        <p>
          Al ser un proyecto académico, el servicio puede interrumpirse, cambiar o tener límites de uso diarios (por
          ejemplo, en las preguntas a la IA) sin aviso previo.
        </p>
      </section>

      <section>
        <h2>7. Responsabilidad</h2>
        <p>
          El servicio se ofrece tal como está. En la medida que permita la ley, los autores no responden por daños
          derivados del uso de los resultados ni por fallos de los proveedores externos.
        </p>
      </section>

      <section>
        <h2>8. Suspensión de cuentas</h2>
        <p>Podemos suspender una cuenta que incumpla estos términos. Puedes pedir que eliminemos la tuya cuando quieras.</p>
      </section>

      <section>
        <h2>9. Ley aplicable y contacto</h2>
        <p>
          Estos términos se rigen por las leyes de la República del Ecuador. Para cualquier consulta, escribe a{' '}
          <Contacto />.
        </p>
      </section>
    </PaginaLegal>
  )
}
