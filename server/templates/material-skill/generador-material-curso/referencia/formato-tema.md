# Formato de `temas/tema-NN.json`

Los campos de texto aceptan **HTML inline** (`<strong>`, `<code>`, `<ul>`, `<table>`, `<svg>`, `<pre><code class="language-sql">`…). Escapa `<` como `&lt;` dentro del código. Usa solo rutas relativas y nada de `localStorage`, `sessionStorage` ni cookies.

| Campo | Obligatorio | Qué es |
|---|---|---|
| `numero` | sí | Igual al número del archivo (`tema-03.json` → `3`). |
| `titulo` | no | Si se omite, se usa el de `curso.json`. |
| `resumen` | no | Una frase bajo el título. |
| `objetivos` | sí | Lista de 3–6 objetivos con verbos medibles. |
| `punto_de_partida` | no | `{texto, pregunta}`: conexión con lo anterior y pregunta disparadora. |
| `bloques` | sí | Desarrollo: `[{titulo, html, callouts?: [{tipo, texto}], pausa_despues?}]`. `tipo`: `importante`, `tip`, `error` o `nota`. |
| `ejemplos` | recomendado | `[{titulo, contexto?, pasos: [html], resultado?}]` resueltos paso a paso. |
| `practica_guiada` | recomendado | `{titulo, html}`: caso que se resuelve en clase con el instructor. |
| `ejercicios` | sí | `[{titulo?, nivel, enunciado, entregable?, solucion, rubrica?}]`. `nivel`: `basico`, `intermedio` o `reto`. |
| `preguntas` | sí | `[{tipo, enunciado, opciones?, respuesta, explicacion?}]` (ver abajo). |
| `ideas_clave` | sí | 4–6 frases de resumen. |
| `glosario` | no | `[{termino, definicion}]`. |
| `recursos` | no | `[{titulo, url?, nota?}]`. |
| `guia_docente` | sí | `{plan: [{minutos, actividad}], dinamizar?: [], errores_frecuentes?: [{error, como_reconducir}], si_falta_tiempo?, si_sobra_tiempo?}`. |

Tipos de pregunta:

- `opcion`: `opciones` es una lista (2–5) y `respuesta` es la **letra** de la correcta (`"B"`).
- `vf`: `respuesta` es `true` o `false`.
- `corta`: `respuesta` es el texto de la respuesta esperada.

Cantidades mínimas según la duración de la clase (el script avisa si quedas por debajo):

| Clase | Ejemplos | Ejercicios | Preguntas |
|---|---|---|---|
| ~45 min | 2 | 3 | 5 |
| ~90 min | 3 | 5 | 8 |
| 135 min o más | 4 | 8 | 10 |

Qué hace el script con cada campo:

- Los enunciados van al material del alumno (`tema-NN.html`).
- `solucion`, `respuesta`, `explicacion`, `rubrica` y `guia_docente` van **solo** a `soluciones/tema-NN.html`, con la misma numeración.
- Ejercicios y preguntas se numeran solos, en el orden de la lista.

## Ejemplo mínimo (amplíalo: un tema real lleva más contenido)

```json
{
  "numero": 1,
  "resumen": "Cómo guardar archivos en la nube de forma segura y barata.",
  "objetivos": ["Explicar qué es un bucket de S3", "Configurar permisos de un bucket", "Elegir la clase de almacenamiento adecuada"],
  "punto_de_partida": {"texto": "Todo banco guarda millones de documentos digitalizados.", "pregunta": "¿Dónde guardarías 10 millones de extractos al mes?"},
  "bloques": [
    {
      "titulo": "Buckets y objetos",
      "html": "<p>Un <strong>bucket</strong> es un contenedor de objetos…</p><figure><svg viewBox=\"0 0 400 120\">…</svg><figcaption>Bucket con objetos</figcaption></figure>",
      "callouts": [{"tipo": "error", "texto": "Dejar un bucket público por error expone datos de clientes."}],
      "pausa_despues": true
    }
  ],
  "ejemplos": [
    {"titulo": "Subir extractos mensuales", "pasos": ["Crear el bucket <code>extractos-2026</code>", "Activar el cifrado por defecto"], "resultado": "<p>Los extractos quedan cifrados en reposo.</p>"}
  ],
  "practica_guiada": {"titulo": "Política de ciclo de vida", "html": "<p>Entre todos, definimos cuándo mover los extractos a Glacier…</p>"},
  "ejercicios": [
    {"nivel": "basico", "enunciado": "<p>Crea un bucket privado para documentos de clientes.</p>", "entregable": "Captura de la configuración", "solucion": "<p>Bloquear el acceso público, activar el cifrado SSE-S3…</p>", "rubrica": "Bucket privado (50 %), cifrado activo (50 %)"}
  ],
  "preguntas": [
    {"tipo": "opcion", "enunciado": "¿Qué clase conviene para extractos que casi nunca se consultan?", "opciones": ["S3 Standard", "S3 Glacier", "EBS"], "respuesta": "B", "explicacion": "Glacier es más barato para datos de acceso poco frecuente."},
    {"tipo": "vf", "enunciado": "Un bucket nuevo es público por defecto.", "respuesta": false},
    {"tipo": "corta", "enunciado": "¿Qué servicio registra quién accedió a un objeto?", "respuesta": "CloudTrail (eventos de datos de S3) o los server access logs."}
  ],
  "ideas_clave": ["S3 guarda objetos en buckets", "Los buckets son privados por defecto", "Cifra siempre en reposo", "Usa ciclos de vida para ahorrar"],
  "glosario": [{"termino": "Bucket", "definicion": "Contenedor de objetos en S3."}],
  "guia_docente": {
    "plan": [{"minutos": "0–10", "actividad": "Pregunta disparadora y lluvia de ideas"}, {"minutos": "10–45", "actividad": "Bloque 1 + ejemplo 1"}],
    "dinamizar": ["¿Qué pasaría si un bucket de extractos quedara público?"],
    "errores_frecuentes": [{"error": "Confundir S3 con un disco (EBS)", "como_reconducir": "Comparar con una tabla: objeto vs bloque"}],
    "si_falta_tiempo": "Dejar el ejercicio reto como tarea.",
    "si_sobra_tiempo": "Mostrar las URLs prefirmadas."
  }
}
```
