import { callProcedure } from './db.js'
import { authenticate } from './middleware/authenticate.js'
import { mapStoredProcedureError } from './errors.js'

// Reporte con IA (OpenAI) de los comentarios de los alumnos sobre temas,
// cursos (componentes) y profesores, con las reacciones de satisfaccion
// como contexto. A OpenAI no se le mandan nombres de alumnos: van como
// "Alumno 1", "Alumno 2"... Los reportes se guardan para consultarlos.
//
// Configuracion: OPENAI_API_KEY (obligatoria), OPENAI_MODEL y OPENAI_BASE_URL
// (opcionales; la base sirve para un proxy compatible).

const DEFAULT_MODEL = 'gpt-4o-mini'
const MAX_COMMENTS = 400
const TYPE_LABEL = { topic: 'Tema', component: 'Curso', instructor: 'Profesor' }

function sendError(res, err) {
  const { status, message } = mapStoredProcedureError(err)
  res.status(status).json({ message })
}
const actor = (req) => ({ p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId })
const isoDay = (v) => (v ? (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10) : null)

export const aiConfigured = () => Boolean(process.env.OPENAI_API_KEY)

// Comentarios que entran al reporte segun los filtros.
function selectComments(rows, filters) {
  return rows.filter((f) => {
    if (filters.programId && f.program_id !== filters.programId) return false
    if (filters.targetType && f.target_type !== filters.targetType) return false
    if (filters.targetId) {
      const id = f.target_type === 'topic' ? f.topic_id : f.target_type === 'component' ? f.component_id : f.instructor_id
      if (id !== filters.targetId) return false
    }
    const day = isoDay(f.created_at)
    if (filters.from && day < filters.from) return false
    if (filters.to && day > filters.to) return false
    return true
  }).slice(0, MAX_COMMENTS)
}

function buildPrompt(comments, reactions, filters) {
  const alias = new Map()
  const lines = comments.map((f) => {
    if (!alias.has(f.student_id)) alias.set(f.student_id, `Alumno ${alias.size + 1}`)
    const target = f.target_type === 'topic' ? `Tema "${f.topic_title}" (curso ${f.component_name}, profesor ${f.instructor_name || 'sin asignar'})`
      : f.target_type === 'component' ? `Curso "${f.component_name}" (profesor ${f.instructor_name || 'sin asignar'})`
        : `Profesor ${f.instructor_name} (curso ${f.component_name})`
    return `- [${isoDay(f.created_at)}] ${alias.get(f.student_id)} sobre ${target}: ${f.message.replace(/\s+/g, ' ')}`
  })
  const reactionLines = reactions.filter((r) => r.votes || r.repeat_count).slice(0, 150).map((r) =>
    `- "${r.topic_title}" (${r.component_name}, ${r.instructor_name || 'sin profesor'}): promedio ${Number(r.avg_satisfaction ?? 0).toFixed(1)}/5 en ${r.votes} votos, ${Number(r.repeat_count) || 0} piden repetir`)
  return [
    'Eres analista de calidad académica de un programa de formación de talento técnico.',
    'Analiza los comentarios de los alumnos y las reacciones de satisfacción (1 = muy mala, 5 = excelente) y escribe un reporte para el administrador del programa, en español neutro, concreto y accionable.',
    'No inventes datos: básate solo en lo que está abajo. Cita textualmente comentarios breves cuando ayuden. No uses nombres de alumnos (vienen anonimizados).',
    filters.description ? `Alcance del reporte: ${filters.description}.` : '',
    '',
    `COMENTARIOS (${lines.length}):`,
    ...lines,
    '',
    `REACCIONES POR TEMA (${reactionLines.length}):`,
    ...(reactionLines.length ? reactionLines : ['- Sin reacciones registradas.']),
    '',
    'Responde SOLO con un objeto JSON con esta forma:',
    '{"resumen": string (3-5 oraciones), "sentimiento": "positivo"|"mixto"|"negativo", "puntaje_estimado": number (1-5),',
    ' "fortalezas": [string], "problemas": [{"titulo": string, "detalle": string, "gravedad": "alta"|"media"|"baja", "afecta": string}],',
    ' "por_profesor": [{"profesor": string, "resumen": string, "fortalezas": [string], "mejoras": [string]}],',
    ' "por_curso": [{"curso": string, "resumen": string}],',
    ' "temas_a_repetir_o_reforzar": [{"tema": string, "motivo": string}],',
    ' "recomendaciones": [{"accion": string, "responsable": string, "prioridad": "alta"|"media"|"baja"}],',
    ' "citas": [{"texto": string, "sobre": string}]}',
  ].filter((l) => l !== '').join('\n')
}

