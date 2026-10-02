#!/usr/bin/env python3
"""Construye el material de un curso a partir de JSON y lo empaqueta en UN ZIP.

Uso:
  python build_course.py --curso curso.json --temas temas/ --salida /ruta/material-x.zip
  python build_course.py --curso curso.json --temas temas/ --solo-validar   (valida los temas escritos hasta ahora)

Solo usa la libreria estandar. El HTML, el diseno y la separacion de
respuestas (soluciones/) los pone este script: el autor solo escribe contenido.
"""
import argparse
import html
import json
import re
import shutil
import sys
import tempfile
import zipfile
from pathlib import Path

SKILL_DIR = Path(__file__).resolve().parent.parent
ASSETS_DIR = SKILL_DIR / "assets"
HEX_COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")
FORBIDDEN = re.compile(r"localStorage|sessionStorage|document\.cookie|serviceWorker")
ABSOLUTE_PATH = re.compile(r"""(?:src|href)\s*=\s*["'](?:/(?!/)|[a-zA-Z]:\\|file:)""")
LEVEL_LABEL = {"basico": "Básico", "básico": "Básico", "intermedio": "Intermedio", "reto": "Reto"}
CALLOUT_LABEL = {"importante": "Importante", "tip": "Tip", "error": "Error común", "nota": "Nota"}
QUESTION_TYPES = {"opcion", "vf", "corta"}


def esc(text):
    return html.escape(str(text or ""), quote=True)


def pad2(n):
    return f"{int(n):02d}"


def strip_tags(text):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", str(text or ""))).strip().lower()


def as_list(value):
    return value if isinstance(value, list) else []


# ---------------------------------------------------------------- validacion

class Report:
    def __init__(self):
        self.errors, self.warnings = [], []

    def error(self, where, msg):
        self.errors.append(f"[{where}] {msg}")

    def warn(self, where, msg):
        self.warnings.append(f"[{where}] {msg}")


def walk_strings(value, path=""):
    if isinstance(value, str):
        yield path, value
    elif isinstance(value, list):
        for i, item in enumerate(value):
            yield from walk_strings(item, f"{path}[{i}]")
    elif isinstance(value, dict):
        for key, item in value.items():
            yield from walk_strings(item, f"{path}.{key}" if path else key)


def expected_counts(minutes):
    blocks = max(1, round((minutes or 45) / 45))
    if blocks >= 3:
        return {"ejercicios": 8, "preguntas": 10, "ejemplos": 4}
    if blocks == 2:
        return {"ejercicios": 5, "preguntas": 8, "ejemplos": 3}
    return {"ejercicios": 3, "preguntas": 5, "ejemplos": 2}


def answer_index(question):
    """Indice 0-based de la opcion correcta: acepta letra (A, B...) o numero 1-based."""
    answer = question.get("respuesta")
    options = as_list(question.get("opciones"))
    if isinstance(answer, str) and len(answer.strip()) == 1 and answer.strip().isalpha():
        idx = ord(answer.strip().upper()) - ord("A")
    elif isinstance(answer, int) and not isinstance(answer, bool):
        idx = answer - 1
    elif isinstance(answer, str) and answer.strip().isdigit():
        idx = int(answer.strip()) - 1
    else:
        return None
    return idx if 0 <= idx < len(options) else None


def validate_course(curso, report):
    for field in ("curso", "temas"):
        if not curso.get(field):
            report.error("curso.json", f"falta '{field}'")
    numbers = [t.get("numero") for t in as_list(curso.get("temas"))]
    if numbers != list(range(1, len(numbers) + 1)):
        report.error("curso.json", "los temas deben estar numerados 1, 2, 3... en orden y sin saltos")
    for key, value in (curso.get("colores") or {}).items():
        if not HEX_COLOR.match(str(value)):
            report.error("curso.json", f"colores.{key} debe ser #RRGGBB (es '{value}')")


