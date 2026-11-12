# Centinela — vuln-ai

Aplicación web que analiza la seguridad de repositorios públicos de GitHub. Los analizadores estáticos **Bandit** (Python y Django) y **Semgrep** (JavaScript, TypeScript, React y Django) detectan las vulnerabilidades dentro de Docker, y una IA (Gemini o Claude) las explica, las prioriza y responde preguntas en un chat. La IA solo explica y orienta: nunca modifica el código analizado.

El sistema tiene tres piezas, y **las tres deben estar funcionando**:

| Pieza | Qué hace | Dónde corre |
|---|---|---|
| Frontend (React + Vite) | La página web | Tu PC, `http://localhost:5173` |
| Servicio de análisis (FastAPI) | Clona el repo, lanza los analizadores, llama a la IA y atiende el chat | Tu PC, `http://localhost:8000` |
| Imagen de Docker `vuln-scanner` | Ejecuta Bandit y Semgrep aislados (sin red y en solo lectura) | Docker Desktop |

La base de datos y los usuarios están en **Supabase** (en la nube) y la comparte todo el equipo.

> Las instrucciones son para **Windows con PowerShell**. Los comandos se escriben en orden y desde la carpeta que se indica en cada paso.

---

## 1. Programas que necesitas

Instala esto antes de empezar. Al final de cada línea está el comando para comprobar que quedó instalado.

