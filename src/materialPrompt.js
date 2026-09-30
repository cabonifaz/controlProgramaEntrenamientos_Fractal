// Arma el prompt para que una IA (Claude u otra, fuera de la plataforma)
// genere el material completo de un componente con la estructura que la
// plataforma espera al subir el ZIP (ver server/materials.js). El temario y
// su numeracion vienen del servidor: tema-NN.html = tema NN de esta lista.

export const MATERIAL_LEVELS = ['Básico', 'Intermedio', 'Avanzado']

export const DEFAULT_PROMPT_OPTIONS = {
  audience: '',
  level: 'Intermedio',
  sector: '',
  brand: '',
  batchSize: 'auto',
  extra: '',
}

function pad2(n) { return String(n).padStart(2, '0') }

// Cuanto contenido pedir segun la duracion real de la clase: una clase de
// 180 min no puede llevar lo mismo que una de 45 (y genera archivos mas
// grandes, por eso tambien lotes mas chicos).
function contentScale(minutes) {
  const blocks = Math.max(1, Math.round(minutes / 45))
  return {
    blocks,
    objectives: blocks >= 3 ? '4–6' : '3–4',
    examples: blocks >= 3 ? 'al menos 4' : blocks === 2 ? 'al menos 3' : 'al menos 2',
    exercises: blocks >= 3 ? '8–12' : blocks === 2 ? '5–7' : '3–5',
    questions: blocks >= 3 ? '10–15' : blocks === 2 ? '8–10' : '5–8',
    batchSize: blocks >= 3 ? 2 : blocks === 2 ? 3 : 4,
  }
}

export function suggestedBatchSize(topics) {
  return contentScale(topics?.[0]?.durationMinutes || 45).batchSize
}

function slugify(text) {
  return String(text || 'curso')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'curso'
}

// Un mismo titulo en varias filas (p.ej. un tema que ocupa dos clases) se
// marca como partes, para que la IA no repita el mismo contenido.
function topicLines(topics) {
  const totals = new Map()
  topics.forEach((t) => totals.set(t.title, (totals.get(t.title) || 0) + 1))
  const seen = new Map()
  return topics.map((t) => {
    const part = (seen.get(t.title) || 0) + 1
    seen.set(t.title, part)
    const total = totals.get(t.title)
    const partNote = total > 1 ? ` (parte ${part} de ${total}${part > 1 ? ', continúa donde terminó la parte anterior sin repetir' : ''})` : ''
    const description = t.description ? `\n    Alcance: ${t.description.trim()}` : ''
    return `${pad2(t.position)}. ${t.title}${partNote} — ${t.durationMinutes} min${description}`
  }).join('\n')
}

function durationSummary(topics) {
  const minutes = topics.reduce((sum, t) => sum + (Number(t.durationMinutes) || 0), 0)
  const hours = minutes / 60
  return `${topics.length} clases, ~${Number.isInteger(hours) ? hours : hours.toFixed(1)} h en total`
}