def validate_topic(tema, numero, curso, report):
    where = f"tema-{pad2(numero)}.json"
    if tema.get("numero") != numero:
        report.error(where, f"'numero' debe ser {numero} (coincidir con el nombre del archivo)")
    for field in ("objetivos", "bloques", "ejercicios", "preguntas", "ideas_clave"):
        if not as_list(tema.get(field)):
            report.error(where, f"falta '{field}' (lista no vacía)")
    if not as_list((tema.get("guia_docente") or {}).get("plan")):
        report.error(where, "falta 'guia_docente.plan' (plan minuto a minuto)")

    for i, bloque in enumerate(as_list(tema.get("bloques")), 1):
        if not bloque.get("titulo") or not bloque.get("html"):
            report.error(where, f"bloque {i}: necesita 'titulo' y 'html'")
    for i, ej in enumerate(as_list(tema.get("ejercicios")), 1):
        if not ej.get("enunciado") or not ej.get("solucion"):
            report.error(where, f"Ejercicio {i}: necesita 'enunciado' y 'solucion'")
        if ej.get("nivel") and str(ej["nivel"]).lower() not in LEVEL_LABEL:
            report.error(where, f"Ejercicio {i}: 'nivel' debe ser basico, intermedio o reto")
    for i, q in enumerate(as_list(tema.get("preguntas")), 1):
        kind = q.get("tipo")
        if kind not in QUESTION_TYPES:
            report.error(where, f"Pregunta {i}: 'tipo' debe ser opcion, vf o corta")
        elif kind == "opcion" and (len(as_list(q.get("opciones"))) < 2 or answer_index(q) is None):
            report.error(where, f"Pregunta {i}: 'opcion' necesita 2+ 'opciones' y 'respuesta' como letra (A, B...)")
        elif kind == "vf" and not isinstance(q.get("respuesta"), bool):
            report.error(where, f"Pregunta {i}: 'vf' necesita 'respuesta' true o false")
        elif kind == "corta" and not q.get("respuesta"):
            report.error(where, f"Pregunta {i}: 'corta' necesita 'respuesta'")
        if not q.get("enunciado"):
            report.error(where, f"Pregunta {i}: falta 'enunciado'")

    for path, text in walk_strings(tema):
        if FORBIDDEN.search(text):
            report.error(where, f"{path}: no se permite localStorage/sessionStorage/cookies/serviceWorker")
        if ABSOLUTE_PATH.search(text):
            report.error(where, f"{path}: usa rutas relativas (nada de '/...', 'C:\\...' o 'file:')")

    expected = expected_counts(curso.get("duracion_clase_min"))
    for field, minimum in expected.items():
        count = len(as_list(tema.get(field)))
        if 0 < count < minimum:
            report.warn(where, f"{count} {field}: para una clase de {curso.get('duracion_clase_min', 45)} min se esperan al menos {minimum}")


def check_leaks(tema, student_page, numero, report):
    """Las respuestas solo deben estar en soluciones/: avisa si se colaron en el tema."""
    visible = strip_tags(student_page)
    candidates = [("Ejercicio", i, ej.get("solucion")) for i, ej in enumerate(as_list(tema.get("ejercicios")), 1)]
    candidates += [("Pregunta", i, q.get("explicacion")) for i, q in enumerate(as_list(tema.get("preguntas")), 1)]
    for label, i, answer in candidates:
        text = strip_tags(answer)
        if len(text) >= 40 and text[:80] in visible:
            report.error(f"tema-{pad2(numero)}.json", f"{label} {i}: su respuesta aparece en el material del alumno")


# ---------------------------------------------------------------- render

def head(title, rel, curso):
    colors = curso.get("colores") or {}
    overrides = "".join(f"--{esc(k)}:{v};" for k, v in colors.items() if HEX_COLOR.match(str(v)))
    return f"""<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Space+Grotesk:wght@500;700&display=swap">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css">
<link rel="stylesheet" href="{rel}assets/estilos.css">
{f'<style>:root{{{overrides}}}</style>' if overrides else ''}
</head>
<body>
"""


