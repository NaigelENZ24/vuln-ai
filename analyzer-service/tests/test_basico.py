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


if __name__ == "__main__":
    unittest.main()