async function callOpenAI(prompt) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 90000)
  try {
    const base = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '')
    const response = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'Devuelves únicamente JSON válido con la estructura pedida.' },
          { role: 'user', content: prompt },
        ],
      }),
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) {
      console.error('OpenAI error', response.status, body?.error?.message)
      throw Object.assign(new Error('ai_failed'), { detail: body?.error?.message })
    }
    return JSON.parse(body.choices?.[0]?.message?.content || '{}')
  } finally {
    clearTimeout(timer)
  }
}

function readFilters(body) {
  const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v))
  const filters = {
    programId: num(body?.programId), targetType: ['topic', 'component', 'instructor'].includes(body?.targetType) ? body.targetType : null,
    targetId: num(body?.targetId), from: /^\d{4}-\d{2}-\d{2}$/.test(body?.from || '') ? body.from : null,
    to: /^\d{4}-\d{2}-\d{2}$/.test(body?.to || '') ? body.to : null,
    description: typeof body?.description === 'string' ? body.description.slice(0, 200) : '',
  }
  if ([filters.programId, filters.targetId].some((v) => v !== null && !Number.isInteger(v))) return null
  return filters
}

export function registerAiReportRoutes(app) {
  app.get('/api/ai-reports/status', authenticate, (req, res) => {
    res.json({ data: { configured: aiConfigured(), model: process.env.OPENAI_MODEL || DEFAULT_MODEL } })
  })

  app.get('/api/ai-reports', authenticate, async (req, res) => {
    try {
      res.json({ data: await callProcedure('sp_ai_reports_list', actor(req)) })
    } catch (err) {
      sendError(res, err)
    }
  })

  app.get('/api/ai-reports/:id', authenticate, async (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isInteger(id)) return res.status(400).json({ message: 'Invalid request format' })
    try {
      const [row] = await callProcedure('sp_ai_reports_get', { ...actor(req), p_report_id: id })
      if (!row) return res.status(404).json({ message: 'Not found' })
      res.json({ data: { ...row, content: typeof row.content === 'string' ? JSON.parse(row.content) : row.content, filters: typeof row.filters === 'string' ? JSON.parse(row.filters) : row.filters } })
    } catch (err) {
      sendError(res, err)
    }
  })

  app.post('/api/ai-reports', authenticate, async (req, res) => {
    if (!['tenant_admin', 'super_admin'].includes(req.user.roleCode)) return res.status(403).json({ message: 'not_authorized' })
    if (!aiConfigured()) return res.status(503).json({ message: 'ai_not_configured' })
    const filters = readFilters(req.body)
    if (!filters) return res.status(400).json({ message: 'Invalid request format' })
    try {
      const [feedback, reactions] = await Promise.all([
        callProcedure('sp_feedback_list', actor(req)),
        callProcedure('sp_reactions_summary', actor(req)),
      ])
      const comments = selectComments(feedback, filters)
      if (!comments.length) return res.status(400).json({ message: 'no_comments' })
      const scopedReactions = reactions.filter((r) => (!filters.programId || r.program_id === filters.programId)
        && (filters.targetType !== 'topic' || !filters.targetId || r.topic_id === filters.targetId)
        && (filters.targetType !== 'component' || !filters.targetId || r.component_id === filters.targetId)
        && (filters.targetType !== 'instructor' || !filters.targetId || r.instructor_id === filters.targetId))
      let content
      try {
        content = await callOpenAI(buildPrompt(comments, scopedReactions, filters))
      } catch (err) {
        return res.status(502).json({ message: 'ai_failed', detail: err.detail || null })
      }
      const title = filters.description || `Comentarios${filters.targetType ? ` · ${TYPE_LABEL[filters.targetType]}` : ''}`
      const [saved] = await callProcedure('sp_ai_reports_create', {
        ...actor(req), p_title: title, p_filters: JSON.stringify(filters), p_model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
        p_comments_count: comments.length, p_content: JSON.stringify(content),
      })
      res.status(201).json({ data: { id: saved.report_id, title, commentsCount: comments.length, content } })
    } catch (err) {
      sendError(res, err)
    }
  })
}