def foot(rel):
    return f"""<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
<script src="{rel}assets/app.js"></script>
</body>
</html>
"""


def hero(tag, title, subtitle, meta, extra_class=""):
    chips = "".join(f'<span class="chip">{esc(m)}</span>' for m in meta if m)
    return f"""<header class="hero {extra_class}"><div class="wrap">
<span class="tag">{esc(tag)}</span>
<h1>{esc(title)}</h1>
{f'<p class="subtitle">{subtitle}</p>' if subtitle else ''}
<div class="chips">{chips}</div>
</div></header>
"""


def topic_nav(numero, total, rel=""):
    prev_link = f'<a href="{rel}tema-{pad2(numero - 1)}.html">← Tema {numero - 1}</a>' if numero > 1 else "<span></span>"
    next_link = f'<a href="{rel}tema-{pad2(numero + 1)}.html">Tema {numero + 1} →</a>' if numero < total else "<span></span>"
    return f'<nav class="topic-nav">{prev_link}<a href="{rel}index.html">Índice del curso</a>{next_link}</nav>'


def section(anchor, title, body, extra_class=""):
    return f'<section class="card {extra_class}" id="{anchor}"><h2>{esc(title)}</h2>{body}</section>\n'


def callouts(items):
    out = ""
    for c in as_list(items):
        kind = str(c.get("tipo", "nota")).lower()
        out += f'<div class="callout callout-{esc(kind)}"><strong>{CALLOUT_LABEL.get(kind, "Nota")}</strong><div>{c.get("texto", "")}</div></div>'
    return out


def level_badge(level):
    key = str(level or "").lower()
    return f'<span class="level level-{esc(key.replace("á", "a"))}">{LEVEL_LABEL[key]}</span>' if key in LEVEL_LABEL else ""


def topic_meta(curso, tema_info):
    return [
        f"{curso.get('duracion_clase_min', 45)} min",
        curso.get("nivel"),
        f"Parte {tema_info['parte']}" if tema_info.get("parte") else None,
    ]


