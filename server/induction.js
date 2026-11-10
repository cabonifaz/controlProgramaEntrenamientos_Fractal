import { callProcedure } from './db.js'
import { authenticate } from './middleware/authenticate.js'
import { mapStoredProcedureError } from './errors.js'

// Programas de induccion: un camino por etapas (componentes) con pasos a
// ritmo propio (video, lectura, cuestionario calificado, tarea, sesion en
// vivo). La induccion se cumple al completar todos los pasos obligatorios;
// con "sequential" cada etapa se abre al terminar los obligatorios de la
// anterior. Los cuestionarios se califican aqui: al alumno nunca se le
// envian las respuestas correctas antes de responder.

const TYPES = new Set(['video', 'reading', 'quiz', 'task', 'meeting'])
const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const parse = (v) => (typeof v === 'string' ? JSON.parse(v) : v)
const isoDay = (v) => (v ? (v instanceof Date ? v.toISOString() : String(v)) : null)

function sendError(res, err) {
  const { status, message } = mapStoredProcedureError(err)
  res.status(status).json({ message })
}
const actor = (req) => ({ p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId })

async function access(req, programId) {
  const [row] = await callProcedure('sp_induction_access', { ...actor(req), p_program_id: programId })
  return row || null
}

function cleanUrl(value) {
  const url = text(value, 500)
  if (!url) return { url: null }
  try {
    if (!['https:', 'http:'].includes(new URL(url).protocol)) return { invalid: true }
  } catch { return { invalid: true } }
  return { url }
}

// Preguntas validas: opcion (2-6 opciones, respuesta letra) o vf (boolean).
function cleanQuiz(raw) {
  if (!Array.isArray(raw)) return null
  const out = []
  for (const q of raw.slice(0, 40)) {
    const enunciado = text(q?.enunciado, 600)
    if (!enunciado) continue
    if (q.tipo === 'vf') {
      if (typeof q.respuesta !== 'boolean') continue
      out.push({ tipo: 'vf', enunciado, respuesta: q.respuesta, explicacion: text(q.explicacion, 600) || null })
    } else {
      const opciones = (Array.isArray(q.opciones) ? q.opciones : []).map((o) => text(o, 300)).filter(Boolean).slice(0, 6)
      const letter = typeof q.respuesta === 'string' ? q.respuesta.trim().toUpperCase() : ''
      const idx = letter.charCodeAt(0) - 65
      if (opciones.length < 2 || !(idx >= 0 && idx < opciones.length)) continue
      out.push({ tipo: 'opcion', enunciado, opciones, respuesta: letter, explicacion: text(q.explicacion, 600) || null })
    }
  }
  return out
}

function shapeStep(r) {
  return {
    id: r.step_id, position: r.position, type: r.step_type, title: r.title, description: r.description, url: r.url,
    required: Boolean(r.required), minScore: r.min_score, quiz: parse(r.quiz) || [], estMinutes: r.est_minutes,
    scheduledAt: isoDay(r.scheduled_at),
  }
}

async function loadStages(programId) {
  const rows = await callProcedure('sp_induction_steps_list', { p_program_id: programId })
  const stages = []
  for (const r of rows) {
    let st = stages.find((s) => s.id === r.component_id)
    if (!st) stages.push((st = { id: r.component_id, name: r.component_name, description: r.component_description, steps: [] }))
    if (r.step_id) st.steps.push(shapeStep(r))
  }
  return stages
}

// Estado del camino de un alumno: que etapas estan abiertas y cuanto avanzo.
export function journey(stages, progressByStep, sequential) {
  let open = true
  let requiredTotal = 0
  let requiredDone = 0
  const shaped = stages.map((st) => {
    const req = st.steps.filter((s) => s.required)
    const reqDone = req.filter((s) => progressByStep.get(s.id)?.status === 'completed').length
    const done = st.steps.filter((s) => progressByStep.get(s.id)?.status === 'completed').length
    requiredTotal += req.length
    requiredDone += reqDone
    const unlocked = !sequential || open
    const complete = reqDone === req.length
    if (!complete) open = false
    return { ...st, unlocked, complete: complete && st.steps.length > 0, requiredTotal: req.length, requiredDone: reqDone, done }
  })
  const scores = [...progressByStep.values()].map((p) => p.score).filter((s) => s !== null && s !== undefined).map(Number)
  return {
    stages: shaped, requiredTotal, requiredDone,
    pct: requiredTotal ? Math.round((100 * requiredDone) / requiredTotal) : 0,
    completed: requiredTotal > 0 && requiredDone === requiredTotal,
    avgScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
  }
}

