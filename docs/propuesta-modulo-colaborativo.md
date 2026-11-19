# Propuesta: Gestión colaborativa de remediación de vulnerabilidades

Versión 2 de la especificación del módulo colaborativo de Centinela. Reemplaza a `modulo-colaborativo.md`: conserva sus requisitos y decisiones, corrige los puntos que chocaban con el código actual y agrega funciones nuevas. Aún no hay código de este módulo.

---

## 1. La idea en una frase

Centinela deja de ser un analizador que se usa una vez y pasa a ser **un ciclo cerrado de remediación**: detecta, explica, **asigna a la persona correcta, recuerda, verifica automáticamente que se corrigió y demuestra con datos que el equipo mejora**.

### Qué lo hace innovador (para defender en la tesis)

| # | Función | Por qué es distinta |
|---|---|---|
| 1 | **Verificación en ciclo cerrado** | El colaborador pulsa "Ya la corregí" y el sistema re-analiza esa rama y confirma o rechaza la corrección con evidencia (commit). No depende de la palabra de nadie. |
| 2 | **Atribución automática de la corrección** | Cuando una incidencia desaparece entre dos commits, el sistema consulta a GitHub qué commits hubo entre ambos y registra "corregida en `a1b2c3` por @usuario". |
| 3 | **Asignación sugerida** | Para cada incidencia nueva sugiere como responsable a la última persona del equipo que modificó ese archivo (API de commits de GitHub). |
| 4 | **Semáforo de fusión por rama** | Compara la rama contra `main` por huella: "esta rama agrega 2 altas nuevas y corrige 3" → Lista / Con observaciones / No recomendada para fusionar. |
| 5 | **Análisis solo si hay cambios** | Antes de un re-análisis programado consulta el último commit de la rama; si no cambió, no gasta Docker ni IA. |
| 6 | **IA con memoria por huella** | Las explicaciones se reutilizan entre análisis: un re-análisis cuesta 0 peticiones a la IA salvo para las incidencias nuevas. |
| 7 | **Recordatorios inteligentes** | Un único correo agrupado por persona, con frecuencia según severidad, pausa mientras corrige y escalamiento al administrador. |
| 8 | **Informe ejecutivo en PDF redactado por IA** | Indicadores, tendencia y un resumen en lenguaje natural del periodo, listo para entregar a un jefe o a la tutora. |
| 9 | **Asistente del equipo** | El chat responde preguntas sobre el equipo ("¿quién tiene más altas vencidas?") con datos calculados por el sistema, no inventados. |
| 10 | **Puntaje de seguridad con tendencia** | Un número 0–100 por equipo y repositorio, con fórmula pública, que permite medir el avance semana a semana. |

---

## 2. Roles

| Rol | Dónde vive | Puede |
|---|---|---|
| **Administrador** | Global (`perfiles.rol`), asignado solo por SQL | Todo: crear equipos, invitar, vincular repos, asignar, aprobar descartes, configurar recordatorios, ver y descargar informes. |
| **Colaborador** | Por equipo (`miembros_equipo.rol`) | Ver todo lo del equipo; cambiar estado **solo de lo asignado a él**; tomar incidencias sin asignar; comentar; pedir re-análisis de su rama; descargar su informe personal. |
| **Observador** | Por equipo | Solo lectura y comentarios (por ejemplo, la tutora o un líder técnico). |

### Validación de acceso (acordada)

| Caso | Qué ve |
|---|---|
| Usuario nunca invitado | Solo Analizar y Mis análisis. **No** ve «Mi trabajo», la campana del equipo ni avisos de invitación. |
| Invitado sin aceptar | Solo el aviso de **su** invitación (correo y banner al iniciar sesión). |
| Colaborador | «Mi trabajo» y la campana; con varios equipos, un selector. |
| Observador | «Mi equipo» en solo lectura (tablero y resumen), no «Mi trabajo». |
| Sacado del equipo | Pierde el acceso y los correos; sus incidencias vuelven a «Sin asignar» (queda en el historial). |