def render_topic(curso, tema, tema_info, total):
    n = tema["numero"]
    title = tema.get("titulo") or tema_info.get("titulo")
    toc = [("objetivos", "Objetivos"), ("partida", "Punto de partida"), ("desarrollo", "Desarrollo"),
           ("ejemplos", "Ejemplos"), ("practica", "Práctica guiada"), ("ejercicios", "Ejercicios"),
           ("cuestionario", "Cuestionario"), ("ideas", "Ideas clave")]
    out = head(f"Tema {n} · {title}", "", curso)
    out += hero(f"Tema {n} de {total}", title, tema.get("resumen"), topic_meta(curso, tema_info))
    out += '<main class="wrap">' + topic_nav(n, total)
    out += '<nav class="toc">' + "".join(f'<a href="#{a}">{t}</a>' for a, t in toc) + "</nav>"

    out += section("objetivos", "Objetivos de aprendizaje",
                   '<ul class="goals">' + "".join(f"<li>{o}</li>" for o in as_list(tema.get("objetivos"))) + "</ul>")
    partida = tema.get("punto_de_partida") or {}
    if partida:
        out += section("partida", "Punto de partida",
                       f'<p>{partida.get("texto", "")}</p>' + (f'<p class="hook">{partida["pregunta"]}</p>' if partida.get("pregunta") else ""))

    out += '<div id="desarrollo"></div>'
    for i, bloque in enumerate(as_list(tema.get("bloques")), 1):
        out += section(f"bloque-{i}", bloque.get("titulo", ""), bloque.get("html", "") + callouts(bloque.get("callouts")))
        if bloque.get("pausa_despues"):
            out += '<div class="pause">☕ Pausa</div>'

    ejemplos = as_list(tema.get("ejemplos"))
    if ejemplos:
        body = ""
        for i, ej in enumerate(ejemplos, 1):
            steps = "".join(f"<li>{p}</li>" for p in as_list(ej.get("pasos")))
            body += f'<article class="example"><h3>Ejemplo {i}: {esc(ej.get("titulo", ""))}</h3>{ej.get("contexto", "")}<ol class="steps">{steps}</ol>'
            body += f'<div class="result">{ej["resultado"]}</div>' if ej.get("resultado") else ""
            body += "</article>"
        out += section("ejemplos", "Ejemplos resueltos", body)

    practica = tema.get("practica_guiada") or {}
    if practica:
        out += section("practica", f"Práctica guiada: {practica.get('titulo', '')}".rstrip(": "), practica.get("html", ""), "practice")

    body = ""
    for i, ej in enumerate(as_list(tema.get("ejercicios")), 1):
        deliverable = f'<p class="deliverable"><strong>Entrega:</strong> {ej["entregable"]}</p>' if ej.get("entregable") else ""
        body += f'<article class="exercise"><h3>Ejercicio {i}{": " + esc(ej["titulo"]) if ej.get("titulo") else ""} {level_badge(ej.get("nivel"))}</h3>{ej.get("enunciado", "")}{deliverable}</article>'
    out += section("ejercicios", "Ejercicios", body)

    body = ""
    for i, q in enumerate(as_list(tema.get("preguntas")), 1):
        body += f'<fieldset class="question"><legend>Pregunta {i}</legend><div class="q-text">{q.get("enunciado", "")}</div>'
        if q.get("tipo") == "opcion":
            body += "".join(f'<label><input type="radio" name="p{i}"> <span>{chr(65 + j)}. {opt}</span></label>' for j, opt in enumerate(as_list(q.get("opciones"))))
        elif q.get("tipo") == "vf":
            body += f'<label><input type="radio" name="p{i}"> <span>Verdadero</span></label><label><input type="radio" name="p{i}"> <span>Falso</span></label>'
        else:
            body += '<textarea rows="3" placeholder="Tu respuesta"></textarea>'
        body += "</fieldset>"
    out += section("cuestionario", "Cuestionario de repaso", body, "quiz")

    body = '<ul class="key-ideas">' + "".join(f"<li>{k}</li>" for k in as_list(tema.get("ideas_clave"))) + "</ul>"
    glosario = as_list(tema.get("glosario"))
    if glosario:
        body += "<h3>Glosario</h3><dl class=\"glossary\">" + "".join(f"<dt>{esc(g.get('termino'))}</dt><dd>{g.get('definicion', '')}</dd>" for g in glosario) + "</dl>"
    out += section("ideas", "Ideas clave", body)

    recursos = as_list(tema.get("recursos"))
    if recursos:
        out += section("recursos", "Para profundizar", "<ul>" + "".join(
            f'<li><a href="{esc(r.get("url"))}" target="_blank" rel="noopener">{esc(r.get("titulo"))}</a>{" — " + r["nota"] if r.get("nota") else ""}</li>'
            if r.get("url") else f'<li>{esc(r.get("titulo"))}{" — " + r["nota"] if r.get("nota") else ""}</li>' for r in recursos) + "</ul>")

    out += topic_nav(n, total) + "</main>" + foot("")
    return out