function progressMap(rows) {
  return new Map(rows.map((p) => [p.step_id, {
    status: p.status, score: p.score === null ? null : Number(p.score), lastScore: p.last_score === null ? null : Number(p.last_score),
    attempts: p.attempts, completedAt: isoDay(p.completed_at), updatedAt: isoDay(p.updated_at || p.started_at),
  }]))
}

// Al alumno: sin respuestas ni explicaciones.
function forStudent(stages) {
  return stages.map((st) => ({ ...st, steps: st.steps.map((s) => ({ ...s, quiz: s.quiz.map(({ respuesta, explicacion, ...q }) => q) })) }))
}

async function stepWithAccess(req, stepId) {
  const [step] = await callProcedure('sp_induction_step_get', { p_step_id: stepId })
  if (!step) return { step: null }
  const prog = await access(req, step.program_id)
  return { step, prog }
}

export function registerInductionRoutes(app) {
  app.get('/api/induction/programs', authenticate, async (req, res) => {
    try {
      res.json({ data: await callProcedure('sp_induction_programs', actor(req)) })
    } catch (err) {
      sendError(res, err)
    }
  })

  app.put('/api/programs/:id/type', authenticate, async (req, res) => {
    const programId = Number(req.params.id)
    const type = req.body?.programType
    if (!Number.isInteger(programId) || !['training', 'induction'].includes(type)) return res.status(400).json({ message: 'Invalid request format' })
    try {
      await callProcedure('sp_programs_set_type', { ...actor(req), p_program_id: programId, p_program_type: type, p_sequential: req.body?.sequential !== false })
      res.json({ ok: true })
    } catch (err) {
      sendError(res, err)
    }
  })

  // Camino de induccion: para el alumno, con su avance; para el admin, la
  // estructura completa (con respuestas) para editarla.
  app.get('/api/induction/:programId', authenticate, async (req, res) => {
    const programId = Number(req.params.programId)
    if (!Number.isInteger(programId)) return res.status(400).json({ message: 'Invalid request format' })
    try {
      const prog = await access(req, programId)
      if (!prog || prog.access === 'none') return res.status(404).json({ message: 'Not found' })
      const stages = await loadStages(programId)
      const program = { id: prog.program_id, name: prog.name, description: prog.description, cohort: prog.cohort, sequential: Boolean(prog.sequential), type: prog.program_type }
      if (prog.access === 'edit') return res.json({ data: { program, canEdit: true, stages } })
      const progress = progressMap(await callProcedure('sp_induction_progress_list', { p_program_id: programId, p_student_id: req.user.id }))
      const j = journey(stages, progress, program.sequential)
      res.json({ data: { program, canEdit: false, ...j, stages: forStudent(j.stages), progress: Object.fromEntries(progress) } })
    } catch (err) {
      sendError(res, err)
    }
  })

  async function saveStep(req, res, stepId) {
    const b = req.body || {}
    const type = b.type
    const title = text(b.title, 200)
    const link = cleanUrl(b.url)
    const quiz = type === 'quiz' ? cleanQuiz(b.quiz) : null
    const minScore = Number.isInteger(b.minScore) ? Math.min(100, Math.max(0, b.minScore)) : 70
    const scheduledAt = typeof b.scheduledAt === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(b.scheduledAt) ? b.scheduledAt.slice(0, 16).replace('T', ' ') : null
    if (!TYPES.has(type) || !title || link.invalid) return res.status(400).json({ message: link.invalid ? 'invalid_url' : 'Invalid request format' })
    if (type === 'quiz' && !quiz?.length) return res.status(400).json({ message: 'quiz_empty' })
    try {
      let componentId = Number(b.componentId)
      if (stepId) {
        const { step, prog } = await stepWithAccess(req, stepId)
        if (!step) return res.status(404).json({ message: 'Not found' })
        if (prog?.access !== 'edit') return res.status(403).json({ message: 'not_authorized' })
        componentId = step.component_id
      } else {
        const prog = await access(req, Number(req.params.programId))
        if (prog?.access !== 'edit') return res.status(403).json({ message: 'not_authorized' })
        const stages = await loadStages(Number(req.params.programId))
        if (!stages.some((s) => s.id === componentId)) return res.status(400).json({ message: 'Invalid request format' })
      }
      const [r] = await callProcedure('sp_induction_step_save', {
        p_actor_user_id: req.user.id, p_step_id: stepId || null, p_component_id: componentId, p_step_type: type, p_title: title,
        p_description: text(b.description, 2000) || null, p_url: link.url, p_required: b.required !== false, p_min_score: minScore,
        p_quiz: quiz ? JSON.stringify(quiz) : null, p_est_minutes: Number.isInteger(b.estMinutes) ? b.estMinutes : null,
        p_position: Number.isInteger(b.position) ? b.position : null, p_scheduled_at: scheduledAt,
      })
      res.status(stepId ? 200 : 201).json({ data: r })
    } catch (err) {
      sendError(res, err)
    }
  }
  app.post('/api/induction/:programId/steps', authenticate, (req, res) => saveStep(req, res, null))
  app.put('/api/induction/steps/:id', authenticate, (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isInteger(id)) return res.status(400).json({ message: 'Invalid request format' })
    return saveStep(req, res, id)
  })

  app.delete('/api/induction/steps/:id', authenticate, async (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isInteger(id)) return res.status(400).json({ message: 'Invalid request format' })
    try {
      const { step, prog } = await stepWithAccess(req, id)
      if (!step) return res.status(404).json({ message: 'Not found' })
      if (prog?.access !== 'edit') return res.status(403).json({ message: 'not_authorized' })
      await callProcedure('sp_induction_step_remove', { p_actor_user_id: req.user.id, p_step_id: id })
      res.json({ ok: true })
    } catch (err) {
      sendError(res, err)
    }
  })

  // Subir o bajar un paso dentro de su etapa.
  app.post('/api/induction/steps/:id/move', authenticate, async (req, res) => {
    const id = Number(req.params.id)
    const dir = req.body?.direction === 'up' ? -1 : 1
    if (!Number.isInteger(id)) return res.status(400).json({ message: 'Invalid request format' })
    try {
      const { step, prog } = await stepWithAccess(req, id)
      if (!step) return res.status(404).json({ message: 'Not found' })
      if (prog?.access !== 'edit') return res.status(403).json({ message: 'not_authorized' })
      const stages = await loadStages(step.program_id)
      const list = stages.find((s) => s.id === step.component_id).steps
      const i = list.findIndex((s) => s.id === id)
      const j = i + dir
      if (j < 0 || j >= list.length) return res.json({ ok: true })
      ;[list[i], list[j]] = [list[j], list[i]]
      for (const [pos, s] of list.entries()) {
        await callProcedure('sp_induction_step_save', {
          p_actor_user_id: req.user.id, p_step_id: s.id, p_component_id: step.component_id, p_step_type: s.type, p_title: s.title,
          p_description: s.description, p_url: s.url, p_required: s.required, p_min_score: s.minScore,
          p_quiz: s.type === 'quiz' ? JSON.stringify(s.quiz) : null, p_est_minutes: s.estMinutes, p_position: pos + 1,
          p_scheduled_at: s.scheduledAt ? s.scheduledAt.slice(0, 16).replace('T', ' ') : null,
        })
      }
      res.json({ ok: true })
    } catch (err) {
      sendError(res, err)
    }
  })

  // Alumno: verifica que el paso sea suyo y que su etapa este abierta.
  async function studentStep(req, stepId) {
    const { step, prog } = await stepWithAccess(req, stepId)
    if (!step || prog?.access !== 'view') return { error: 404 }
    const stages = await loadStages(step.program_id)
    const progress = progressMap(await callProcedure('sp_induction_progress_list', { p_program_id: step.program_id, p_student_id: req.user.id }))
    const j = journey(stages, progress, Boolean(prog.sequential))
    const stage = j.stages.find((s) => s.id === step.component_id)
    if (!stage?.unlocked) return { error: 409 }
    return { step: shapeStep({ ...step, step_id: step.id }) }
  }

  app.post('/api/induction/steps/:id/complete', authenticate, async (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isInteger(id)) return res.status(400).json({ message: 'Invalid request format' })
    try {
      const { step, error } = await studentStep(req, id)
      if (error) return res.status(error).json({ message: error === 409 ? 'stage_locked' : 'Not found' })
      if (step.type === 'quiz') return res.status(400).json({ message: 'Invalid request format' })
      await callProcedure('sp_induction_progress_set', { p_step_id: id, p_student_id: req.user.id, p_status: 'completed', p_score: null, p_answers: null })
      res.json({ ok: true })
    } catch (err) {
      sendError(res, err)
    }
  })

  // Califica el cuestionario. Devuelve la nota y, por pregunta, si acerto,
  // la respuesta correcta y la explicacion.
  app.post('/api/induction/steps/:id/quiz', authenticate, async (req, res) => {
    const id = Number(req.params.id)
    const answers = Array.isArray(req.body?.answers) ? req.body.answers : null
    if (!Number.isInteger(id) || !answers) return res.status(400).json({ message: 'Invalid request format' })
    try {
      const { step, error } = await studentStep(req, id)
      if (error) return res.status(error).json({ message: error === 409 ? 'stage_locked' : 'Not found' })
      if (step.type !== 'quiz' || !step.quiz.length) return res.status(400).json({ message: 'Invalid request format' })
      const results = step.quiz.map((q, i) => {
        const given = answers[i]
        const correct = q.tipo === 'vf' ? given === q.respuesta : typeof given === 'string' && given.toUpperCase() === q.respuesta
        return { correct, respuesta: q.respuesta, explicacion: q.explicacion }
      })
      const score = Math.round((10000 * results.filter((r) => r.correct).length) / results.length) / 100
      const passed = score >= step.minScore
      await callProcedure('sp_induction_progress_set', {
        p_step_id: id, p_student_id: req.user.id, p_status: passed ? 'completed' : 'failed', p_score: score, p_answers: JSON.stringify(answers.slice(0, 40)),
      })
      res.json({ data: { score, passed, minScore: step.minScore, results } })
    } catch (err) {
      sendError(res, err)
    }
  })

  // Tablero de induccion (admin): avance de cada inscrito paso a paso.
  app.get('/api/induction/:programId/dashboard', authenticate, async (req, res) => {
    const programId = Number(req.params.programId)
    if (!Number.isInteger(programId)) return res.status(400).json({ message: 'Invalid request format' })
    try {
      const prog = await access(req, programId)
      if (prog?.access !== 'edit') return res.status(403).json({ message: 'not_authorized' })
      const [stages, students, progressRows] = await Promise.all([
        loadStages(programId),
        callProcedure('sp_induction_students', { p_program_id: programId }),
        callProcedure('sp_induction_progress_list', { p_program_id: programId, p_student_id: null }),
      ])
      const byStudent = new Map()
      for (const r of progressRows) {
        if (!byStudent.has(r.student_id)) byStudent.set(r.student_id, [])
        byStudent.get(r.student_id).push(r)
      }
      const list = students.map((s) => {
        const progress = progressMap(byStudent.get(s.id) || [])
        const j = journey(stages, progress, Boolean(prog.sequential))
        const last = [...progress.values()].map((p) => p.updatedAt).filter(Boolean).sort().at(-1) || null
        return {
          id: s.id, name: s.full_name, email: s.email, photoUrl: s.photo_path ? `/uploads/${s.photo_path}` : null,
          enrolledAt: isoDay(s.enrolled_at), lastActivity: last, pct: j.pct, completed: j.completed,
          requiredDone: j.requiredDone, requiredTotal: j.requiredTotal, avgScore: j.avgScore,
          currentStage: j.stages.find((st) => st.unlocked && !st.complete)?.name || null,
          progress: Object.fromEntries(progress),
        }
      })
      res.json({ data: { program: { id: prog.program_id, name: prog.name, sequential: Boolean(prog.sequential) }, stages, students: list } })
    } catch (err) {
      sendError(res, err)
    }
  })

  // Preguntas sugeridas por IA para un cuestionario (el admin las revisa).
  app.post('/api/induction/:programId/ai-quiz', authenticate, async (req, res) => {
    if (!process.env.OPENAI_API_KEY) return res.status(503).json({ message: 'ai_not_configured' })
    const programId = Number(req.params.programId)
    const topic = text(req.body?.topic, 1500)
    const count = Math.min(15, Math.max(3, Number(req.body?.count) || 5))
    if (!Number.isInteger(programId) || !topic) return res.status(400).json({ message: 'Invalid request format' })
    try {
      const prog = await access(req, programId)
      if (prog?.access !== 'edit') return res.status(403).json({ message: 'not_authorized' })
      const base = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '')
      const response = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || 'gpt-5.4-mini', response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: 'Devuelves únicamente JSON válido.' },
            { role: 'user', content: `Escribe ${count} preguntas de evaluación en español para la inducción "${prog.name}" sobre: ${topic}.\nMezcla opción múltiple (4 opciones) y verdadero/falso. Claras, sin ambigüedad, que comprueben lo importante.\nResponde {"preguntas":[{"tipo":"opcion","enunciado":"…","opciones":["…","…","…","…"],"respuesta":"B","explicacion":"…"},{"tipo":"vf","enunciado":"…","respuesta":true,"explicacion":"…"}]}` },
          ],
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) return res.status(502).json({ message: 'ai_failed' })
      const parsed = JSON.parse(body.choices?.[0]?.message?.content || '{}')
      res.json({ data: cleanQuiz(parsed.preguntas || []) })
    } catch (err) {
      sendError(res, err)
    }
  })
}