Se valida en tres capas:
1. **Interfaz:** `AuthContext` carga si la persona es miembro de algún equipo, como ya carga el rol.
2. **Ruta:** `RutaMiembro`, similar a `RutaAdmin`; `/mi-trabajo` sin membresía redirige al inicio.
3. **RLS:** la base solo entrega los equipos e incidencias de los equipos del usuario. Esta es la protección real.

Invitaciones:
- Solo la acepta la cuenta cuyo **correo coincide y está verificado**.
- Si la invitación es inválida, está vencida, ya se usó o es de otro correo, siempre se muestra el mismo mensaje genérico, sin revelar el equipo.
- Se limitan los intentos.

---

## 3. Ciclo de vida de una incidencia

```
                 detectada por primera vez
                           │
                           ▼
   ┌──────────────────► ABIERTA ◄────────────────────────────┐
   │                       │ "Estoy corrigiendo esto"          │ reaparece en un
   │                       ▼                                   │ análisis posterior
   │                 EN_CORRECCION ◄──────────┐                │ (reapertura +1)
   │                       │ "Ya la corregí,  │ verificación   │
   │                       │  verificar"      │ fallida        │
   │                       ▼                  │                │
   │                 EN_REVISION ─────────────┘                │
   │                       │ re-análisis: ya no aparece        │
   │                       ▼                                   │
   │                   RESUELTA ───────────────────────────────┘
   │
   │  solicitud "No es una vulnerabilidad" (motivo obligatorio)
   │        → el administrador aprueba → DESCARTADA
   └────────  el administrador rechaza → vuelve a su estado
```

Reglas:

- **Resolución automática:** si una incidencia abierta o en corrección deja de aparecer en un análisis, pasa a `resuelta` aunque nadie la haya marcado.
- **Motivo de cierre** (columna aparte, no más estados): `verificada` (el archivo sigue existiendo y la huella ya no aparece), `archivo_eliminado` (el archivo ya no existe o se movió) o `descartada`. Así se distingue "corregida de verdad" de "ya no aparece".
- **Solicitud de descarte:** se marca con `descarte_solicitado = true` y un motivo (falso positivo o riesgo aceptado). No reutiliza `en_revision`, que significa solo "pendiente de verificación".
- **Cada cambio** (de quién, de qué estado a cuál, nota y si fue el sistema) se guarda en `incidencia_eventos`.

### La huella (corregida respecto a la v1)

```
huella = sha256( regla_id + "|" + archivo + "|" + código_normalizado + "|" + n.º de aparición )
```

- **código_normalizado:** solo las líneas exactas del hallazgo, leídas del clon (`line_range` de Bandit; `start`/`end` de Semgrep), con los espacios colapsados. **No** se usa `fragmento_codigo` de Bandit, porque incluye líneas vecinas con su número delante: editar la línea de arriba cambiaría la huella.
- **N.º de aparición:** si el mismo código vulnerable aparece dos veces en un archivo, la 1.ª y la 2.ª tienen huellas distintas.
- Una incidencia es única por `(repositorio, rama, huella)`.

---

## 4. Flujo de punta a punta

1. **El administrador crea un equipo** (`/admin/equipos`) y vincula repositorios públicos eligiendo las ramas a vigilar. El sistema valida en GitHub que cada rama exista.
2. **Invita personas** por correo con rol y usuario de GitHub. Les llega un enlace `/invitacion/:codigo` que vence en 7 días; si no tienen cuenta, se registran y vuelven al enlace.
3. **Primer análisis** de cada rama vigilada (botón o programado). Cada hallazgo se convierte en incidencia (nueva) o se vincula a una existente por huella.
4. **Asignación:** el sistema sugiere al responsable (último que tocó el archivo). El administrador confirma con un clic o reasigna. Se fija la fecha límite según severidad.
5. **El colaborador recibe un correo** agrupado: "Tienes 3 incidencias (1 alta) en `feature/login`" con enlace a **Mi trabajo**.
6. **Pulsa "Estoy corrigiendo esto"**, corrige en su repositorio, hace push y pulsa **"Ya la corregí, verificar"**.
7. **Re-análisis de esa rama:** si la huella ya no aparece, la incidencia pasa a `resuelta` (verificada) y se atribuye el commit; si sigue, vuelve a `en_correccion` con el aviso "la verificación encontró el problema todavía en la línea N".
8. **Re-análisis programado** diario de las ramas vigiladas, solo si hubo commits nuevos: resuelve, reabre y detecta incidencias nuevas.
9. **Recordatorios** según reglas, **escalamiento** al administrador de lo vencido o lo que lleva 14 días sin atención.
10. **El administrador ve el panel del equipo**: indicadores, tendencia, semáforo por rama y resumen semanal de la IA. **Descarga el informe PDF** del periodo.