def render_solution(curso, tema, tema_info, total):
    n = tema["numero"]
    title = tema.get("titulo") or tema_info.get("titulo")
    out = head(f"Soluciones · Tema {n} · {title}", "../", curso)
    out += hero("Solo instructor", f"Soluciones · Tema {n}", esc(title), topic_meta(curso, tema_info), "hero-instructor")
    out += f'<main class="wrap"><nav class="topic-nav"><span></span><a href="../tema-{pad2(n)}.html">← Volver al tema {n}</a><span></span></nav>'

    body = ""
    for i, ej in enumerate(as_list(tema.get("ejercicios")), 1):
        body += f'<article class="exercise"><h3>Ejercicio {i}{": " + esc(ej["titulo"]) if ej.get("titulo") else ""} {level_badge(ej.get("nivel"))}</h3>'
        body += f'<details class="statement"><summary>Ver enunciado</summary>{ej.get("enunciado", "")}</details>'
        body += f'<div class="answer">{ej.get("solucion", "")}</div>'
        body += f'<p class="rubric"><strong>Rúbrica:</strong> {ej["rubrica"]}</p>' if ej.get("rubrica") else ""
        body += "</article>"
    out += section("ejercicios", "Ejercicios", body)

    body = ""
    for i, q in enumerate(as_list(tema.get("preguntas")), 1):
        body += f'<article class="question-answer"><h3>Pregunta {i}</h3><div class="q-text">{q.get("enunciado", "")}</div>'
        if q.get("tipo") == "opcion":
            correct = answer_index(q)
            body += "<ul class=\"options\">" + "".join(
                f'<li class="{"correct" if j == correct else ""}">{chr(65 + j)}. {opt}{" ✓" if j == correct else ""}</li>'
                for j, opt in enumerate(as_list(q.get("opciones")))) + "</ul>"
        elif q.get("tipo") == "vf":
            body += f'<p class="answer"><strong>{"Verdadero" if q.get("respuesta") else "Falso"}</strong></p>'
        else:
            body += f'<div class="answer">{q.get("respuesta", "")}</div>'
        body += f'<p class="explanation">{q["explicacion"]}</p>' if q.get("explicacion") else ""
        body += "</article>"
    out += section("preguntas", "Cuestionario", body)

    guia = tema.get("guia_docente") or {}
    body = '<table class="plan"><thead><tr><th>Minutos</th><th>Actividad</th></tr></thead><tbody>'
    body += "".join(f"<tr><td>{esc(p.get('minutos'))}</td><td>{p.get('actividad', '')}</td></tr>" for p in as_list(guia.get("plan")))
    body += "</tbody></table>"
    if as_list(guia.get("dinamizar")):
        body += "<h3>Preguntas para dinamizar</h3><ul>" + "".join(f"<li>{d}</li>" for d in guia["dinamizar"]) + "</ul>"
    if as_list(guia.get("errores_frecuentes")):
        body += "<h3>Errores frecuentes</h3><ul class=\"mistakes\">" + "".join(
            f"<li><strong>{e.get('error', '')}</strong> — {e.get('como_reconducir', '')}</li>" for e in guia["errores_frecuentes"]) + "</ul>"
    if guia.get("si_falta_tiempo") or guia.get("si_sobra_tiempo"):
        body += f'<div class="grid-2"><div class="callout callout-tip"><strong>Si falta tiempo</strong><div>{guia.get("si_falta_tiempo", "—")}</div></div>'
        body += f'<div class="callout callout-nota"><strong>Si sobra tiempo</strong><div>{guia.get("si_sobra_tiempo", "—")}</div></div></div>'
    out += section("guia", "Guía docente", body)
    out += "</main>" + foot("../")
    return out


def render_index(curso):
    temas = as_list(curso.get("temas"))
    out = head(curso["curso"], "", curso)
    meta = [curso.get("programa"), f"{len(temas)} temas", f"{curso.get('duracion_clase_min', 45)} min por clase", curso.get("nivel")]
    out += hero("Material del curso", curso["curso"], esc(curso.get("descripcion", "")), meta)
    out += '<main class="wrap">'
    if curso.get("alumnos"):
        out += section("dirigido", "¿A quién va dirigido?", f"<p>{esc(curso['alumnos'])}</p>")
    if as_list(curso.get("objetivos_generales")):
        out += section("objetivos", "Objetivos del curso", '<ul class="goals">' + "".join(f"<li>{o}</li>" for o in curso["objetivos_generales"]) + "</ul>")
    cards = ""
    for t in temas:
        part = f"<small>Parte {esc(t['parte'])}</small>" if t.get("parte") else ""
        cards += (f'<a class="topic-card" href="tema-{pad2(t["numero"])}.html"><span class="num">{pad2(t["numero"])}</span>'
                  f'<span><strong>{esc(t.get("titulo"))}</strong>{part}</span></a>')
    out += section("temario", "Temario", f'<div class="topic-grid">{cards}</div>')
    out += "</main>" + foot("")
    return out


