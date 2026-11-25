import PaginaLegal, { Contacto } from '../components/PaginaLegal.jsx'

export default function Privacidad() {
  return (
    <PaginaLegal titulo="Política de privacidad">
      <section>
        <h2>1. Responsable</h2>
        <p>
          Centinela es un proyecto académico de Ingeniería de Software, desarrollado por estudiantes con fines de
          aprendizaje. Sus autores son responsables del tratamiento de los datos descritos aquí, conforme a la Ley
          Orgánica de Protección de Datos Personales del Ecuador (LOPDP). Contacto: <Contacto />.
        </p>
      </section>

      <section>
        <h2>2. Datos que tratamos</h2>
        <ul>
          <li>
            <strong>Cuenta:</strong> nombre de usuario, correo y contraseña. La contraseña se guarda cifrada por el
            servicio de autenticación; nadie del proyecto puede leerla.
          </li>
          <li>
            <strong>Análisis:</strong> la dirección de los repositorios públicos de GitHub que analizas, los hallazgos de
            Bandit y Semgrep (archivo, línea y fragmento de código) y las explicaciones generadas.
          </li>
          <li>
            <strong>Chat y asistente:</strong> las preguntas que escribes y las respuestas recibidas.
          </li>
          <li>
            <strong>Equipos de trabajo:</strong> correo de las personas invitadas, usuario de GitHub, rol y rama de
            trabajo, incidencias asignadas, comentarios e historial de cambios de estado.
          </li>
          <li>
            <strong>Solicitudes de equipo:</strong> nombre del equipo, tamaño y la descripción opcional del proyecto.
          </li>
          <li>
            <strong>Avisos por correo:</strong> el registro de invitaciones y recordatorios enviados.
          </li>
        </ul>
        <p>No pedimos datos sensibles ni datos de pago.</p>
      </section>

      <section>
        <h2>3. Para qué los usamos</h2>
        <p>
          Solo para prestar el servicio: iniciar sesión, ejecutar y guardar tus análisis, responder tus preguntas,
          organizar el trabajo de los equipos y enviar los avisos que el equipo configuró. No vendemos tus datos ni los
          usamos para publicidad. La base legal es tu consentimiento, que das al crear la cuenta, y la ejecución del
          servicio que solicitas.
        </p>
      </section>

      <section>
        <h2>4. Con quién se comparten</h2>
        <p>Usamos proveedores que tratan los datos por encargo nuestro. Sus servidores pueden estar fuera de Ecuador:</p>
        <ul>
          <li>
            <strong>Supabase:</strong> base de datos y autenticación.
          </li>
          <li>
            <strong>Proveedor de IA (Google Gemini o Anthropic Claude):</strong> recibe los hallazgos, los fragmentos de
            código y tus preguntas para redactar las explicaciones. No recibe tu correo ni tu contraseña.
          </li>
          <li>
            <strong>Brevo:</strong> envío de invitaciones y recordatorios por correo.
          </li>
          <li>
            <strong>GitHub:</strong> consultamos la información pública del repositorio y de sus commits.
          </li>
        </ul>
        <p>
          Dentro de un equipo, el administrador, el líder y los demás integrantes ven tu nombre, tu rol y las
          incidencias que tienes asignadas.
        </p>
      </section>

      <section>
        <h2>5. Cuánto tiempo los guardamos</h2>
        <p>
          Mientras tu cuenta exista. El código del repositorio se descarga en una carpeta temporal y se borra al
          terminar cada análisis; solo se guardan los fragmentos de los hallazgos. Si pides eliminar tu cuenta,
          borramos tus datos, salvo lo que la ley obligue a conservar.
        </p>
      </section>

      <section>
        <h2>6. Tus derechos</h2>
        <p>
          Puedes pedir acceso a tus datos, rectificarlos, eliminarlos, oponerte a su tratamiento, suspenderlo o
          recibirlos en un formato portable. Escribe a <Contacto /> desde el correo de tu cuenta; respondemos en un
          máximo de 15 días. Si no quedas conforme, puedes acudir a la Superintendencia de Protección de Datos
          Personales.
        </p>
      </section>

      <section id="cookies">
        <h2>7. Cookies y almacenamiento local</h2>
        <p>
          Centinela no usa cookies de publicidad ni de analítica, ni herramientas de seguimiento de terceros. El
          navegador guarda en su almacenamiento local:
        </p>
        <ul>
          <li>
            <strong>Tu sesión</strong>, para que no tengas que iniciar sesión en cada página. Es necesaria para el
            servicio.
          </li>
          <li>
            <strong>Preferencias de la interfaz</strong>, como si ya viste el tutorial del equipo o si dejaste abierto el
            panel de invitaciones.
          </li>
        </ul>
        <p>
          Como solo guardamos lo necesario para que el servicio funcione, no mostramos un aviso de cookies. Puedes
          borrar estos datos desde la configuración de tu navegador; al hacerlo se cerrará tu sesión.
        </p>
      </section>

      <section>
        <h2>8. Seguridad</h2>
        <p>
          Cada usuario solo puede leer sus propios datos y los de sus equipos; la base de datos lo comprueba en cada
          consulta. Los analizadores se ejecutan en un contenedor aislado, sin acceso a la red y sin poder modificar el
          código analizado.
        </p>
      </section>

      <section>
        <h2>9. Cambios en esta política</h2>
        <p>
          Si la cambiamos, actualizaremos la fecha de arriba. Revisa esta página de vez en cuando.
        </p>
      </section>
    </PaginaLegal>
  )
}
