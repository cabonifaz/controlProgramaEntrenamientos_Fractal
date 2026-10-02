---
name: generador-material-curso
description: Genera el material didáctico completo de un curso (un HTML visual por tema, soluciones solo para el instructor, portada) y lo entrega como UN único ZIP listo para subir a la plataforma de entrenamiento. Úsala cuando te pidan el material de un curso/componente a partir de un temario en JSON.
---

# Generador de material de curso

Tú escribes SOLO el contenido de cada tema, en JSON. El diseño, el HTML, la navegación, la separación de respuestas y el ZIP los pone `scripts/build_course.py`. No escribas HTML de páginas completas, CSS ni JavaScript.

## Flujo

1. Lee `referencia/formato-tema.md` una vez: formato exacto de cada tema con un ejemplo.
2. Crea una carpeta de trabajo, por ejemplo `curso/`, y guarda en `curso/curso.json` el JSON del curso que te dieron. Complétalo con:
   - `objetivos_generales`: 4–6 objetivos del curso.
   - `colores` (opcional): `{"primario": "#RRGGBB", "acento": "#RRGGBB"}`. Si te dieron una identidad visual en texto, conviértela a estos dos colores.
3. Por cada tema `N` del curso, escribe `curso/temas/tema-NN.json` (dos dígitos: `tema-01.json`). Escribe los archivos directamente con tu herramienta de archivos. **No pegues el JSON en el chat.**
4. Después de cada lote, valida:
   `python scripts/build_course.py --curso curso/curso.json --temas curso/temas --solo-validar`
   Corrige todos los `ERROR` y revisa los `AVISO` (cantidades por debajo de lo esperado para la duración de la clase).
5. Cuando estén todos los temas, genera el ZIP en tu carpeta de salidas (en Claude.ai es `/mnt/user-data/outputs/`):
   `python scripts/build_course.py --curso curso/curso.json --temas curso/temas --salida /mnt/user-data/outputs/<zip de curso.json>`
6. Entrega **solo ese ZIP**, con un único enlace de descarga. Nunca entregues varios ZIPs, ZIPs parciales por lote ni los JSON sueltos.

## Lotes y respuestas en el chat

- Si te piden trabajar por lotes, al terminar cada lote responde en 1–2 líneas: `Lote X/Y listo (temas A–B), validado. Escribe continuar.`
- No resumas en el chat lo que escribiste en los archivos: gasta tiempo y no le sirve a nadie.
- Antes del ZIP final, confirma que siguen en la carpeta los JSON de todos los lotes. Si falta alguno, regéneralo.

## Calidad del contenido

- Respeta el número, el orden, el título y el alcance de cada tema. Si un tema es "parte 2 de 2", continúa la parte anterior sin repetirla.
- Dimensiona el tema para la duración de la clase (`duracion_clase_min`). En clases de 90 min o más, reparte el desarrollo en bloques de ~45 min y marca `"pausa_despues": true` entre ellos.
- Hazlo visual: diagramas SVG inline (con `viewBox`, sin tamaños fijos), tablas comparativas, callouts y código con `<pre><code class="language-xxx">`.
- Ambienta los ejemplos y ejercicios en el sector indicado, si lo hay, y escribe para el perfil y el nivel de los alumnos.
- Las respuestas van SOLO en los campos de respuesta (`solucion`, `respuesta`, `explicacion`, `rubrica`, `guia_docente`). Jamás pongas una respuesta o pista que la revele en un enunciado: los alumnos pueden ver el código fuente. El script lo comprueba.
- Español neutro, tono cercano y profesional.
