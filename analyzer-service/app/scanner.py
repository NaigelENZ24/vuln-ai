import json
import os
import re
import subprocess
from functools import cache

IMAGEN = "vuln-scanner"
# Aislamiento del contenedor: sin red, solo lectura, sin privilegios y con límites de recursos.
AISLAMIENTO = [
    "--network", "none",
    "--read-only", "--tmpfs", "/tmp", "-e", "HOME=/tmp",
    "--memory", "1g", "--cpus", "1", "--pids-limit", "256",
    "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
]
NIVELES = {"HIGH": "alto", "MEDIUM": "medio", "LOW": "bajo"}
NIVELES_SEMGREP = {"ERROR": "alto", "WARNING": "medio", "INFO": "bajo"}
PUNTOS = {"alto": 2, "medio": 1, "bajo": 0}
# Grupos de reglas de Bandit según el prefijo del id (B1xx, B2xx, ...).
CATEGORIAS = {
    "B1": "Prácticas inseguras",
    "B2": "Configuración",
    "B3": "Llamadas peligrosas",
    "B4": "Importaciones peligrosas",
    "B5": "Criptografía",
    "B6": "Inyección",
    "B7": "XSS y plantillas",
}


PATRON_SCRIPT = re.compile(r"<script\b(?![^>]*\bsrc\s*=)[^>]*>(.*?)</script>", re.S | re.I)
EXTENSIONES_HTML = (".html", ".htm")


def _docker(montajes, *comando):
    """montajes: {carpeta del contenedor: carpeta local}, siempre de solo lectura."""
    opciones = []
    for destino, origen in montajes.items():
        opciones += ["--mount", f"type=bind,source={origen},target={destino},readonly"]
    return subprocess.run(
        ["docker", "run", "--rm", *AISLAMIENTO, *opciones, IMAGEN, *comando],
        capture_output=True, text=True, encoding="utf-8", timeout=600,
    )


IGNORADAS = (".git", "node_modules", "build", "dist", "vendor", "test", "tests", "htmlcov", "__pycache__")


def extraer_scripts(ruta, destino):
    """Copia el JS de los <script> de cada .html a un .js aparte para que Semgrep lo analice.
    Rellena con líneas vacías para que los números de línea coincidan con el .html original.
    Salta las mismas carpetas que Semgrep ignora (código generado, de terceros o de pruebas)."""
    for carpeta, subcarpetas, archivos in os.walk(ruta):
        subcarpetas[:] = [d for d in subcarpetas if d not in IGNORADAS]
        _extraer_de(ruta, destino, carpeta, archivos)


def _extraer_de(ruta, destino, carpeta, archivos):
    for nombre in archivos:
        if not nombre.lower().endswith(EXTENSIONES_HTML):
            continue
        origen = os.path.join(carpeta, nombre)
        with open(origen, encoding="utf-8", errors="ignore") as f:
            texto = f.read()
        bloques = list(PATRON_SCRIPT.finditer(texto))
        if not bloques:
            continue
        lineas = [""] * (texto.count("\n") + 1)
        for bloque in bloques:
            inicio = texto.count("\n", 0, bloque.start(1))
            for i, linea in enumerate(bloque.group(1).split("\n")):
                lineas[inicio + i] = linea
        salida = os.path.join(destino, os.path.relpath(origen, ruta) + ".js")
        os.makedirs(os.path.dirname(salida), exist_ok=True)
        with open(salida, "w", encoding="utf-8") as f:
            f.write("\n".join(lineas))


def _relativo(ruta_contenedor):
    """Ruta del hallazgo dentro del repo. Los scripts extraídos apuntan a su .html original."""
    if ruta_contenedor.startswith("/inline/"):
        return ruta_contenedor.removeprefix("/inline/").removesuffix(".js")
    return ruta_contenedor.removeprefix("/code/")


def _leer_json(salida, herramienta):
    try:
        return json.loads(salida.stdout)
    except json.JSONDecodeError:
        raise RuntimeError(f"{herramienta} no devolvió un resultado válido: {salida.stderr[-300:]}")


def ejecutar_bandit(ruta):
    """Python (incluye las reglas de Bandit para Django)."""
    return _leer_json(_docker({"/code": ruta}, "bandit", "-r", "/code", "-f", "json", "-q"), "Bandit")