---

## 5. Funciones detalladas

### 5.1 Equipos, miembros e invitaciones
- Tarjetas por equipo con puntaje, miembros, repositorios y conteos.
- Invitación: correo, rol y usuario de GitHub (opcional). El código se genera aleatorio (`secrets.token_urlsafe`) y en la base solo se guarda su **hash SHA-256**. Un solo uso, vence en 7 días; se puede reenviar o revocar.
- Tabla de miembros con **"Trabaja en"**: la rama de su último push público, sacada de `GET /users/{github}/events/public` (una llamada por persona; si no hay datos, queda vacío). Además: incidencias asignadas, vencidas y última actividad.
- **Aviso de privacidad** en la invitación: se mostrará su actividad pública de GitHub y recibirá correos; puede bajar la frecuencia.

### 5.2 Tablero de seguimiento
- Columnas: Abiertas · En corrección · En revisión · Resueltas (últimos 30 días).
- Filtros: repositorio, rama, persona, severidad, vencidas.
- Tarjeta: severidad (`.sev`), título, `archivo:línea`, responsable, días para el vencimiento (semáforo).
- Cambio de estado con botones, no arrastrando: más accesible y sin dependencias nuevas.

### 5.3 Detalle de la incidencia
- Código afectado, explicación y recomendación de la IA (reutilizadas por huella).
- Estado, responsable, fecha límite, primer y último análisis en que se vio, veces reabierta.
- Botones según el rol y el estado: "Estoy corrigiendo esto", "Ya la corregí, verificar", "No es una vulnerabilidad…".
- Historial (línea de tiempo) y comentarios.
- **Plantilla de issue de GitHub copiable**: título y cuerpo en Markdown con la explicación y la recomendación, sin código del repositorio. El usuario lo pega donde quiera; Centinela nunca escribe en GitHub.
- Al resolverse: "Corregida en `a1b2c3` por @usuario" con enlace a la comparación en GitHub.

### 5.4 Mi trabajo (colaborador)
- **Plan de hoy:** las 3 incidencias que debería atender primero (orden: vencidas → severidad → fecha límite), con una frase de la IA explicando el orden.
- Lista completa de lo asignado con sus acciones.
- "Disponibles para tomar": incidencias del equipo sin responsable.
- Botón "Re-analizar mi rama".

### 5.5 Ramas y semáforo de fusión
- Por cada rama vigilada distinta de la principal se cruzan las huellas de su último análisis con las del último análisis de `main`:
  - **Nuevas en la rama** (están en la rama y no en main).
  - **Corregidas en la rama** (están en main y no en la rama).
- Semáforo: **No recomendada** si agrega alguna alta; **Con observaciones** si agrega medias o bajas; **Lista** si no agrega nada.
- No requiere análisis extra: solo compara resultados ya guardados.

### 5.6 Verificación y re-análisis
- **Manual:** "Ya la corregí, verificar" o "Re-analizar rama".
- **Programado:** una vez al día a la hora configurada. Antes consulta `GET /repos/{o}/{r}/branches/{rama}`; si el `sha` es el mismo del último análisis, se salta.
- **Cola simple en la base:** los análisis pendientes se procesan **de uno en uno** por un bucle del servicio. Así no se satura Docker y, si el servicio se reinicia, los pendientes no se pierden.
- **Atribución:** `GET /repos/{o}/{r}/compare/{sha_anterior}...{sha_nuevo}` devuelve los commits intermedios y sus autores.

### 5.7 Notificaciones por correo y dentro de la app