# ---------------------------------------------------------------- main

def load_json(path, report):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        report.error(Path(path).name, f"JSON inválido: {e}")
    except OSError as e:
        report.error(Path(path).name, f"no se pudo leer: {e}")
    return None


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--curso", required=True, help="ruta a curso.json")
    parser.add_argument("--temas", required=True, help="carpeta con tema-01.json, tema-02.json...")
    parser.add_argument("--salida", help="ruta del ZIP final (por defecto, el nombre de curso.json 'zip')")
    parser.add_argument("--solo-validar", action="store_true", help="valida los temas existentes sin generar el ZIP")
    args = parser.parse_args()
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    report = Report()
    curso = load_json(args.curso, report)
    if curso is None:
        return finish(report)
    validate_course(curso, report)
    if report.errors:
        return finish(report)

    temas_info = {t["numero"]: t for t in curso["temas"]}
    total = len(temas_info)
    temas_dir = Path(args.temas)
    temas = {}
    for numero in temas_info:
        path = temas_dir / f"tema-{pad2(numero)}.json"
        if not path.exists():
            if not args.solo_validar:
                report.error(path.name, "falta: escribe este tema antes de empaquetar")
            continue
        tema = load_json(path, report)
        if tema is not None:
            validate_topic(tema, numero, curso, report)
            temas[numero] = tema
    extra = sorted(p.name for p in temas_dir.glob("*.json") if not re.fullmatch(r"tema-\d{2,}\.json", p.name) or int(p.stem.split("-")[1]) not in temas_info)
    for name in extra:
        report.error(name, "sobra: no corresponde a ningún tema de curso.json")

    pages = {}
    if not report.errors:
        pages["index.html"] = render_index(curso)
        for numero, tema in temas.items():
            student = render_topic(curso, tema, temas_info[numero], total)
            check_leaks(tema, student, numero, report)
            pages[f"tema-{pad2(numero)}.html"] = student
            pages[f"soluciones/tema-{pad2(numero)}.html"] = render_solution(curso, tema, temas_info[numero], total)

    if report.errors or args.solo_validar:
        if not report.errors:
            print(f"OK: {len(temas)}/{total} temas válidos ({', '.join(pad2(n) for n in sorted(temas))}).")
        return finish(report)

    salida = Path(args.salida or curso.get("zip") or "material.zip")
    salida.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        for rel, content in pages.items():
            (root / rel).parent.mkdir(parents=True, exist_ok=True)
            (root / rel).write_text(content, encoding="utf-8")
        shutil.copytree(ASSETS_DIR, root / "assets")
        with zipfile.ZipFile(salida, "w", zipfile.ZIP_DEFLATED) as zf:
            for path in sorted(root.rglob("*")):
                if path.is_file():
                    zf.write(path, path.relative_to(root).as_posix())
        names = zipfile.ZipFile(salida).namelist()

    print(f"ZIP generado: {salida} ({salida.stat().st_size // 1024} KB, {len(names)} archivos)")
    print(f"  index.html + {total} temas + {total} soluciones + assets/")
    print("Entrega SOLO este archivo, con un único enlace de descarga.")
    return finish(report)


def finish(report):
    for w in report.warnings:
        print(f"AVISO {w}")
    for e in report.errors:
        print(f"ERROR {e}")
    if report.errors:
        print(f"\n{len(report.errors)} error(es): corrígelos en los JSON y vuelve a ejecutar.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
