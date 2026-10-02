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
  // 'skill': prompt corto que usa la skill generador-material-curso
  // (Claude solo escribe JSON; el script pone HTML, diseno y ZIP).
  // 'full': prompt completo para usar sin la skill.
  mode: 'skill',
}

export const SKILL_NAME = 'generador-material-curso'

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

// Con la skill la IA solo escribe JSON (sin HTML ni CSS): caben el doble
// de temas por lote.
export function suggestedBatchSize(topics, mode = 'skill') {
  const base = contentScale(topics?.[0]?.durationMinutes || 45).batchSize
  return mode === 'skill' ? base * 2 : base
}

function slugify(text) {
  return String(text || 'curso')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'curso'
}

// Un mismo titulo en varias filas (p.ej. un tema que ocupa dos clases) se
// marca como partes, para que la IA no repita el mismo contenido.
function topicParts(topics) {
  const totals = new Map()
  topics.forEach((t) => totals.set(t.title, (totals.get(t.title) || 0) + 1))
  const seen = new Map()
  return topics.map((t) => {
    const part = (seen.get(t.title) || 0) + 1
    seen.set(t.title, part)
    return { part, total: totals.get(t.title) }
  })
}

function topicLines(topics) {
  const parts = topicParts(topics)
  return topics.map((t, i) => {
    const { part, total } = parts[i]
    const partNote = total > 1 ? ` (parte ${part} de ${total}${part > 1 ? ', continúa donde terminó la parte anterior sin repetir' : ''})` : ''
    const description = t.description ? `\n    Alcance: ${t.description.trim()}` : ''
    return `${pad2(t.position)}. ${t.title}${partNote} — ${t.durationMinutes} min${description}`
  }).join('\n')
}

// Arbol exacto del ZIP, archivo por archivo: si solo se describe con
// "tema-01 … tema-NN", la IA tiende a inventar su propia organizacion
// (un ZIP por lote, carpetas por tema, soluciones aparte...).
function fileTree(topics, zipName) {
  const width = Math.max(...topics.map((t) => `tema-${pad2(t.position)}.html`.length), 'index.html'.length) + 4
  const col = (name) => name.padEnd(width)
  const branch = (i, total) => (i === total - 1 ? '└──' : '├──')
  return [
    zipName,
    `├── ${col('index.html')}portada del curso`,
    ...topics.map((t) => `├── ${col(`tema-${pad2(t.position)}.html`)}Tema ${t.position}: ${t.title}`),
    '├── soluciones/',
    ...topics.map((t, i) => `│   ${branch(i, topics.length)} ${col(`tema-${pad2(t.position)}.html`)}soluciones del tema ${t.position}`),
    '└── assets/',
    `    ├── ${col('estilos.css')}sistema de diseño compartido`,
    `    ├── ${col('app.js')}(opcional) interactividad compartida`,
    `    └── ${col('img/')}(opcional) imágenes y SVG`,
  ].join('\n')
}

function durationSummary(topics) {
  const minutes = topics.reduce((sum, t) => sum + (Number(t.durationMinutes) || 0), 0)
  const hours = minutes / 60
  return `${topics.length} clases, ~${Number.isInteger(hours) ? hours : hours.toFixed(1)} h en total`
}

export function buildMaterialPrompt(data, options) {
  const o = { ...DEFAULT_PROMPT_OPTIONS, ...options }
  return o.mode === 'skill' ? buildSkillPrompt(data, o) : buildFullPrompt(data, o)
}