**Tipos de correo**

| Correo | A quién | Cuándo |
|---|---|---|
| Invitación | Invitado | Al invitar |
| Nueva asignación | Colaborador | Al asignarle (agrupado si son varias en el mismo análisis) |
| Recordatorio | Colaborador | Según la frecuencia por severidad |
| Verificación | Colaborador | Al confirmar o rechazar su corrección |
| Escalamiento | Administrador | Vencidas o más de 14 días sin atención |
| Resumen semanal | Administrador (y colaboradores, opcional) | Lunes a la hora configurada, redactado por la IA |

**Reglas para no saturar**
- Como máximo **un correo de recordatorio por persona al día**, que agrupa todo lo pendiente.
- Frecuencia por defecto: alta cada 2 días, media cada 7 y baja nunca (solo en el resumen).
- Pausa mientras la incidencia está en corrección y fue actualizada hace menos de 3 días.
- Cada envío se registra en `notificaciones`, para no repetir y para la evaluación.
- Cada persona puede bajar su frecuencia o pasar a "solo resumen semanal".
- **Nunca se envía código:** solo conteos, títulos, `archivo:línea` y un enlace.

**Dentro de la app:** campana en `SiteHeader` con las mismas notificaciones (respaldo si el correo falla).

**Envío:** con la API de **Brevo** (plan gratuito, 300 correos/día), llamada con `httpx`, que ya es dependencia del servicio, desde `app/correo.py`.
- Configuración en `analyzer-service/.env`: `BREVO_API_KEY` y `CORREO_REMITENTE`, un remitente verificado en Brevo. No hace falta tener dominio propio.
- Se descartó Resend porque, sin dominio verificado, solo envía al correo del propio dueño de la cuenta.

**Para la demostración:** botón "Enviar recordatorios ahora" en la pantalla de recordatorios, con vista previa del correo.

### 5.8 Informe PDF

Hay dos informes:

- **Informe del equipo (administrador):**
  1. Portada.
  2. Resumen ejecutivo de la IA.
  3. Indicadores.
  4. Gráfica de tendencia del puntaje.
  5. Las 10 incidencias más graves abiertas.
  6. Tabla por persona: asignadas, resueltas, vencidas y tiempo medio.
  7. Tabla por repositorio y rama con su semáforo.
  8. Lo resuelto en el periodo con su commit.
  9. Lo descartado con su justificación.
- **Informe personal (colaborador):** su plan, lo asignado y lo que resolvió.

**Cómo se genera:** una ruta de la app, `/admin/equipos/:id/informe?desde=&hasta=`, diseñada para impresión (`@media print`), con un botón "Descargar PDF" que llama a `window.print()` → "Guardar como PDF".
- Ventajas: sin librerías nuevas; reutiliza los datos y estilos de las pantallas; la gráfica (SVG) sale nítida.
- Limitación: el PDF lo genera el navegador, por eso no se adjunta en los correos (el correo lleva el enlace).
- Si más adelante hace falta generarlo en el servidor, se puede usar `reportlab`.

### 5.9 IA a nivel de equipo
- **Resumen semanal:** el sistema calcula las cifras (abiertas, resueltas, vencidas, por persona, por rama) y la IA solo las redacta. Se guarda para el informe.
- **Asistente del equipo** (el mismo `ChatAsistente`): el backend arma el contexto con datos agregados del equipo y la IA responde.
  - La IA **no genera SQL** ni consulta la base directamente: así no hay riesgo de que lea datos de otro equipo.
  - Ejemplos: "¿quién tiene más altas vencidas?", "¿qué rama está peor?", "resume lo que corrigió Ana esta semana".
- **Plan de hoy** (5.4): una frase por persona.
- Todo con la misma `generar()` y sus modelos de respaldo. Las cifras salen de la base, nunca de la IA.

### 5.10 Puntaje de seguridad

```
puntaje = max(0, 100 − (10 × altas_abiertas + 4 × medias_abiertas + 1 × bajas_abiertas + 5 × vencidas))
```

