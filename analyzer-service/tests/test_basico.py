"""Pruebas sin red ni claves: python -m unittest discover tests"""
import json
import os
import tempfile
import unittest
from unittest import mock

for variable in ("SUPABASE_URL", "SUPABASE_SERVICE_KEY", "LLM_API_KEY"):
    os.environ.setdefault(variable, "https://prueba.supabase.co" if variable == "SUPABASE_URL" else "prueba")

from fastapi import HTTPException

from app import llm_service

from app.github_service import parsear_url
from app.scanner import _relativo, a_hallazgo, a_hallazgo_semgrep, extraer_scripts, metricas, prioridad


class PruebasBasicas(unittest.TestCase):
    def test_prioridad_combina_severidad_y_confianza(self):
        self.assertEqual(prioridad("alto", "alto"), "alto")
        self.assertEqual(prioridad("alto", "medio"), "alto")
        self.assertEqual(prioridad("alto", "bajo"), "medio")
        self.assertEqual(prioridad("medio", "medio"), "medio")
        self.assertEqual(prioridad("bajo", "medio"), "bajo")

    def test_convierte_resultado_de_bandit(self):
        fila = a_hallazgo({
            "filename": "/code/app/db.py", "line_number": 12, "test_id": "B608",
            "issue_text": "Possible SQL injection", "issue_severity": "MEDIUM",
            "issue_confidence": "HIGH", "issue_cwe": {"id": 89}, "code": "q = f'...'",
        })
        self.assertEqual(fila["archivo"], "app/db.py")
        self.assertEqual(fila["cwe_id"], "CWE-89")
        self.assertEqual(fila["categoria"], "Inyección")
        self.assertEqual((fila["severidad"], fila["confianza"], fila["prioridad"]), ("medio", "alto", "alto"))

    def test_metricas_une_archivos_de_ambos_analizadores(self):
        with tempfile.TemporaryDirectory() as ruta:
            for nombre in ("a.py", "b.jsx"):
                with open(os.path.join(ruta, nombre), "w") as f:
                    f.write("1\n2\n3\n")
            bandit = {"metrics": {"/code/a.py": {"loc": 3}, "_totals": {"loc": 3}}}
            semgrep = {"paths": {"scanned": ["/code/a.py", "/code/b.jsx"]}}
            self.assertEqual(metricas(ruta, bandit, semgrep), {"archivos_analizados": 2, "lineas": 6})

    def test_extrae_scripts_del_html_conservando_lineas(self):
        with tempfile.TemporaryDirectory() as repo, tempfile.TemporaryDirectory() as salida:
            os.makedirs(os.path.join(repo, "templates"))
            with open(os.path.join(repo, "templates", "a.html"), "w") as f:
                f.write('<h1>x</h1>\n<script src="lib.js"></script>\n<script>\nel.innerHTML = datos;\n</script>\n')
            extraer_scripts(repo, salida)
            with open(os.path.join(salida, "templates", "a.html.js")) as f:
                lineas = f.read().split("\n")
        self.assertEqual(lineas[3], "el.innerHTML = datos;")  # línea 4, igual que en el .html
        self.assertNotIn("lib.js", "".join(lineas))
        self.assertEqual(_relativo("/inline/templates/a.html.js"), "templates/a.html")
        self.assertEqual(_relativo("/code/src/App.jsx"), "src/App.jsx")

    def test_convierte_resultado_de_semgrep(self):
        with tempfile.TemporaryDirectory() as ruta:
            with open(os.path.join(ruta, "App.jsx"), "w") as f:
                f.write("x\n<div dangerouslySetInnerHTML={{ __html: h }} />\n")
            fila = a_hallazgo_semgrep({
                "check_id": "typescript.react.security.audit.react-dangerouslysetinnerhtml",
                "path": "/code/App.jsx", "start": {"line": 2}, "end": {"line": 2},
                "extra": {"severity": "WARNING", "message": "Detection of dangerouslySetInnerHTML. Avoid it.",
                          "metadata": {"confidence": "MEDIUM", "cwe": ["CWE-79: XSS"], "vulnerability_class": ["Cross-Site-Scripting (XSS)"]}},
            }, ruta)
        self.assertEqual(fila["regla_id"], "react-dangerouslysetinnerhtml")
        self.assertEqual(fila["titulo"], "Detection of dangerouslySetInnerHTML")
        self.assertEqual((fila["cwe_id"], fila["categoria"]), ("CWE-79", "Cross-Site-Scripting (XSS)"))
        self.assertEqual((fila["severidad"], fila["prioridad"]), ("medio", "medio"))
        self.assertIn("dangerouslySetInnerHTML", fila["fragmento_codigo"])

    def test_interpretar_solo_toca_hallazgos_enviados(self):
        base = {"regla_id": "B602", "titulo": "t", "cwe_id": None, "archivo": "a.py", "linea": 1,
                "confianza": "alto", "fragmento_codigo": "x", "prioridad": "medio"}
        hallazgos = [{**base, "severidad": "bajo"}, {**base, "severidad": "alto"}]
        respuesta = json.dumps({"resumen": "Resumen", "hallazgos": [
            {"indice": 1, "explicacion": "e", "recomendacion": "r", "prioridad": "alto"},
            {"indice": 99, "explicacion": "inventado", "recomendacion": "r", "prioridad": "alto"},
        ]})
        with mock.patch.object(llm_service, "generar", return_value=(respuesta, "modelo-x")) as generar:
            self.assertEqual(llm_service.interpretar(hallazgos), ("Resumen", "modelo-x"))
        self.assertIn("<datos>", generar.call_args.args[1][0]["content"])
        self.assertEqual(hallazgos[1]["explicacion_ia"], "e")
        self.assertEqual(hallazgos[1]["prioridad"], "alto")
        self.assertNotIn("explicacion_ia", hallazgos[0])

    def test_generar_pasa_al_siguiente_modelo_si_uno_falla(self):
        def falso(modelo, *_):
            if modelo == "agotado":
                raise RuntimeError("429")
            return "ok"
        with mock.patch.object(llm_service, "MODELOS", ["agotado", "libre"]), \
             mock.patch.object(llm_service, "_gemini", falso), mock.patch.object(llm_service, "_anthropic", falso):
            self.assertEqual(llm_service.generar("s", []), ("ok", "libre"))

    def test_extraer_scripts_salta_carpetas_ignoradas(self):
        with tempfile.TemporaryDirectory() as repo, tempfile.TemporaryDirectory() as salida:
            for archivo in ("pagos/a.html", "dist/b.html", "node_modules/x/c.html"):
                os.makedirs(os.path.dirname(os.path.join(repo, archivo)), exist_ok=True)
                with open(os.path.join(repo, archivo), "w") as f:
                    f.write("<script>el.innerHTML = x;</script>\n")
            extraer_scripts(repo, salida)
            self.assertTrue(os.path.exists(os.path.join(salida, "pagos", "a.html.js")))
            self.assertFalse(os.path.exists(os.path.join(salida, "dist")))
            self.assertFalse(os.path.exists(os.path.join(salida, "node_modules")))

    def test_chat_recibe_detalle_e_indice_de_todos_los_modulos(self):
        base = {"regla_id": "B602", "titulo": "t", "cwe_id": None, "linea": 1, "confianza": "alto",
                "fragmento_codigo": "x", "explicacion_ia": "e", "recomendacion_ia": "r"}
        hallazgos = [{**base, "archivo": f"app/core/{i}.py", "severidad": "alto"} for i in range(llm_service.MAX_DETALLE_CHAT)]
        hallazgos.append({**base, "archivo": "app/pagos/cobro.py", "severidad": "bajo"})
        with mock.patch.object(llm_service, "generar", return_value=("ok", "m")) as generar:
            llm_service.responder_chat("resumen", hallazgos, 1500, [], "¿qué hay en pagos?")
        contexto = generar.call_args.args[1][0]["content"]
        self.assertIn("app/pagos/cobro.py:1 | B602 | bajo", contexto)  # fuera del detalle, pero en el índice
        self.assertIn("1500 hallazgos", contexto)
        self.assertIn("1459 hallazgos más", contexto)
        self.assertEqual(generar.call_args.args[1][-1]["content"], "¿qué hay en pagos?")

    def test_url_valida(self):
        self.assertEqual(parsear_url("https://github.com/pallets/flask.git"), ("pallets", "flask"))

    def test_url_rechaza_otros_sitios_y_argumentos(self):
        for url in ["https://gitlab.com/a/b", "https://github.com/a", "https://github.com/--upload-pack=x/b c", "file:///etc"]:
            with self.assertRaises(HTTPException):
                parsear_url(url)

    def test_huella_no_depende_de_la_linea(self):
        from app.incidencias import asignar_huellas

        def huellas(contenido, lineas):
            with tempfile.TemporaryDirectory() as ruta:
                with open(os.path.join(ruta, "a.py"), "w") as f:
                    f.write(contenido)
                hs = [{"regla_id": "B307", "archivo": "a.py", "linea": n, "_fin": n, "fragmento_codigo": "ctx"} for n in lineas]
                asignar_huellas(hs, ruta)
            self.assertTrue(all("_fin" not in h for h in hs))
            return [h["huella"] for h in hs]

        original = huellas("x = 1\neval(dato)\n", [2])
        movida = huellas("import os\n\nx = 2\neval(dato)\n", [4])      # cambió de línea y la de arriba
        self.assertEqual(original, movida)
        dos = huellas("eval(dato)\neval(dato)\n", [1, 2])             # mismo código dos veces
        self.assertNotEqual(dos[0], dos[1])
        self.assertEqual(dos[0], original[0])
        self.assertNotEqual(huellas("eval(otro)\n", [1]), original)

    def test_conciliar_respeta_la_revision_del_admin(self):
        from app import incidencias

        class Consulta:  # imita lo justo del cliente de Supabase
            def __init__(self, tabla):
                self.tabla, self.op, self.datos, self.filtros = tabla, "select", None, []
            def select(self, *a, **k): return self
            def range(self, *a): return self
            def eq(self, c, v): self.filtros.append(v); return self
            def update(self, d): self.op, self.datos = "update", d; return self
            def insert(self, d): self.op, self.datos = "insert", d; return self
            def execute(self):
                if self.op == "select":
                    return mock.Mock(data=existentes)
                ops.append((self.tabla, self.op, self.datos, self.filtros))
                return mock.Mock(data=[])

        base = {"archivo": "a.py", "veces_reabierta": 0, "motivo_cierre": None, "descarte_solicitado": False}
        existentes = [
            {**base, "id": "aprobada", "huella": "A", "estado": "resuelta", "motivo_cierre": "descartada"},
            {**base, "id": "pendiente", "huella": "B", "estado": "en_revision", "descarte_solicitado": True},
            {**base, "id": "corregida", "huella": "C", "estado": "resuelta", "motivo_cierre": "verificada"},
            {**base, "id": "verificar", "huella": "D", "estado": "en_revision"},
        ]
        ops = []
        hallazgos = [{"huella": h, "linea": 3, "fragmento_codigo": "x"} for h in ("A", "B", "C")]
        vigilada = {"repositorio_id": "r", "rama": "main"}
        with tempfile.TemporaryDirectory() as ruta, mock.patch.object(incidencias.supabase, "table", Consulta):
            open(os.path.join(ruta, "a.py"), "w").close()
            incidencias.conciliar("an1", vigilada, hallazgos, ruta, "abc1234")

        cambios = {f[-1]: d for t, op, d, f in ops if op == "update"}
        self.assertNotIn("estado", cambios["aprobada"])    # no se reabre lo que el admin resolvió
        self.assertNotIn("estado", cambios["pendiente"])   # ni se da por fallida una revisión pendiente
        self.assertEqual(cambios["corregida"]["estado"], "abierta")  # lo corregido que reaparece, sí
        self.assertEqual((cambios["verificar"]["estado"], cambios["verificar"]["motivo_cierre"]), ("resuelta", "verificada"))
        eventos = [e["tipo"] for t, op, d, f in ops if t == "incidencia_eventos" for e in d]
        self.assertEqual(sorted(eventos), ["reabierta", "resuelta"])

    def test_reglas_de_recordatorios(self):
        from datetime import datetime, timedelta, timezone
        from app import recordatorios

        ahora = datetime.now(timezone.utc)
        hace = lambda dias: (ahora - timedelta(days=dias)).isoformat()
        base = {"titulo": "SQL armada con texto", "regla_id": "B608", "archivo": "a.py", "linea_actual": 4, "rama": "main",
                "severidad": "alto", "creada_en": hace(2), "actualizada_en": hace(2), "fecha_limite": hace(-5),
                "fragmento_codigo": "SECRETO = 'no-debe-salir'"}
        datos = {
            "equipos": {"nombre": "Equipo", "frecuencia_alta_dias": 2, "frecuencia_media_dias": 7, "frecuencia_baja_dias": None,
                        "pausa_en_correccion": True, "dias_escalamiento": 14, "dias_estancada_admin": 8,
                        "perfiles": {"nombre": "Admin", "correo": "admin@x.com"}},
            "miembros_equipo": [{"usuario_id": u, "perfiles": {"nombre": u, "correo": f"{u}@x.com"}} for u in ("ana", "beto", "caro")],
            "incidencias": [
                {**base, "id": 1, "asignado_a": "ana", "estado": "abierta"},                                 # le toca
                {**base, "id": 2, "asignado_a": "beto", "estado": "en_correccion", "actualizada_en": hace(1)},  # pausada
                {**base, "id": 3, "asignado_a": "caro", "estado": "abierta"},                                # recibió ayer
                {**base, "id": 4, "asignado_a": None, "estado": "abierta", "fecha_limite": hace(1)},         # vencida
            ],
            "notificaciones": [{"usuario_id": "caro", "tipo": "recordatorio", "resultado": "enviado", "creado_en": hace(1)}],
        }
        registrados, enviados = [], []

        class Consulta:
            def __init__(self, tabla): self.tabla = tabla
            def __getattr__(self, _): return lambda *a, **k: self
            def insert(self, fila): registrados.append(fila); return self
            def execute(self): return mock.Mock(data=datos[self.tabla])

        with mock.patch.object(recordatorios.supabase, "table", Consulta), \
             mock.patch.object(recordatorios.correo, "configurado", return_value=True), \
             mock.patch.object(recordatorios.correo, "enviar", side_effect=lambda d, m: enviados.append((d, m))):
            resultado = recordatorios.ejecutar("e1")

        self.assertEqual(resultado, {"enviados": 2, "omitidos": 2, "fallidos": 0})
        self.assertEqual([d for d, _ in enviados], ["ana@x.com", "admin@x.com"])  # beto pausado, caro aún no le toca
        self.assertIn("vencida", enviados[1][1]["subject"].lower() + enviados[1][1]["htmlContent"])
        for _, m in enviados:
            self.assertNotIn("no-debe-salir", m["htmlContent"] + m["textContent"])  # nunca código por correo
        self.assertEqual(sorted(r["resultado"] for r in registrados), ["enviado", "enviado", "omitido", "omitido"])

        # «Enviar ahora» (forzar): a todos los que tienen pendientes, sin frecuencia, pausa ni límite diario.
        enviados.clear()
        with mock.patch.object(recordatorios.supabase, "table", Consulta), \
             mock.patch.object(recordatorios.correo, "configurado", return_value=True), \
             mock.patch.object(recordatorios.correo, "enviar", side_effect=lambda d, m: enviados.append((d, m))):
            resultado = recordatorios.ejecutar("e1", forzar=True)
        self.assertEqual(resultado, {"enviados": 4, "omitidos": 0, "fallidos": 0})
        self.assertEqual(sorted(d for d, _ in enviados), ["admin@x.com", "ana@x.com", "beto@x.com", "caro@x.com"])

    def test_contexto_del_asistente_de_equipo(self):
        from datetime import datetime, timedelta, timezone
        from app.asistente import construir_contexto

        ahora = datetime.now(timezone.utc)
        hace = lambda d: (ahora - timedelta(days=d)).isoformat()
        equipo = {"nombre": "Equipo", "limite_en_correccion": 3, "dias_estancada": 5}
        miembros = [
            {"usuario_id": "ana", "rol": "colaborador", "perfiles": {"nombre": "Ana"},
             "miembro_ramas": [{"repositorio_id": "r1", "ramas_vigiladas": {"rama": "dev"}}]},
            {"usuario_id": "luis", "rol": "colaborador", "perfiles": {"nombre": "Luis"}, "miembro_ramas": []},
            {"usuario_id": "tuto", "rol": "observador", "perfiles": {"nombre": "Tutora"}, "miembro_ramas": []},
        ]
        ramas = [{"repositorio_id": "r1", "rama": "main", "es_principal": True, "repositorios": {"nombre": "e/app"}},
                 {"repositorio_id": "r1", "rama": "dev", "es_principal": False, "repositorios": {"nombre": "e/app"}}]
        base = {"regla_id": "B1", "repositorio_id": "r1", "archivo": "a.py", "linea_actual": 1, "actualizada_en": hace(1),
                "resuelta_en": None, "motivo_cierre": None, "corregida_por": None, "descarte_solicitado": False, "titulo": "t"}
        incidencias = [
            {**base, "huella": "h1", "rama": "main", "severidad": "alto", "estado": "abierta", "asignado_a": "luis", "fecha_limite": hace(2)},
            {**base, "huella": "h2", "rama": "main", "severidad": "medio", "estado": "en_correccion", "asignado_a": "luis",
             "fecha_limite": hace(-5), "actualizada_en": hace(9)},
            {**base, "huella": "h1", "rama": "dev", "severidad": "alto", "estado": "abierta", "asignado_a": None, "fecha_limite": None},
            {**base, "huella": "h9", "rama": "dev", "severidad": "alto", "estado": "en_correccion", "asignado_a": "ana", "fecha_limite": hace(-3)},
            {**base, "huella": "h5", "rama": "main", "severidad": "bajo", "estado": "resuelta", "asignado_a": "ana",
             "fecha_limite": None, "resuelta_en": hace(3), "corregida_por": "ana-dev", "motivo_cierre": "verificada"},
        ]
        c = construir_contexto(equipo, miembros, ramas, incidencias, ahora)
        personas = {p["nombre"]: p for p in c["personas"]}
        self.assertEqual((personas["Luis"]["vencidas"], personas["Luis"]["altas_vencidas"], personas["Luis"]["estancadas"]), (1, 1, 1))
        self.assertEqual((personas["Ana"]["asignadas"], personas["Ana"]["resueltas_30_dias"]), (1, 1))
        self.assertEqual(personas["Ana"]["trabaja_en"], ["e/app · dev"])
        self.assertEqual(personas["Luis"]["trabaja_en"], ["e/app · main"])   # sin elección: la principal
        self.assertEqual(personas["Tutora"]["trabaja_en"], [])
        dev = next(r for r in c["ramas"] if r["rama"] == "dev")
        self.assertEqual(dev["frente_a_la_principal"], {"nuevas": 1, "nuevas_altas": 1, "corregidas": 1})  # h9 nueva; h2 no está en dev
        self.assertEqual((c["totales"]["vencidas"], c["totales"]["sin_asignar"], c["totales"]["resueltas_30_dias"]), (1, 1, 1))
        self.assertEqual(c["incidencias_abiertas"][0]["responsable"], "Luis")  # lo vencido primero
        self.assertEqual(c["resueltas_recientes"][0]["corregida_por_github"], "ana-dev")

    def test_nombre_de_rama_seguro(self):
        from app.github_service import PATRON_RAMA
        for valida in ("main", "feature/login", "fix-1.2", "release_2024"):
            self.assertTrue(PATRON_RAMA.match(valida), valida)
        for peligrosa in ("--upload-pack=x", "-x", "a..b", "a b", "rama;rm", ""):
            self.assertFalse(PATRON_RAMA.match(peligrosa), peligrosa)

    def test_correo_de_invitacion(self):
        from app import correo
        m = correo.mensaje_invitacion("Equipo <b>\nDemo", "colaborador", "http://localhost:5173/invitacion/abc")
        self.assertEqual(m["subject"], "Te invitaron al equipo Equipo <b> Demo en Centinela")
        self.assertIn("http://localhost:5173/invitacion/abc", m["textContent"])
        self.assertIn("Equipo &lt;b&gt; Demo", m["htmlContent"])
        self.assertNotIn("<b>", m["htmlContent"])

    def test_correo_rechazado_por_brevo(self):
        from app import correo
        respuesta = mock.Mock(status_code=400, text='{"message":"sender email is invalid"}')
        with mock.patch.object(correo.httpx, "post", return_value=respuesta):
            with self.assertRaises(correo.CorreoNoEnviado):
                correo.enviar("ana@x.com", {"subject": "a", "textContent": "b", "htmlContent": "c"})


if __name__ == "__main__":
    unittest.main()