export function buildMaterialPrompt(data, options) {
  const o = { ...DEFAULT_PROMPT_OPTIONS, ...options }
  const topics = data.topics || []
  const n = topics.length
  const last = pad2(n)
  const classMinutes = topics[0]?.durationMinutes || 45
  const scale = contentScale(classMinutes)
  const batchSize = Math.max(1, Number(o.batchSize) || scale.batchSize)
  const batches = Math.ceil(n / batchSize)
  const zipName = `material-${slugify(data.componentName)}.zip`
  const sector = o.sector.trim()
  const audience = o.audience.trim() || '[describe aquí el perfil de los alumnos: edad, formación, experiencia previa]'

  const courseContext = [
    `- Programa: ${data.programName}${data.cohort ? ` (cohorte ${data.cohort})` : ''}${data.modality ? ` · modalidad ${data.modality.toLowerCase()}` : ''}${data.startsOn && data.endsOn ? ` · del ${data.startsOn} al ${data.endsOn}` : ''}`,
    data.programDescription ? `- Sobre el programa: ${data.programDescription.trim()}` : null,
    `- Componente (curso de este material): ${data.componentName}`,
    data.componentDescription ? `- Sobre el componente: ${data.componentDescription.trim()}` : null,
    `- Alumnos: ${audience}`,
    `- Nivel: ${o.level}`,
    sector ? `- Contextualiza TODOS los ejemplos, casos y ejercicios en: ${sector}` : null,
    `- Duración: ${durationSummary(topics)}. Cada tema se imparte en UNA clase de ${classMinutes} minutos: dimensiona el contenido para ese tiempo.`,
    scale.blocks > 1 ? `- Clases largas: organiza cada tema en ${scale.blocks} bloques de ~45 min (cada uno con explicación + práctica) y marca en el material las pausas entre bloques.` : null,
  ].filter(Boolean).join('\n')

  const workPlan = n > batchSize
    ? `El temario tiene ${n} temas. Para no recortar contenido, trabaja por lotes:
1. Primero crea el sistema de diseño compartido (assets/estilos.css y, si hace falta, assets/app.js) e index.html. Resúmeme en 3 líneas la línea visual elegida.
2. Después genera los temas en ${batches} lotes de hasta ${batchSize} temas; cada lote incluye cada tema-XX.html y su soluciones/tema-XX.html. Al terminar cada lote escribe: "Lote X/${batches} listo (temas A–B). Escribe continuar." y espera.
3. Todos los lotes deben tener la misma profundidad y calidad que el primero: no resumas ni acortes los últimos temas.
4. Tras el último lote, empaqueta todo en ${zipName}, ejecuta la verificación final y entrégame el ZIP para descargar.`
    : `1. Crea el sistema de diseño compartido (assets/estilos.css y, si hace falta, assets/app.js) e index.html.
2. Genera todos los temas con sus soluciones.
3. Empaqueta todo en ${zipName}, ejecuta la verificación final y entrégame el ZIP para descargar.`

  return `# Rol
Eres un diseñador instruccional senior y desarrollador front-end especializado en material educativo interactivo, muy visual y moderno. Vas a producir el material completo de un curso que se publicará en una plataforma de formación.

# Contexto del curso
${courseContext}

# Temario (${n} temas) — respeta EXACTAMENTE este orden y numeración
${topicLines(topics)}

# Entregable: un único archivo ${zipName}
Crea los archivos reales con tu herramienta de archivos/ejecución de código (no te limites a mostrar código en el chat) y entrégame el ZIP descargable con esta estructura exacta:

index.html                  portada del curso con el mapa del temario
tema-01.html … tema-${last}.html    un archivo por tema (${n} en total)
soluciones/tema-01.html … soluciones/tema-${last}.html    uno por tema, solo para el instructor
assets/                     estilos.css, app.js, imágenes, SVG

Reglas técnicas (la plataforma las valida y el material falla si no se cumplen):
1. Nombres exactos: tema-XX.html con dos dígitos, según la numeración del temario. Ni más ni menos archivos de tema.
2. Todas las rutas son relativas (assets/estilos.css; desde soluciones/: ../assets/estilos.css). Nada de rutas absolutas.
3. Los HTML se muestran aislados: NO uses localStorage, sessionStorage, cookies, service workers ni APIs que requieran claves o login.
4. Puedes usar Google Fonts y librerías desde CDN (cdnjs.cloudflare.com, cdn.jsdelivr.net, unpkg.com). Prefiere SVG inline para diagramas e iconos; imágenes optimizadas. ZIP final menor de 50 MB.
5. HTML5 válido, <meta charset="utf-8">, <meta name="viewport">, <title> con el número y nombre del tema, lang="es".

# Contenido de cada tema-XX.html (una clase de ${classMinutes} min)
Secciones, en este orden:
1. Cabecera: "Tema X de ${n}", título, duración, nivel, y navegación ← anterior · índice · siguiente → (el primero y el último sin el enlace que no aplica).
2. Objetivos de aprendizaje: ${scale.objectives}, con verbos medibles.
3. Punto de partida: conexión con el tema anterior o conocimientos previos, con una pregunta disparadora.
4. Desarrollo conceptual en bloques cortos: diagramas SVG, tarjetas, tablas comparativas, líneas de tiempo o flujos, analogías. Nada de muros de texto.
5. Ejemplos resueltos: ${scale.examples}, paso a paso${sector ? `, ambientados en ${sector}` : ''}.
6. Práctica guiada: un caso que se resuelve en clase junto al instructor.
7. Ejercicios: ${scale.exercises}, numerados "Ejercicio 1…", con dificultad marcada (básico / intermedio / reto), enunciado autocontenido, datos necesarios y qué debe entregar el alumno.
8. Cuestionario de repaso: ${scale.questions} preguntas numeradas "Pregunta 1…" (opción múltiple, verdadero/falso, respuesta corta). Puede ser interactivo (marcar opciones), pero SIN corrección ni feedback de acierto.
9. Ideas clave: 4–6 puntos de resumen y un mini glosario del tema.
10. Para profundizar (opcional): 2–3 recursos o sugerencias de lectura.

PROHIBIDO en tema-XX.html: respuestas, soluciones, pistas que las revelen, corrección automática, o soluciones ocultas en CSS, JavaScript, comentarios HTML o atributos data-*. Los alumnos pueden ver el código fuente.

# Contenido de cada soluciones/tema-XX.html (solo instructor)
1. Solución de cada Ejercicio y Pregunta, con la MISMA numeración que el tema, explicando el razonamiento (no solo el resultado).
2. Errores frecuentes de los alumnos y cómo reconducirlos.
3. Rúbrica breve para los ejercicios abiertos.
4. Guía docente: plan minuto a minuto de los ${classMinutes} min, preguntas para dinamizar y qué recortar o ampliar si falta o sobra tiempo.
5. Enlace de vuelta al tema (../tema-XX.html). Con un distintivo visible "Solo instructor".

# index.html
Portada del curso: nombre, descripción, objetivos generales, a quién va dirigido y mapa del temario con enlaces a cada tema. Sin enlaces a soluciones/.

# Diseño visual
- Moderno y muy visual: portada con degradado, tarjetas, iconografía coherente, diagramas SVG, callouts de "Importante", "Tip" y "Error común", bloques de código con resaltado de sintaxis si el tema lo requiere.
- Un único sistema de diseño en assets/estilos.css: todos los temas deben verse como el mismo curso (colores, tipografía, componentes).
${o.brand.trim() ? `- Identidad visual: ${o.brand.trim()}.\n` : ''}- Responsive: se ve bien en móvil, portátil y proyector (tipografía base ≥ 18px, buen contraste WCAG AA, alt en imágenes). Incluye estilos de impresión.
- Idioma: español neutro, tono cercano y profesional.
${o.extra.trim() ? `\n# Indicaciones adicionales\n${o.extra.trim()}\n` : ''}
# Forma de trabajo
${workPlan}

# Verificación final (compruébala y repórtala antes de entregar el ZIP)
- Existen tema-01.html … tema-${last}.html y soluciones/tema-01.html … soluciones/tema-${last}.html (${n} de cada uno).
- Ningún tema-XX.html contiene respuestas ni pistas que las revelen.
- La numeración de ejercicios y preguntas coincide entre cada tema y su solución.
- Todos los enlaces (anterior, siguiente, índice, assets) usan rutas relativas y funcionan.
- No se usa localStorage, sessionStorage ni cookies.
- Los archivos están en la raíz del ZIP (o dentro de una única carpeta).`
}