- Se calcula por repositorio y rama, y el del equipo es el promedio.
- Se guarda una foto diaria en `metricas_diarias` para dibujar la tendencia.
- La fórmula se muestra en la pantalla (transparencia): es simple a propósito y se puede justificar en la tesis.

### 5.11 Pestaña «Colaboradores»: invitaciones, filtros y carga (solo administrador)

Una sola pestaña une los miembros, su carga y las invitaciones pendientes. Orden de arriba hacia abajo:

1. **«Invitar colaborador»**: correo, rol y usuario de GitHub, en un panel plegable.
   - Una flecha en la esquina lo minimiza a una sola línea y lo vuelve a desplegar.
   - El estado se recuerda por administrador en `localStorage`.
   - Si el equipo aún no tiene miembros, aparece abierto.
2. **Filtros:**
   - búsqueda por nombre, correo o GitHub;
   - rol (colaboradores, observadores, invitaciones pendientes);
   - repositorio y rama;
   - periodo (7, 30 o 90 días);
   - **ordenar por**: más incidencias asignadas, más incidencias en su rama, más altas abiertas, más vencidas, más alertas sin respuesta, más resueltas, menor % en plazo, más días sin actividad o nombre.
3. **Filtros rápidos** (combinables, con su conteo): con vencidas, con altas abiertas, en el límite 3/3, con estancadas, sin actividad 7+ días, sin GitHub vinculado. También «Limpiar filtros» y «Exportar CSV».
4. **Tabla**, agrupada en «Quién es», «Carga actual» y «Rendimiento». Se ordena al hacer clic en el encabezado de cada columna. Incluye al observador, la fila «Sin asignar» y las invitaciones pendientes como filas propias.
5. Al final, los **destacados** (más incidencias, más vencidas, más alertas sin respuesta, más resueltas) y las **sugerencias para equilibrar la carga**.

Los filtros se aplican en el navegador sobre los datos del equipo, que son pocos, y se guardan en la URL (`?orden=vencidas&f=con-vencidas`) para poder compartir la vista.

- **Destacados:** quién tiene más incidencias, más vencidas, más alertas sin respuesta (recordatorios y escalamientos recibidos) y más resueltas.
- **Tabla por persona:** carga por severidad (barra apilada), asignadas, vencidas, en corrección (x/límite), resueltas en 30 días, tiempo medio, % en plazo, reaperturas, alertas en 30 días y última actividad. Se puede ordenar, y cada persona abre el tablero filtrado por ella. Incluye una fila «Sin asignar».
- **Privacidad:** se presenta como balance de carga, no como ranking. Cada colaborador ve solo sus propias métricas.

### 5.12 Reasignación sugerida, límite en corrección y corrección estancada

- **Reasignación sugerida:** si una persona tiene vencidas y otra tiene menos carga y nada vencido, el sistema propone mover una incidencia (la de menor severidad de la persona sobrecargada). La regla es fija, sin IA, y solo se aplica si el administrador la aprueba (queda en `incidencia_eventos`).
- **Límite en corrección:** como máximo 3 incidencias «en corrección» por persona (configurable por equipo). Con el límite alcanzado, «Estoy corrigiendo esto» y «Tomar» quedan deshabilitados con el motivo visible. Se valida en `cambiar_estado`, no solo en la interfaz.
- **Corrección estancada:** si una incidencia sigue en corrección sin eventos durante 5 días, se avisa a la persona («¿sigues o la liberas?»); a los 8 días, al administrador. Mientras está estancada no aplica la pausa de recordatorios, para que «Estoy corrigiendo» no se use para silenciarlos.
- **Columnas nuevas en `equipos`:** `limite_en_correccion` (3), `dias_estancada` (5), `dias_estancada_admin` (8).

---

## 6. Modelo de datos

Todo va en `database/migracion_002_equipos.sql` (y siguientes), idempotente cuando sea posible.

### Cambios a lo existente
- `repositorios`: + `equipo_id uuid null references equipos`. Un repositorio de equipo lo crea el administrador; los análisis personales siguen igual.
- `analisis`: + `rama text`, `rama_vigilada_id uuid null`. `commit_sha` ya existe.
- `hallazgos`: + `huella text`, `incidencia_id uuid null`.
- `estado_hallazgo`: + valor `en_correccion` (`alter type ... add value if not exists`, en un paso propio porque no puede usarse en la misma transacción). `hallazgos.estado` deja de usarse: el estado vive en `incidencias`.