// Prompt corto para la skill: los datos del curso en el JSON que espera
// scripts/build_course.py y solo las reglas de entrega. Formato, calidad,
// diseno y validacion ya viven en la skill y no se repiten aqui.
function buildSkillPrompt(data, o) {
  const topics = data.topics || []
  const n = topics.length
  const parts = topicParts(topics)
  const batchSize = Math.max(1, Number(o.batchSize) || suggestedBatchSize(topics, 'skill'))
  const batches = Math.ceil(n / batchSize)
  const zipName = `material-${slugify(data.componentName)}.zip`
  const description = [data.componentDescription, data.programDescription].map((d) => d?.trim()).filter(Boolean).join(' ')

  const curso = {
    curso: data.componentName,
    programa: [data.programName, data.cohort && `cohorte ${data.cohort}`, data.modality && `modalidad ${data.modality.toLowerCase()}`].filter(Boolean).join(' · '),
    descripcion: description || undefined,
    alumnos: o.audience.trim() || '[describe aquí el perfil de los alumnos]',
    nivel: o.level,
    sector: o.sector.trim() || undefined,
    identidad_visual: o.brand.trim() || undefined,
    indicaciones: o.extra.trim() || undefined,
    duracion_clase_min: topics[0]?.durationMinutes || 45,
    zip: zipName,
    temas: topics.map((t, i) => ({
      numero: t.position,
      titulo: t.title,
      alcance: t.description?.trim() || undefined,
      parte: parts[i].total > 1 ? `${parts[i].part} de ${parts[i].total}` : undefined,
    })),
  }

  const workLine = n > batchSize
    ? `- Trabaja en ${batches} lotes de hasta ${batchSize} temas. Tras cada lote, valida con el script y responde solo: "Lote X/${batches} listo (temas A–B), validado. Escribe continuar."`
    : '- Genera todos los temas, valídalos con el script y empaqueta.'
  const fence = '```'

  return [
    `Usa la skill ${SKILL_NAME} para crear el material completo de este curso (${n} temas). Guarda este JSON como curso/curso.json, complétalo como indica la skill y sigue su flujo:`,
    '',
    `${fence}json`,
    JSON.stringify(curso, null, 2),
    fence,
    '',
    workLine,
    '- No pegues el contenido en el chat: escribe los JSON directamente en archivos.',
    `- Entrega final: UN SOLO archivo, ${zipName}, generado por el script de la skill y con un único enlace de descarga. Nunca entregues varios ZIPs ni HTML escritos a mano.`,
  ].join('\n')
}

function buildFullPrompt(data, o) {
  const topics = data.topics || []
  const n = topics.length
  const last = pad2(n)
  const classMinutes = topics[0]?.durationMinutes || 45
  const scale = contentScale(classMinutes)
  const batchSize = Math.max(1, Number(o.batchSize) || suggestedBatchSize(topics, 'full'))
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
2. Después genera los temas en ${batches} lotes de hasta ${batchSize} temas; cada lote incluye cada tema-XX.html y su soluciones/tema-XX.html. Guarda los archivos en la carpeta de trabajo del curso, SIN crear ningún ZIP ni enlace de descarga. Al terminar cada lote escribe: "Lote X/${batches} listo (temas A–B). Escribe continuar." y espera.
3. No pegues el contenido de los archivos en el chat (solo el aviso de cada lote): ahorra mucho tiempo.
4. Todos los lotes deben tener la misma profundidad y calidad que el primero: no resumas ni acortes los últimos temas.
5. Solo tras el último lote: comprueba que siguen en la carpeta los archivos de TODOS los lotes (si falta alguno, regéneralo), ejecuta la verificación final y crea el único ${zipName}.`
    : `1. Crea el sistema de diseño compartido (assets/estilos.css y, si hace falta, assets/app.js) e index.html.
2. Genera todos los temas con sus soluciones.
3. Ejecuta la verificación final y crea el único ${zipName}.`

  return `# Rol
Eres un diseñador instruccional senior y desarrollador front-end especializado en material educativo interactivo, muy visual y moderno. Vas a producir el material completo de un curso que se publicará en una plataforma de formación.

# Contexto del curso
${courseContext}

# Temario (${n} temas) — respeta EXACTAMENTE este orden y numeración
${topicLines(topics)}

# Formato de entrega (OBLIGATORIO)
Crea los archivos reales con tu herramienta de archivos/ejecución de código (no te limites a mostrar código en el chat). La plataforma solo acepta UN archivo por curso, así que la entrega es exactamente esta:

- UN SOLO archivo ZIP llamado ${zipName}, con un único enlace de descarga en tu mensaje final.
- NO lo dividas: ni un ZIP por lote, ni por tema, ni uno aparte para soluciones/ o assets/, ni ZIPs dentro del ZIP. Si te ves tentado a partirlo por tamaño, reduce las imágenes (usa SVG) en lugar de dividir.
- Los archivos van directamente en la raíz del ZIP (al abrirlo se ve index.html, no una carpeta que lo contenga).
- Nada fuera de este árbol (sin README, notas ni archivos de borrador). Contenido exacto del ZIP (${2 * n + 2} archivos HTML/CSS obligatorios):

${fileTree(topics, zipName)}

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
- Entregas UN SOLO archivo, ${zipName}, y su listado de contenido coincide exactamente con el árbol de "Formato de entrega".
- Existen tema-01.html … tema-${last}.html y soluciones/tema-01.html … soluciones/tema-${last}.html (${n} de cada uno).
- Ningún tema-XX.html contiene respuestas ni pistas que las revelen.
- La numeración de ejercicios y preguntas coincide entre cada tema y su solución.
- Todos los enlaces (anterior, siguiente, índice, assets) usan rutas relativas y funcionan.
- No se usa localStorage, sessionStorage ni cookies.
- index.html, los tema-XX.html y las carpetas soluciones/ y assets/ están en la raíz del ZIP.`
}
