# Centinela — vuln-ai

Sistema web para el análisis de seguridad de repositorios de GitHub mediante análisis estático (SAST) e inteligencia artificial (LLM).

## 1. Requisitos previos

Antes de comenzar, instala:

- Git.
- Node.js y npm.
- Un navegador web.
- Acceso al proyecto de Supabase utilizado por Centinela, si necesitas consultar o administrar su configuración.

## 2. Clonar el repositorio

Abre una terminal y ejecuta:

```bash
git clone https://github.com/NaigelENZ24/vuln-ai.git
cd vuln-ai
```

## 3. Configurar las variables de entorno

El frontend utiliza las siguientes variables de entorno para conectarse con Supabase:

```env
VITE_SUPABASE_URL=TU_URL_DE_SUPABASE
VITE_SUPABASE_ANON_KEY=TU_CLAVE_PUBLICA_DE_SUPABASE
```

Crea el archivo `.env` dentro de la carpeta `frontend`:

```text
vuln-ai/
└── frontend/
    └── .env
```

Si ya tienes un archivo `.env` configurado localmente, conserva su contenido y no lo sobrescribas.

Si no tienes las credenciales, solicítalas al responsable del proyecto. No publiques claves secretas ni contraseñas en GitHub.

**Importante:** la URL y la clave pública de Supabase no sustituyen los permisos de la base de datos. El acceso debe estar protegido mediante las políticas de seguridad correspondientes.

## 4. Instalar las dependencias

Entra en la carpeta del frontend:

```bash
cd frontend
```

Instala las dependencias:

```bash
npm install
```

Este comando instala los paquetes definidos en `frontend/package.json`, incluidos React, Vite, React Router y el cliente de Supabase.

## 5. Ejecutar el frontend

Inicia el servidor de desarrollo:

```bash
npm run dev
```

La terminal mostrará una dirección local, normalmente:

```text
http://localhost:5173
```

Abre esa dirección en el navegador.

Mantén la terminal abierta mientras trabajas en el proyecto. Para detener el servidor, pulsa `Ctrl + C`.

## 6. Otros comandos disponibles

Todos estos comandos deben ejecutarse desde la carpeta `frontend`.

### Generar la compilación de producción

```bash
npm run build
```

### Previsualizar la compilación

```bash
npm run preview
```

### Instalar nuevamente las dependencias

```bash
npm install
```

## 7. Base de datos

La base de datos de Centinela está alojada en Supabase.

El esquema SQL se encuentra en:

```text
database/schema.sql
```

**Para trabajar con la base de datos existente, no ejecutes nuevamente el esquema sin verificar primero su contenido y el estado de la base de datos.** La creación inicial ya fue realizada por el responsable del proyecto.

Si necesitas configurar una base de datos diferente, solicita instrucciones antes de ejecutar migraciones o modificar tablas.

## 8. Estructura general

```text
vuln-ai/
├── database/
│   └── schema.sql
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   ├── services/
│   │   ├── styles/
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── .gitignore
└── README.md
```

## 9. Estado funcional conocido

La interfaz del proyecto permite introducir una URL de GitHub y presenta la propuesta de análisis de vulnerabilidades mediante SAST y LLM.

La implementación del flujo completo de análisis debe verificarse por separado. La presencia de la interfaz y del esquema de base de datos no garantiza que el backend, Bandit y el proveedor de IA estén integrados y funcionando.

## 10. Solución de problemas

### Error: `npm` no se reconoce

Comprueba que Node.js y npm estén instalados:

```bash
node --version
npm --version
```

### Error al instalar dependencias

Verifica que estés en la carpeta `frontend`:

```bash
cd frontend
npm install
```

### Error de conexión con Supabase

Comprueba que `frontend/.env` exista y contenga los nombres correctos de las variables. Después, detén y vuelve a iniciar el servidor:

```bash
npm run dev
```

### El proyecto no inicia

Comprueba los mensajes de error de la terminal, la versión de Node.js y que la instalación de dependencias haya finalizado correctamente.

## 11. Seguridad al trabajar en equipo

- No compartas archivos `.env` mediante commits.
- No publiques contraseñas ni claves privadas.
- No uses la clave `service_role` en el frontend.
- Cada desarrollador debe configurar sus variables de entorno localmente.
- No modifiques la base de datos compartida sin coordinarlo con el responsable del proyecto.

## 12. Resumen de instalación

Una vez configurado el archivo `frontend/.env`, los comandos para instalar y ejecutar el frontend son:

```bash
git clone https://github.com/NaigelENZ24/vuln-ai.git
cd vuln-ai
cd frontend
npm install
npm run dev
```

Abre en el navegador la dirección que muestre Vite.

---

**Proyecto:** Centinela — vuln-ai  
**Repositorio:** https://github.com/NaigelENZ24/vuln-ai