### Tablas nuevas

| Tabla | Columnas principales |
|---|---|
| `equipos` | id, nombre, descripcion, creado_por, creado_en, hora_analisis, hora_recordatorios, frecuencia_alta_dias, frecuencia_media_dias, dias_escalamiento |
| `miembros_equipo` | equipo_id, usuario_id, rol (`colaborador`/`observador`), github_usuario, frecuencia_correo, unido_en · PK (equipo_id, usuario_id) |
| `invitaciones` | id, equipo_id, correo, rol, github_usuario, codigo_hash, vence_en, aceptada_en, revocada, creada_por |
| `ramas_vigiladas` | id, repositorio_id, rama, es_principal, ultimo_sha, ultimo_analisis_id, analisis_programado |
| `incidencias` | id, repositorio_id, rama, huella, regla_id, archivo, linea_actual, titulo, severidad, explicacion_ia, recomendacion_ia, estado, motivo_cierre, asignado_a, fecha_limite, descarte_solicitado, motivo_descarte, veces_reabierta, primer_analisis_id, ultimo_analisis_id, resuelta_en, commit_correccion, corregida_por_github · UNIQUE (repositorio_id, rama, huella) |
| `incidencia_eventos` | id, incidencia_id, actor_id (null = sistema), tipo, estado_anterior, estado_nuevo, nota, creado_en |
| `comentarios` | id, incidencia_id, autor_id, texto, creado_en |
| `notificaciones` | id, usuario_id, equipo_id, tipo, canal (`correo`/`app`), asunto, enlace, leida, enviada_en, resultado |
| `metricas_diarias` | equipo_id, repositorio_id, rama, fecha, abiertas_alta, abiertas_media, abiertas_baja, vencidas, resueltas, puntaje |
| `resumenes_ia` | id, equipo_id, desde, hasta, texto, modelo, creado_en |

Fechas límite por defecto: alta 7 días, media 30 y baja 90. Configurable por equipo en una fase posterior.

### Seguridad (RLS)
- **Funciones `security definer`:** `es_miembro(equipo_id)` y `es_admin()`. Evitan el error de *recursión infinita* al consultar `miembros_equipo` desde sus propias políticas.
- **Lectura:**
  - `equipos`, `incidencias`, eventos y comentarios: el administrador, o un miembro del equipo.
  - `analisis` y `hallazgos`: la política actual (dueño) **o** el repositorio pertenece a un equipo del que es miembro.
- **Escritura:**
  - Los cambios de estado **no** se hacen con `update` directo desde el navegador, porque RLS filtra filas, no columnas. Pasan por la función `cambiar_estado(incidencia_id, accion, nota)` en Postgres, que valida rol, asignación y transición permitida y escribe en `incidencia_eventos` en la misma transacción.
  - Igual para `tomar_incidencia`, `asignar` (solo admin) y `resolver_descarte` (solo admin).
- **Comentarios:** insertar si `es_miembro`.
- **FastAPI** usa la clave secreta, que se salta RLS: cada endpoint nuevo comprueba los permisos a mano, como ya hace `/chat`.
- **Invitaciones:** solo el administrador las lee; aceptar una pasa por un endpoint que compara el hash.

---

## 7. Backend (FastAPI)

### Endpoints nuevos

| Endpoint | Quién | Qué hace |
|---|---|---|
| `POST /equipos/{id}/invitaciones` | Admin | Crea el código, guarda el hash y envía el correo. |
| `POST /invitaciones/aceptar` | Usuario con sesión | Valida el código (hash, vigencia, un uso, correo coincidente) y crea el miembro. |
| `POST /equipos/{id}/repositorios` | Admin | Valida repo y ramas en GitHub; crea el repositorio y las `ramas_vigiladas`. |
| `POST /ramas/{id}/analizar` | Admin o miembro colaborador | Encola un análisis de esa rama. |
| `POST /incidencias/{id}/verificar` | Asignado | Cambia a `en_revision` y encola el re-análisis de su rama. |
| `POST /equipos/{id}/recordatorios/ejecutar` | Admin | Ejecuta los recordatorios ahora (demo). |
| `POST /equipos/{id}/resumen` | Admin | Genera el resumen semanal con la IA. |
| `POST /equipos/{id}/chat` | Miembros | Asistente del equipo. |