| Programa | Para qué | Comprobar |
|---|---|---|
| [Git](https://git-scm.com/download/win) | Descargar el código | `git --version` |
| [Node.js](https://nodejs.org) (versión LTS) | El frontend | `node --version` |
| [Python 3.12 o superior](https://www.python.org/downloads/) (marca **"Add python.exe to PATH"** al instalar) | El servicio de análisis | `python --version` |
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | Los analizadores | `docker --version` |

Docker Desktop **debe estar abierto** (el icono de la ballena en la barra de tareas) cada vez que uses el sistema.

---

## 2. Descargar el código de la rama `servicio-analisis-ia`

El sistema completo (servicio de análisis, IA, panel de administración, "Mis análisis") está en la rama **`servicio-analisis-ia`**.

**Si ya tienes el repositorio clonado:**

```powershell
cd ruta\a\vuln-ai
git status
```

Si `git status` muestra cambios tuyos sin guardar, haz commit de ellos o guárdalos con `git stash` antes de seguir. Después:

```powershell
git fetch origin
git checkout servicio-analisis-ia
git pull
```

**Si no lo tienes todavía:**

```powershell
git clone https://github.com/NaigelENZ24/vuln-ai.git
cd vuln-ai
git checkout servicio-analisis-ia
```

Comprueba que estás en la rama correcta: `git branch` debe marcar `* servicio-analisis-ia`.

---

## 3. Crear los archivos de claves (`.env`)

Las claves **no están en GitHub** (por seguridad, git ignora los archivos `.env`). El responsable del proyecto te pasará por privado un archivo de texto con las claves y el contenido exacto de estos dos archivos.

Necesitas crear **dos** archivos llamados exactamente `.env` (sin nombre antes del punto y sin `.txt` al final):

```text
vuln-ai/
├── frontend/
│   └── .env                 ← claves del frontend
└── analyzer-service/
    └── .env                 ← claves del servicio de análisis
```

La forma más fácil es copiar las plantillas que sí están en el repositorio y luego pegar dentro el contenido que te pasaron:

```powershell
copy frontend\.env.example frontend\.env
copy analyzer-service\.env.example analyzer-service\.env
notepad frontend\.env
notepad analyzer-service\.env
```

Reemplaza todo el contenido de cada archivo por el del archivo de claves y guarda.

**`frontend/.env`** debe tener 3 líneas:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_API_URL=http://localhost:8000
```

**`analyzer-service/.env`** debe tener estas variables:

```env
SUPABASE_URL=...
SUPABASE_SERVICE_KEY=...          # clave secreta (sb_secret_...)
LLM_PROVIDER=gemini
LLM_API_KEY=...                   # clave de Gemini
LLM_MODEL=gemini-3.5-flash,gemini-3.5-flash-lite,gemini-3.1-flash-lite
ALLOWED_ORIGIN=http://localhost:5173
GITHUB_TOKEN=
```

Importante:

- La clave **secreta** (`SUPABASE_SERVICE_KEY`) va **solo** en `analyzer-service/.env`. Nunca en `frontend/.env`.
- Si el Bloc de notas guarda el archivo como `.env.txt`, renómbralo. Para comprobarlo: `dir frontend\.env` y `dir analyzer-service\.env` deben encontrar el archivo.
- `GITHUB_TOKEN` es opcional. Sin él, GitHub permite unas 60 consultas por hora (cada análisis usa 2). Si se te acaban, crea un token en GitHub → *Settings* → *Developer settings* → *Personal access tokens*, sin marcar ningún permiso, y pégalo ahí.

---

## 4. Preparar el servicio de análisis (solo la primera vez)

Desde la carpeta raíz `vuln-ai`:

```powershell
cd analyzer-service
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
cd ..
```

Cuando el entorno está activado, la terminal muestra `(.venv)` al principio de la línea.

Si `Activate.ps1` da un error de "ejecución de scripts deshabilitada", ejecuta esto una vez y vuelve a intentarlo:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

Si `pip install` falla con errores de archivos bloqueados (pasa cuando la carpeta está dentro de OneDrive), crea el entorno fuera:

```powershell
python -m venv C:\venvs\centinela
C:\venvs\centinela\Scripts\Activate.ps1
pip install -r requirements.txt
```

y usa ese `Activate.ps1` en lugar de `.venv\Scripts\Activate.ps1` en los pasos siguientes.

Comprobación (opcional): con el entorno activado y desde `analyzer-service`, `python -m unittest discover tests` debe terminar en `OK`.

---

## 5. Construir la imagen de Docker (solo la primera vez)

Con **Docker Desktop abierto**, desde la carpeta raíz `vuln-ai`:

```powershell
docker build -f sandbox/Dockerfile.scanner -t vuln-scanner sandbox
```

Tarda unos minutos y necesita internet (descarga Bandit, Semgrep y sus reglas). Al terminar, comprueba:

```powershell
docker run --rm vuln-scanner bandit --version
```

Debe mostrar `bandit 1.8.6`.

Hay que repetir este paso solo si cambia `sandbox/Dockerfile.scanner` o `sandbox/reglas-centinela.yml`.

---

## 6. Instalar el frontend (primera vez y cada vez que cambie `package.json`)

```powershell
cd frontend
npm install
cd ..
```

---

## 7. Arrancar el sistema (cada vez que lo uses)

Necesitas **dos terminales abiertas** al mismo tiempo, y Docker Desktop abierto.

**Terminal 1 — servicio de análisis:**

```powershell
cd ruta\a\vuln-ai\analyzer-service
.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --port 8000
```

Debe terminar mostrando `Application startup complete`. Para comprobarlo, abre http://localhost:8000/health en el navegador: debe responder `{"ok":true}`.

**Terminal 2 — frontend:**

```powershell
cd ruta\a\vuln-ai\frontend
npm run dev
```

Abre **http://localhost:5173** en el navegador.

No cierres ninguna de las dos terminales mientras uses la aplicación. Para detenerlas, `Ctrl + C` en cada una.

---

## 8. Tener acceso al panel de administración

Al registrarse, todo usuario es "desarrollador". El panel `/admin` solo lo ve quien tiene el rol **administrador**, y ese rol solo se puede asignar desde Supabase (los usuarios no pueden cambiárselo):

1. Regístrate en la aplicación (http://localhost:5173 → *Registrarse*) si aún no tienes cuenta.
2. Alguien con acceso a Supabase abre **SQL Editor → New query**, pega esto con tu correo y pulsa **Run**:

   ```sql
   update perfiles set rol = 'administrador' where correo = 'tu_correo@ejemplo.com';
   ```

3. **Cierra sesión y vuelve a entrar.** Ya aparece el botón *Panel admin* en la cabecera.

No hace falta ejecutar ningún otro SQL: la base compartida ya tiene el esquema y la migración aplicados.

---

## 9. Probar que todo funciona

1. Inicia sesión.
2. En la página principal pega `https://github.com/adeyosemanputra/pygoat` y pulsa *Analizar repositorio*.
3. La página muestra "Pendiente…" y después "En proceso…". Se actualiza sola. Tarda de 1 a 3 minutos.
4. Al terminar verás el riesgo global, el resumen de la IA y la lista de hallazgos. Haz clic en uno para ver su explicación.
5. Pregunta algo en el chat de la derecha, por ejemplo *¿Qué debería corregir primero?*
6. En la cabecera, *Mis análisis* muestra tus análisis anteriores.
7. Si eres administrador, *Panel admin* muestra los análisis de todos los usuarios.

Otros repositorios para probar: `OWASP/NodeGoat` (JavaScript), `fportantier/vulpy` (Flask), `alan2207/bulletproof-react` (React).

---

## 10. Solución de problemas

| Lo que ves | Causa y solución |
|---|---|
| "No se pudo conectar con el servicio de análisis" | La terminal 1 no está corriendo, o `VITE_API_URL` no es `http://localhost:8000`. Arranca el servicio. Si cambiaste `frontend/.env`, reinicia también `npm run dev` (Vite lee el `.env` solo al arrancar). |
| El servicio no arranca: `Falta la variable ... en analyzer-service/.env` | Falta esa línea en `analyzer-service/.env` o el archivo se llama `.env.txt`. |
| El análisis termina en "Error durante el análisis: Bandit no devolvió un resultado válido" | Docker Desktop está cerrado o no construiste la imagen (paso 5). |
| "Falta git o Docker en el servidor de análisis" | Git o Docker no están instalados o no están en el PATH. Cierra y vuelve a abrir la terminal después de instalarlos. |
| "GitHub no respondió correctamente (puede ser el límite de consultas)" | Se acabaron las 60 consultas por hora. Espera una hora o pon un `GITHUB_TOKEN` (paso 3) y reinicia el servicio. |
| El análisis termina, pero dice "La IA no pudo generar la interpretación" | Se agotó la cuota gratuita diaria de Gemini (20 peticiones por modelo y día) o la clave es incorrecta. Los hallazgos se guardan igual. Mira el error en la terminal 1. |
| "El repositorio no contiene código Python, JavaScript ni TypeScript" | Ese repositorio está en otro lenguaje (PHP, Java…). No se puede analizar. |
| "Ya tienes un análisis en curso" | Solo se permite un análisis a la vez por usuario. Espera a que termine. |
| No aparece *Panel admin* | Tu usuario no tiene el rol administrador, o no cerraste sesión después de asignarlo (paso 8). |
| Página en blanco con "Invalid hook call" | Instalaste paquetes en la carpeta raíz. Borra `node_modules` y `package-lock.json` de la raíz (no los de `frontend`) y vuelve a ejecutar `npm install` dentro de `frontend`. |
| Error del puerto 8000 "address already in use" | Otro programa usa el puerto. Ciérralo, o arranca el servicio con `--port 8001` y cambia `VITE_API_URL=http://localhost:8001` en `frontend/.env`. |

---

## 11. Estructura del proyecto

```text
vuln-ai/
├── analyzer-service/          Servicio de análisis (Python + FastAPI)
│   ├── app/
│   │   ├── main.py            Rutas: POST /analyses, POST /chat, GET /health
│   │   ├── auth.py            Valida la sesión de Supabase
│   │   ├── github_service.py  Comprueba el repo en la API de GitHub
│   │   ├── pipeline.py        Clona, escanea, llama a la IA y guarda
│   │   ├── scanner.py         Ejecuta Bandit y Semgrep en Docker
│   │   ├── llm_service.py     Llamadas a la IA (Gemini o Claude)
│   │   ├── config.py, db.py   Configuración y cliente de Supabase
│   ├── tests/                 Pruebas (python -m unittest discover tests)
│   ├── requirements.txt
│   └── .env.example           Plantilla de claves
├── sandbox/
│   ├── Dockerfile.scanner     Imagen vuln-scanner (Bandit + Semgrep)
│   └── reglas-centinela.yml   Reglas propias de Semgrep
├── database/
│   ├── schema.sql             Esquema de la base (ya aplicado)
│   └── migracion_001_analisis.sql  (ya aplicada)
├── frontend/                  Aplicación web (React + Vite)
│   ├── src/pages/             Landing, Login, Registro, Analisis, MisAnalisis, AdminDashboard, AdminAnalisisDetalle
│   ├── src/components/        Cabecera, chat, lista y detalle de hallazgos, rutas protegidas…
│   ├── src/services/          Supabase, servicio de análisis, administración
│   └── .env.example           Plantilla de claves
├── CLAUDE.md                  Notas técnicas del proyecto
└── README.md
```

---

## 12. Seguridad al trabajar en equipo

- Nunca hagas commit de un archivo `.env` (git ya los ignora; no lo fuerces con `git add -f`).
- La clave secreta de Supabase da acceso total a la base: no la pegues en grupos, chats públicos, capturas ni en el código.
- El archivo de claves que te pasaron no debe quedar dentro de la carpeta del repositorio. Cuando hayas creado tus `.env`, bórralo.
- No modifiques la base de datos compartida (tablas, políticas, datos de otros) sin coordinarlo con el equipo.

---

## 13. Resumen rápido

Primera vez (después de crear los dos `.env`):

```powershell
git fetch origin
git checkout servicio-analisis-ia
cd analyzer-service; python -m venv .venv; .venv\Scripts\Activate.ps1; pip install -r requirements.txt; cd ..
docker build -f sandbox/Dockerfile.scanner -t vuln-scanner sandbox
cd frontend; npm install; cd ..
```

Cada vez (dos terminales, Docker Desktop abierto):

```powershell
cd analyzer-service; .venv\Scripts\Activate.ps1; uvicorn app.main:app --reload --port 8000
cd frontend; npm run dev
```

---

**Proyecto:** Centinela — vuln-ai
**Repositorio:** https://github.com/NaigelENZ24/vuln-ai