def ejecutar_semgrep(ruta, scripts):
    """JavaScript, TypeScript, React y Django (reglas oficiales + reglas propias en la imagen).
    scripts: carpeta con el JS extraído de los .html (ver extraer_scripts)."""
    comando = ["semgrep", "scan", "--config", "/reglas", "--json", "--metrics=off", "--disable-version-check", "--quiet", "/code", "/inline"]
    return _leer_json(_docker({"/code": ruta, "/inline": scripts}, *comando), "Semgrep")


@cache
def versiones():
    salida = subprocess.run(
        # La huella de /reglas cambia si se reconstruye la imagen con otras reglas oficiales o propias.
        ["docker", "run", "--rm", IMAGEN, "sh", "-c",
         'echo "$(bandit --version | head -1), semgrep $(semgrep --version), reglas $(cat /reglas/* | sha256sum | cut -c1-8)"'],
        capture_output=True, text=True, timeout=60,
    )
    return salida.stdout.strip() or None if salida.returncode == 0 else None


def prioridad(severidad, confianza):
    """Prioridad inicial del sistema: combina severidad y confianza. La IA puede ajustarla."""
    puntos = PUNTOS[severidad] + PUNTOS[confianza]
    return "alto" if puntos >= 3 else "medio" if puntos >= 2 else "bajo"


def a_hallazgo(resultado):
    """Convierte un resultado de Bandit en una fila de la tabla hallazgos (sin analisis_id)."""
    severidad = NIVELES.get(resultado.get("issue_severity"), "bajo")
    confianza = NIVELES.get(resultado.get("issue_confidence"), "bajo")
    cwe = (resultado.get("issue_cwe") or {}).get("id")
    regla = resultado.get("test_id", "")
    return {
        "regla_id": regla,
        "titulo": resultado.get("issue_text"),
        "categoria": CATEGORIAS.get(regla[:2], "Otros"),
        "cwe_id": f"CWE-{cwe}" if cwe else None,
        "archivo": resultado.get("filename", "").removeprefix("/code/"),
        "linea": resultado.get("line_number"),
        "fragmento_codigo": resultado.get("code"),
        "severidad": severidad,
        "confianza": confianza,
        "prioridad": prioridad(severidad, confianza),
    }


def a_hallazgo_semgrep(resultado, ruta):
    """Convierte un resultado de Semgrep en una fila de la tabla hallazgos (sin analisis_id)."""
    extra = resultado.get("extra", {})
    meta = extra.get("metadata", {})
    severidad = NIVELES_SEMGREP.get(extra.get("severity"), "bajo")
    confianza = NIVELES.get(meta.get("confidence"), "medio")
    cwe = meta.get("cwe")
    cwe = cwe[0] if isinstance(cwe, list) and cwe else cwe
    clases = meta.get("vulnerability_class") or ["Otros"]
    mensaje = " ".join(extra.get("message", "").split())
    archivo = _relativo(resultado.get("path", ""))
    inicio, fin = resultado["start"]["line"], resultado["end"]["line"]
    return {
        "regla_id": resultado.get("check_id", "").split(".")[-1],
        "titulo": mensaje.split(". ")[0][:200],
        "categoria": clases[0],
        "cwe_id": cwe.split(":")[0] if cwe else None,
        "archivo": archivo,
        "linea": inicio,
        "fragmento_codigo": _lineas(ruta, archivo, inicio, fin),
        "severidad": severidad,
        "confianza": confianza,
        "prioridad": prioridad(severidad, confianza),
    }


def _lineas(ruta, archivo, inicio, fin):
    # Semgrep sin cuenta no devuelve el código: se lee del clon local.
    try:
        with open(os.path.join(ruta, archivo), encoding="utf-8", errors="ignore") as f:
            return "".join(f.readlines()[inicio - 1:min(fin, inicio + 9)]).rstrip() or None
    except OSError:
        return None


def metricas(ruta, bandit, semgrep):
    """Archivos y líneas revisados por cualquiera de los dos analizadores."""
    archivos = {_relativo(k) for k in bandit.get("metrics", {}) if k != "_totals"}
    archivos |= {_relativo(k) for k in semgrep.get("paths", {}).get("scanned", [])}
    lineas = 0
    for archivo in archivos:
        try:
            with open(os.path.join(ruta, archivo), encoding="utf-8", errors="ignore") as f:
                lineas += sum(1 for _ in f)
        except OSError:
            pass
    return {"archivos_analizados": len(archivos), "lineas": lineas}