Los cambios de estado, la asignación y los comentarios van directo a Supabase mediante las funciones de la sección 6.

### Archivos nuevos o cambiados
- `app/huella.py`: cálculo de la huella (con pruebas).
- `app/incidencias.py`: conciliar hallazgos ↔ incidencias tras un análisis (crear, vincular, resolver, reabrir), atribución y asignación sugerida.
- `app/notificaciones.py`: reglas, plantillas de correo (texto y HTML simple) y envío con `app/correo.py` (Brevo).
- `app/planificador.py`: un bucle `asyncio` iniciado en `ciclo_de_vida` que cada minuto toma el siguiente análisis pendiente de la cola, cada hora revisa ramas programadas y recordatorios, y guarda `metricas_diarias`.
- `github_service.py`: + `validar_rama`, `ultimo_sha`, `comparar`, `autor_ultimo_commit`, `rama_actual_de`.
- `pipeline.py`: recibe la rama; al terminar llama a `incidencias.conciliar`. La IA solo se pide para las huellas sin explicación.
- `main.py`: la regla "un análisis activo por usuario" sigue para los análisis personales; los de equipo van a la cola.

### Conciliación tras cada análisis (el corazón)

```
para cada hallazgo del análisis:
    calcular huella
    si existe incidencia (repo, rama, huella):
        vincular; actualizar ultimo_analisis y linea_actual
        si estaba resuelta → reabrir (+1 veces_reabierta, evento, notificar)
        si estaba en_revision → sigue: volver a en_correccion (verificación fallida)
    si no:
        crear incidencia abierta; copiar explicación IA si la huella existe en otra rama
        sugerir responsable; fecha límite por severidad
para cada incidencia abierta / en_correccion / en_revision de esa rama no vista:
    resolver; motivo = verificada si el archivo existe, si no archivo_eliminado
    atribuir commit con compare(sha_anterior, sha_nuevo)
```

---

## 8. Pantallas y rutas

| Ruta | Pantalla |
|---|---|
| `/admin/equipos` | Equipos: tarjetas con puntaje, miembros, repos y conteos; botón "Nuevo equipo". |
| `/admin/equipos/:id` | Pestañas: **Resumen** (4 indicadores, tendencia, resumen IA, repos y ramas con semáforo) · **Seguimiento** (tablero) · **Colaboradores** (invitar, filtros, miembros con su carga, pendientes, destacados y sugerencias) · **Recordatorios** (reglas, vista previa, registro de envíos, "Enviar ahora") · **Asistente** (chat del equipo). |
| `/admin/equipos/:id/informe` | Informe imprimible / PDF. |
| `/incidencias/:id` | Detalle de la incidencia (admin y miembros, con acciones según rol). |
| `/mi-trabajo` | Plan de hoy, asignadas, disponibles, "Re-analizar mi rama", informe personal. |
| `/invitacion/:codigo` | Aceptar invitación (con aviso de privacidad). |
| Campana en `SiteHeader` | Notificaciones dentro de la app. |

Se reutilizan `global.css`, `.sev`, `.btn-primario`, `HallazgoDetalle`, `ChatAsistente` y `AdminLayout`. La gráfica de tendencia es un componente SVG propio, pequeño y sin librerías (`recharts` se eliminó del proyecto).

---

## 9. Fases de implementación (con criterio de terminado)

Cada fase se planea, se implementa, se prueba y se confirma antes de pasar a la siguiente. Al cerrar cada una se actualiza `CLAUDE.md`.

