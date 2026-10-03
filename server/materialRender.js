import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Arma las paginas del material (index, tema-NN, soluciones/tema-NN) a
// partir del CONTENIDO en JSON que escribe cualquier IA. La IA no escribe
// HTML ni CSS: el diseno, la marca del tenant (color + logo) y la
// separacion de respuestas los pone la plataforma. Mismo formato y mismo
// diseno que la skill generador-material-curso (scripts/build_course.py),
// cuyos assets se reutilizan aqui como unica fuente.

const SKILL_ASSETS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'templates', 'material-skill', 'generador-material-curso', 'assets')
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/
const FORBIDDEN = /localStorage|sessionStorage|document\.cookie|serviceWorker/
const ABSOLUTE_PATH = /(?:src|href)\s*=\s*["'](?:\/(?!\/)|[a-zA-Z]:\\|file:)/
const LEVEL_LABEL = { basico: 'Básico', 'básico': 'Básico', intermedio: 'Intermedio', reto: 'Reto' }
const CALLOUT_LABEL = { importante: 'Importante', tip: 'Tip', error: 'Error común', nota: 'Nota' }
const QUESTION_TYPES = new Set(['opcion', 'vf', 'corta'])

const esc = (text) => String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const pad2 = (n) => String(n).padStart(2, '0')
const asList = (value) => (Array.isArray(value) ? value : [])
const html = (value) => (value === null || value === undefined ? '' : String(value))
const stripTags = (text) => String(text ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()

export function expectedCounts(minutes) {
  const blocks = Math.max(1, Math.round((minutes || 45) / 45))
  if (blocks >= 3) return { ejercicios: 8, preguntas: 10, ejemplos: 4 }
  if (blocks === 2) return { ejercicios: 5, preguntas: 8, ejemplos: 3 }
  return { ejercicios: 3, preguntas: 5, ejemplos: 2 }
}

function answerIndex(q) {
  const options = asList(q.opciones)
  const a = q.respuesta
  let idx = null
  if (typeof a === 'string' && /^[a-z]$/i.test(a.trim())) idx = a.trim().toUpperCase().charCodeAt(0) - 65
  else if (Number.isInteger(a)) idx = a - 1
  else if (typeof a === 'string' && /^\d+$/.test(a.trim())) idx = Number(a.trim()) - 1
  return idx !== null && idx >= 0 && idx < options.length ? idx : null
}

function* walkStrings(value, p = '') {
  if (typeof value === 'string') yield [p, value]
  else if (Array.isArray(value)) for (let i = 0; i < value.length; i++) yield* walkStrings(value[i], `${p}[${i}]`)
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) yield* walkStrings(v, p ? `${p}.${k}` : k)
}

// Errores impiden publicar ESE tema; avisos solo informan.
export function validateTopic(tema, numero, classMinutes) {
  const errors = []
  const warnings = []
  for (const field of ['objetivos', 'bloques', 'ejercicios', 'preguntas', 'ideas_clave']) {
    if (!asList(tema[field]).length) errors.push(`falta "${field}"`)
  }
  if (!asList(tema.guia_docente?.plan).length) errors.push('falta "guia_docente.plan"')
  asList(tema.bloques).forEach((b, i) => { if (!b?.titulo || !b?.html) errors.push(`bloque ${i + 1}: necesita "titulo" y "html"`) })
  asList(tema.ejercicios).forEach((e, i) => {
    if (!e?.enunciado || !e?.solucion) errors.push(`Ejercicio ${i + 1}: necesita "enunciado" y "solucion"`)
    if (e?.nivel && !LEVEL_LABEL[String(e.nivel).toLowerCase()]) errors.push(`Ejercicio ${i + 1}: "nivel" debe ser basico, intermedio o reto`)
  })
  asList(tema.preguntas).forEach((q, i) => {
    if (!QUESTION_TYPES.has(q?.tipo)) errors.push(`Pregunta ${i + 1}: "tipo" debe ser opcion, vf o corta`)
    else if (q.tipo === 'opcion' && (asList(q.opciones).length < 2 || answerIndex(q) === null)) errors.push(`Pregunta ${i + 1}: necesita 2+ "opciones" y "respuesta" como letra`)
    else if (q.tipo === 'vf' && typeof q.respuesta !== 'boolean') errors.push(`Pregunta ${i + 1}: "respuesta" debe ser true o false`)
    else if (q.tipo === 'corta' && !q.respuesta) errors.push(`Pregunta ${i + 1}: falta "respuesta"`)
    if (!q?.enunciado) errors.push(`Pregunta ${i + 1}: falta "enunciado"`)
  })
  for (const [p, text] of walkStrings(tema)) {
    if (FORBIDDEN.test(text)) errors.push(`${p}: no se permite localStorage/sessionStorage/cookies`)
    if (ABSOLUTE_PATH.test(text)) errors.push(`${p}: usa rutas relativas`)
  }
  const expected = expectedCounts(classMinutes)
  for (const [field, min] of Object.entries(expected)) {
    const count = asList(tema[field]).length
    if (count > 0 && count < min) warnings.push(`${count} ${field} (para ${classMinutes} min se esperan al menos ${min})`)
  }
  return { errors, warnings, numero }
}

function leakErrors(tema, studentPage) {
  const visible = stripTags(studentPage)
  const errors = []
  const candidates = [
    ...asList(tema.ejercicios).map((e, i) => ['Ejercicio', i + 1, e?.solucion]),
    ...asList(tema.preguntas).map((q, i) => ['Pregunta', i + 1, q?.explicacion]),
  ]
  for (const [label, i, answer] of candidates) {
    const text = stripTags(answer)
    if (text.length >= 40 && visible.includes(text.slice(0, 80))) errors.push(`${label} ${i}: su respuesta aparece en el material del alumno`)
  }
  return errors
}

// ------------------------------------------------------------------ render

function head(title, rel, course) {
  const brand = HEX_COLOR.test(course.brandColor || '') ? `<style>:root{--primario:${course.brandColor}}</style>` : ''
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Space+Grotesk:wght@500;700&display=swap">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css">
<link rel="stylesheet" href="${rel}assets/estilos.css">
${brand}
</head>
<body>
`
}

const foot = (rel) => `<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
<script src="${rel}assets/app.js"></script>
</body>
</html>
`

function hero(course, tag, title, subtitle, meta, extraClass = '') {
  const chips = meta.filter(Boolean).map((m) => `<span class="chip">${esc(m)}</span>`).join('')
  const logo = course.logoUrl ? `<img class="brand-logo" src="${esc(course.logoUrl)}" alt="${esc(course.tenantName)}">` : ''
  return `<header class="hero ${extraClass}"><div class="wrap">
${logo}<span class="tag">${esc(tag)}</span>
<h1>${esc(title)}</h1>
${subtitle ? `<p class="subtitle">${subtitle}</p>` : ''}
<div class="chips">${chips}</div>
</div></header>
`
}

const section = (anchor, title, body, extraClass = '') => `<section class="card ${extraClass}" id="${anchor}"><h2>${esc(title)}</h2>${body}</section>\n`

function callouts(items) {
  return asList(items).map((c) => {
    const kind = String(c?.tipo || 'nota').toLowerCase()
    return `<div class="callout callout-${esc(kind)}"><strong>${CALLOUT_LABEL[kind] || 'Nota'}</strong><div>${html(c?.texto)}</div></div>`
  }).join('')
}

function levelBadge(level) {
  const key = String(level || '').toLowerCase()
  return LEVEL_LABEL[key] ? `<span class="level level-${key.replace('á', 'a')}">${LEVEL_LABEL[key]}</span>` : ''
}

function topicNav(n, total, available) {
  const link = (num, label) => (available.has(num) ? `<a href="tema-${pad2(num)}.html">${label}</a>` : '<span></span>')
  return `<nav class="topic-nav">${n > 1 ? link(n - 1, `← Tema ${n - 1}`) : '<span></span>'}<a href="index.html">Índice del curso</a>${n < total ? link(n + 1, `Tema ${n + 1} →`) : '<span></span>'}</nav>`
}

const topicMeta = (course, info) => [`${course.classMinutes} min`, info.parte ? `Parte ${info.parte}` : null, course.tenantName]

function renderTopic(course, tema, info, available) {
  const n = info.numero
  const total = course.topics.length
  const title = info.titulo
  const toc = [['objetivos', 'Objetivos'], ['partida', 'Punto de partida'], ['desarrollo', 'Desarrollo'], ['ejemplos', 'Ejemplos'],
    ['practica', 'Práctica guiada'], ['ejercicios', 'Ejercicios'], ['cuestionario', 'Cuestionario'], ['ideas', 'Ideas clave']]
  let out = head(`Tema ${n} · ${title}`, '', course)
  out += hero(course, `Tema ${n} de ${total}`, title, html(tema.resumen), topicMeta(course, info))
  out += '<main class="wrap">' + topicNav(n, total, available)
  out += '<nav class="toc">' + toc.map(([a, t]) => `<a href="#${a}">${t}</a>`).join('') + '</nav>'
  out += section('objetivos', 'Objetivos de aprendizaje', `<ul class="goals">${asList(tema.objetivos).map((o) => `<li>${html(o)}</li>`).join('')}</ul>`)
  const partida = tema.punto_de_partida || {}
  if (partida.texto || partida.pregunta) {
    out += section('partida', 'Punto de partida', `<p>${html(partida.texto)}</p>${partida.pregunta ? `<p class="hook">${html(partida.pregunta)}</p>` : ''}`)
  }
  out += '<div id="desarrollo"></div>'
  asList(tema.bloques).forEach((b, i) => {
    out += section(`bloque-${i + 1}`, b.titulo || '', html(b.html) + callouts(b.callouts))
    if (b.pausa_despues) out += '<div class="pause">☕ Pausa</div>'
  })
  const ejemplos = asList(tema.ejemplos)
  if (ejemplos.length) {
    out += section('ejemplos', 'Ejemplos resueltos', ejemplos.map((ej, i) => (
      `<article class="example"><h3>Ejemplo ${i + 1}: ${esc(ej.titulo)}</h3>${html(ej.contexto)}<ol class="steps">${asList(ej.pasos).map((p) => `<li>${html(p)}</li>`).join('')}</ol>${ej.resultado ? `<div class="result">${html(ej.resultado)}</div>` : ''}</article>`
    )).join(''))
  }
  if (tema.practica_guiada?.html) {
    out += section('practica', `Práctica guiada${tema.practica_guiada.titulo ? `: ${tema.practica_guiada.titulo}` : ''}`, html(tema.practica_guiada.html), 'practice')
  }
  out += section('ejercicios', 'Ejercicios', asList(tema.ejercicios).map((e, i) => (
    `<article class="exercise"><h3>Ejercicio ${i + 1}${e.titulo ? `: ${esc(e.titulo)}` : ''} ${levelBadge(e.nivel)}</h3>${html(e.enunciado)}${e.entregable ? `<p class="deliverable"><strong>Entrega:</strong> ${html(e.entregable)}</p>` : ''}</article>`
  )).join(''))
  out += section('cuestionario', 'Cuestionario de repaso', asList(tema.preguntas).map((q, i) => {
    let body = `<fieldset class="question"><legend>Pregunta ${i + 1}</legend><div class="q-text">${html(q.enunciado)}</div>`
    if (q.tipo === 'opcion') body += asList(q.opciones).map((o, j) => `<label><input type="radio" name="p${i + 1}"> <span>${String.fromCharCode(65 + j)}. ${html(o)}</span></label>`).join('')
    else if (q.tipo === 'vf') body += `<label><input type="radio" name="p${i + 1}"> <span>Verdadero</span></label><label><input type="radio" name="p${i + 1}"> <span>Falso</span></label>`
    else body += '<textarea rows="3" placeholder="Tu respuesta"></textarea>'
    return `${body}</fieldset>`
  }).join(''), 'quiz')
  let ideas = `<ul class="key-ideas">${asList(tema.ideas_clave).map((k) => `<li>${html(k)}</li>`).join('')}</ul>`
  if (asList(tema.glosario).length) ideas += `<h3>Glosario</h3><dl class="glossary">${tema.glosario.map((g) => `<dt>${esc(g.termino)}</dt><dd>${html(g.definicion)}</dd>`).join('')}</dl>`
  out += section('ideas', 'Ideas clave', ideas)
  if (asList(tema.recursos).length) {
    out += section('recursos', 'Para profundizar', `<ul>${tema.recursos.map((r) => {
      const label = esc(r.titulo) + (r.nota ? ` — ${html(r.nota)}` : '')
      return /^https?:\/\//i.test(r.url || '') ? `<li><a href="${esc(r.url)}" target="_blank" rel="noopener">${label}</a></li>` : `<li>${label}</li>`
    }).join('')}</ul>`)
  }
  return out + topicNav(n, total, available) + '</main>' + foot('')
}

function renderSolution(course, tema, info) {
  const n = info.numero
  let out = head(`Soluciones · Tema ${n} · ${info.titulo}`, '../', course)
  out += hero(course, 'Solo instructor', `Soluciones · Tema ${n}`, esc(info.titulo), topicMeta(course, info), 'hero-instructor')
  out += `<main class="wrap"><nav class="topic-nav"><span></span><a href="../tema-${pad2(n)}.html">← Volver al tema ${n}</a><span></span></nav>`
  out += section('ejercicios', 'Ejercicios', asList(tema.ejercicios).map((e, i) => (
    `<article class="exercise"><h3>Ejercicio ${i + 1}${e.titulo ? `: ${esc(e.titulo)}` : ''} ${levelBadge(e.nivel)}</h3><details class="statement"><summary>Ver enunciado</summary>${html(e.enunciado)}</details><div class="answer">${html(e.solucion)}</div>${e.rubrica ? `<p class="rubric"><strong>Rúbrica:</strong> ${html(e.rubrica)}</p>` : ''}</article>`
  )).join(''))
  out += section('preguntas', 'Cuestionario', asList(tema.preguntas).map((q, i) => {
    let body = `<article class="question-answer"><h3>Pregunta ${i + 1}</h3><div class="q-text">${html(q.enunciado)}</div>`
    if (q.tipo === 'opcion') {
      const correct = answerIndex(q)
      body += `<ul class="options">${asList(q.opciones).map((o, j) => `<li class="${j === correct ? 'correct' : ''}">${String.fromCharCode(65 + j)}. ${html(o)}${j === correct ? ' ✓' : ''}</li>`).join('')}</ul>`
    } else if (q.tipo === 'vf') {
      body += `<p class="answer"><strong>${q.respuesta ? 'Verdadero' : 'Falso'}</strong></p>`
    } else {
      body += `<div class="answer">${html(q.respuesta)}</div>`
    }
    return `${body}${q.explicacion ? `<p class="explanation">${html(q.explicacion)}</p>` : ''}</article>`
  }).join(''))
  const guia = tema.guia_docente || {}
  let body = '<table class="plan"><thead><tr><th>Minutos</th><th>Actividad</th></tr></thead><tbody>'
  body += asList(guia.plan).map((p) => `<tr><td>${esc(p.minutos)}</td><td>${html(p.actividad)}</td></tr>`).join('') + '</tbody></table>'
  if (asList(guia.dinamizar).length) body += `<h3>Preguntas para dinamizar</h3><ul>${guia.dinamizar.map((d) => `<li>${html(d)}</li>`).join('')}</ul>`
  if (asList(guia.errores_frecuentes).length) body += `<h3>Errores frecuentes</h3><ul class="mistakes">${guia.errores_frecuentes.map((e) => `<li><strong>${html(e.error)}</strong> — ${html(e.como_reconducir)}</li>`).join('')}</ul>`
  if (guia.si_falta_tiempo || guia.si_sobra_tiempo) {
    body += `<div class="grid-2"><div class="callout callout-tip"><strong>Si falta tiempo</strong><div>${html(guia.si_falta_tiempo) || '—'}</div></div><div class="callout callout-nota"><strong>Si sobra tiempo</strong><div>${html(guia.si_sobra_tiempo) || '—'}</div></div></div>`
  }
  out += section('guia', 'Guía docente', body)
  return out + '</main>' + foot('../')
}

function renderIndex(course, available) {
  const total = course.topics.length
  let out = head(course.componentName, '', course)
  out += hero(course, 'Material del curso', course.componentName, esc(course.componentDescription || ''),
    [course.programName, `${total} temas`, `${course.classMinutes} min por clase`, course.tenantName])
  const cards = course.topics.map((t) => {
    const part = t.parte ? `<small>Parte ${esc(t.parte)}</small>` : ''
    const inner = `<span class="num">${pad2(t.numero)}</span><span><strong>${esc(t.titulo)}</strong>${part}${available.has(t.numero) ? '' : '<small>Próximamente</small>'}</span>`
    return available.has(t.numero) ? `<a class="topic-card" href="tema-${pad2(t.numero)}.html">${inner}</a>` : `<div class="topic-card topic-card-pending">${inner}</div>`
  }).join('')
  out += `<main class="wrap">${section('temario', 'Temario', `<div class="topic-grid">${cards}</div>`)}</main>`
  return out + foot('')
}

// "Parte 1 de 2" cuando un titulo se repite en varias clases.
export function courseTopics(topics) {
  const totals = new Map()
  topics.forEach((t) => totals.set(t.title, (totals.get(t.title) || 0) + 1))
  const seen = new Map()
  return topics.map((t) => {
    const part = (seen.get(t.title) || 0) + 1
    seen.set(t.title, part)
    return { numero: t.position, titulo: t.title, parte: totals.get(t.title) > 1 ? `${part} de ${totals.get(t.title)}` : null }
  })
}

// Extrae temas de lo que el usuario pego: tolera texto alrededor, uno o
// varios bloques ```json y las formas [temas], {temas:[...]} o {tema}.
export function parsePastedContent(text) {
  const source = String(text || '')
  const blocks = [...source.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map((m) => m[1])
  const candidates = blocks.length ? blocks : [source]
  const temas = []
  const failures = []
  candidates.forEach((raw, i) => {
    const start = raw.search(/[[{]/)
    const end = Math.max(raw.lastIndexOf(']'), raw.lastIndexOf('}'))
    if (start === -1 || end < start) return
    try {
      const value = JSON.parse(raw.slice(start, end + 1))
      const list = Array.isArray(value) ? value : Array.isArray(value?.temas) ? value.temas : [value]
      list.forEach((t) => { if (t && typeof t === 'object') temas.push(t) })
    } catch (err) {
      failures.push(`Bloque ${i + 1}: JSON inválido (${err.message})`)
    }
  })
  return { temas, failures }
}

// Junta el contenido nuevo con el ya importado (por numero), valida y
// arma todas las paginas. Devuelve los archivos a escribir y el reporte.
export function buildMaterialFromContent(course, previousContent, newTemas) {
  const topicsByNumber = new Map(course.topics.map((t) => [t.numero, t]))
  const content = new Map(Object.entries(previousContent || {}).map(([k, v]) => [Number(k), v]))
  const report = { imported: [], rejected: [], warnings: [] }

  for (const tema of newTemas) {
    const numero = Number(tema.numero)
    if (!topicsByNumber.has(numero)) {
      report.rejected.push({ numero: tema.numero ?? '?', errors: [`no existe el tema ${tema.numero ?? '(sin "numero")'} en el temario (1–${course.topics.length})`] })
      continue
    }
    const { errors, warnings } = validateTopic(tema, numero, course.classMinutes)
    if (errors.length) {
      report.rejected.push({ numero, errors })
      continue
    }
    if (warnings.length) report.warnings.push({ numero, warnings })
    content.set(numero, { ...tema, numero })
    report.imported.push(numero)
  }

  const available = new Set(content.keys())
  const files = new Map()
  for (const [numero, tema] of content) {
    const info = topicsByNumber.get(numero)
    const page = renderTopic(course, tema, info, available)
    const leaks = leakErrors(tema, page)
    if (leaks.length) {
      // Una fuga invalida el tema aunque haya pasado la validacion basica.
      available.delete(numero)
      content.delete(numero)
      report.imported = report.imported.filter((n) => n !== numero)
      report.rejected.push({ numero, errors: leaks })
      continue
    }
    files.set(`tema-${pad2(numero)}.html`, page)
    files.set(`soluciones/tema-${pad2(numero)}.html`, renderSolution(course, tema, info))
  }
  // La navegacion depende de que temas existen: se rearma si hubo fugas.
  for (const numero of available) files.set(`tema-${pad2(numero)}.html`, renderTopic(course, content.get(numero), topicsByNumber.get(numero), available))
  files.set('index.html', renderIndex(course, available))
  for (const name of fs.readdirSync(SKILL_ASSETS_DIR)) files.set(`assets/${name}`, fs.readFileSync(path.join(SKILL_ASSETS_DIR, name)))

  report.available = [...available].sort((a, b) => a - b)
  report.missing = course.topics.map((t) => t.numero).filter((n) => !available.has(n))
  return { files, content: Object.fromEntries(content), report }
}