| Fase | Contenido | Terminado cuando… |
|---|---|---|
| **1. Equipos y acceso** | Migración (equipos, miembros, invitaciones, `repositorios.equipo_id`, funciones RLS), invitaciones por correo, pantallas Equipos y Miembros, `/invitacion/:codigo`. | Un admin crea un equipo, invita a un correo, la persona se registra con el enlace y ve el equipo; otra cuenta no lo ve. |
| **2. Incidencias** | Huella (con pruebas), ramas vigiladas, cola de análisis, conciliación, tablero, detalle, historial, comentarios, `cambiar_estado`, Mi trabajo, asignación sugerida. | Analizar dos veces la misma rama no duplica incidencias; un colaborador solo puede mover lo suyo; el historial lo registra todo. |
| **3. Verificación y panel** | "Ya la corregí, verificar", resolución y reapertura automáticas, atribución por commit, análisis programado por sha, semáforo de fusión, puntaje, `metricas_diarias`, pestaña Resumen. | En un repo de prueba propio: se corrige y se hace push → verificar → la incidencia queda resuelta con el commit; se reintroduce → se reabre. |
| **4. Notificaciones** | Brevo, plantillas, reglas, recordatorios agrupados, escalamiento, campana, pestaña Recordatorios, "Enviar ahora". | Un colaborador recibe un único correo agrupado; no se repite el mismo día; no contiene código. |
| **5. IA de equipo e informes** | Resumen semanal, asistente del equipo, plan de hoy, informe PDF del equipo y personal, plantilla de issue copiable. | El admin descarga el PDF del mes con resumen de la IA y cifras que coinciden con el panel. |

**Mínimo defendible:** fases 1, 2 y 3, más el botón de recordatorios de la fase 4 y el informe PDF de la fase 5 (ambos son baratos y muy visibles en la exposición).

---

## 10. Guion de demostración

1. Subir a GitHub (público) un repo de prueba con vulnerabilidades sembradas, con dos ramas: `main` y `feature/login`.
2. El admin crea el equipo "Equipo demo", vincula el repo con ambas ramas e invita al compañero.
3. El compañero acepta, y el análisis asigna sus incidencias con la sugerencia automática.
4. Mostrar el correo recibido y el semáforo: `feature/login` "No recomendada" (agrega una alta).
5. El compañero corrige en vivo, hace push y pulsa "Ya la corregí" → resuelta, "corregida en `abc123` por @compañero".
6. Reintroducir el error → se reabre sola.
7. Preguntar al asistente: "¿quién tiene más altas abiertas?".
8. Descargar el informe PDF.

---

## 11. Evaluación para la tesis

| Métrica | Cómo se mide |
|---|---|
| Tiempo medio de corrección (MTTR) | `resuelta_en − creada`, por severidad. |
| % resuelto dentro del plazo | Resueltas antes de `fecha_limite` / total resueltas. |
| Tasa de reapertura | Incidencias con `veces_reabierta > 0` / resueltas. |
| Precisión de la verificación | Revisión manual de una muestra: ¿las marcadas como `verificada` estaban corregidas de verdad? |
| Ahorro de IA | Peticiones evitadas por reutilizar la huella / total de hallazgos re-analizados. |
| Efecto de los recordatorios | Experimento: equipos o semanas con y sin recordatorios, comparando el MTTR. |
| Usabilidad | Prueba con 3 a 5 personas (SUS) en el guion de la sección 10. |

---

## 12. Límites y decisiones que se mantienen

- Solo repositorios públicos. Centinela **nunca escribe en GitHub**: ni PRs, ni issues, ni correcciones automáticas.
- Sin webhooks: los cambios se detectan al re-analizar (manual o programado). Los webhooks quedan como mejora futura.
- `GITHUB_TOKEN` sin permisos (5000 consultas por hora). Las consultas a GitHub se hacen solo cuando hacen falta.
- La IA solo explica, redacta y orienta. Las cifras salen de la base.
- Se tratan datos personales (correo y actividad pública de GitHub): aviso al aceptar la invitación y opción de bajar la frecuencia de los correos.
- Esta ampliación la pidió la tutora: hay que justificarla en el documento del estudio de caso (alcance, objetivos y arquitectura) y actualizar `CLAUDE.md`.
