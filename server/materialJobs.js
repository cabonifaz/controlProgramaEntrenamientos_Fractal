import { callProcedure } from './db.js'
import { authenticate } from './middleware/authenticate.js'
import { mapStoredProcedureError } from './errors.js'
import { courseTopics, expectedCounts, validateTopic } from './materialRender.js'

// Generacion automatica del material de un componente con IA (OpenAI), sin
// subir archivos. Es asincrona: se crea un trabajo y el servidor genera los
// temas en segundo plano (varios a la vez), valida cada uno con las mismas
// reglas que el contenido pegado y lo publica apenas esta listo. Al terminar
// avisa a quien lo pidio con una alerta. Configuracion: OPENAI_API_KEY y
// OPENAI_MATERIAL_MODEL (o OPENAI_MODEL).

const CONCURRENCY = 3
const LEVELS = new Set(['Básico', 'Intermedio', 'Avanzado'])
const model = () => process.env.OPENAI_MATERIAL_MODEL || process.env.OPENAI_MODEL || 'gpt-5.4-mini'
const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

function sendError(res, err) {
  const { status, message } = mapStoredProcedureError(err)
  res.status(status).json({ message })
}
const actor = (user) => ({ p_actor_user_id: user.id, p_actor_role: user.roleCode, p_actor_tenant_id: user.tenantId })

function buildTopicPrompt(course, topic, info, options, classMinutes) {
  const counts = expectedCounts(classMinutes)
  const blocks = Math.max(1, Math.round(classMinutes / 45))
  const temario = courseTopics(course.topics).map((t) => `${t.numero}. ${t.titulo}${t.parte ? ` (parte ${t.parte})` : ''}`).join('\n')
  return [
    `Eres diseñador instruccional. Escribe el CONTENIDO del tema ${topic.position} de un curso. Una plataforma lo convertirá en páginas con la identidad visual de ${course.tenant?.name || 'la organización'}: NO escribas HTML de página, CSS ni JavaScript.`,
    '',
    `Curso: ${course.componentName} (programa ${course.programName}).`,
    course.componentDescription ? `Sobre el curso: ${course.componentDescription}` : '',
    `Alumnos: ${options.audience || 'profesionales en formación técnica'}. Nivel: ${options.level || 'Intermedio'}.`,
    options.sector ? `Ambienta ejemplos y ejercicios en: ${options.sector}.` : '',
    options.extra ? `Además: ${options.extra}` : '',
    `El tema es UNA clase de ${classMinutes} min${blocks > 1 ? ` (organízala en ${blocks} bloques de ~45 min, con "pausa_despues": true entre ellos)` : ''}.`,
    '',
    'Temario completo (para dar continuidad; escribe SOLO el tema indicado):',
    temario,
    '',
    `TEMA A ESCRIBIR: ${topic.position}. ${topic.title}${info?.parte ? ` (parte ${info.parte}; continúa la parte anterior sin repetirla)` : ''}${topic.description ? ` — ${topic.description}` : ''}`,
    '',
    'Responde SOLO con un objeto JSON {"temas":[TEMA]} donde TEMA es:',
    `{"numero":${topic.position},"resumen":"1 frase","objetivos":["…"],"punto_de_partida":{"texto":"…","pregunta":"…"},`,
    '"bloques":[{"titulo":"…","html":"<p>…</p>","callouts":[{"tipo":"importante|tip|error","texto":"…"}],"pausa_despues":false}],',
    '"ejemplos":[{"titulo":"…","pasos":["…"],"resultado":"…"}],"practica_guiada":{"titulo":"…","html":"…"},',
    '"ejercicios":[{"nivel":"basico|intermedio|reto","enunciado":"…","entregable":"…","solucion":"…","rubrica":"…"}],',
    '"preguntas":[{"tipo":"opcion","enunciado":"…","opciones":["…","…","…"],"respuesta":"B","explicacion":"…"},{"tipo":"vf","enunciado":"…","respuesta":true},{"tipo":"corta","enunciado":"…","respuesta":"…"}],',
    '"ideas_clave":["…"],"glosario":[{"termino":"…","definicion":"…"}],',
    '"guia_docente":{"plan":[{"minutos":"0–10","actividad":"…"}],"errores_frecuentes":[{"error":"…","como_reconducir":"…"}]}}',
    '',
    `Cantidades: 3-4 objetivos, al menos ${counts.ejemplos} ejemplos, ${counts.ejercicios} ejercicios y ${counts.preguntas} preguntas.`,
    'Reglas:',
    `- Los textos admiten HTML simple: <p>, <strong>, <ul>, <table>, <pre><code class="language-x">, y diagramas <svg viewBox="…"> con los colores ${course.palette?.primary || '#087fb8'}, ${course.palette?.accent || '#f4a500'} y #17232d.`,
    '- Las respuestas van SOLO en solucion, respuesta, explicacion, rubrica y guia_docente; nunca en enunciados.',
    '- Sin JavaScript (<script>, onclick=…) ni rutas absolutas. En ejemplos de código escapa < como &lt;.',
    '- "respuesta" de opción múltiple es una letra (A, B, C…); de verdadero/falso, true o false.',
    '- Contenido en español, correcto técnicamente y aplicable.',
  ].filter((l) => l !== '').join('\n')
}

async function generateTopic(prompt, feedback) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 240000)
  try {
    const messages = [
      { role: 'system', content: 'Devuelves únicamente JSON válido con la estructura pedida.' },
      { role: 'user', content: prompt },
    ]
    if (feedback) messages.push({ role: 'user', content: `Tu respuesta anterior no pasó la validación. Corrige estos problemas y devuelve el JSON completo otra vez:\n- ${feedback.join('\n- ')}` })
    const base = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '')
    const response = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: model(), response_format: { type: 'json_object' }, messages }),
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(body?.error?.message || `OpenAI respondió ${response.status}`)
    const parsed = JSON.parse(body.choices?.[0]?.message?.content || '{}')
    return Array.isArray(parsed.temas) ? parsed.temas[0] : parsed.tema || parsed
  } finally {
    clearTimeout(timer)
  }
}

// Una cola por componente: cada tema publicado se agrega sobre el contenido
// anterior, asi que las publicaciones van de a una.
const publishChains = new Map()
function serialize(componentId, task) {
  const prev = publishChains.get(componentId) || Promise.resolve()
  const next = prev.then(task, task)
  publishChains.set(componentId, next.catch(() => {}))
  return next
}

async function runJob(jobId, user, componentId, numbers, options, deps) {
  const req = { user }
  const topicsState = []
  let done = 0
  let failed = 0
  const save = (status) => callProcedure('sp_material_jobs_progress', {
    p_job_id: jobId, p_status: status, p_topics: JSON.stringify(topicsState), p_done: done, p_failed: failed,
  }).catch((err) => console.error('material job progress', jobId, err.message))
  try {
    const course = await deps.loadMaterialCourse(req, componentId)
    const infos = new Map(courseTopics(course.topics).map((t) => [t.numero, t]))
    const selected = course.topics.filter((t) => numbers.includes(t.position))
    selected.forEach((t) => topicsState.push({ numero: t.position, titulo: t.title, status: 'pending', errors: [] }))
    await save('running')
    const classMinutes = course.topics[0]?.durationMinutes || 45

    let cursor = 0
    const worker = async () => {
      while (cursor < selected.length) {
        const topic = selected[cursor++]
        const state = topicsState.find((s) => s.numero === topic.position)
        state.status = 'running'
        await save('running')
        try {
          const prompt = buildTopicPrompt(course, topic, infos.get(topic.position), options, classMinutes)
          let tema = await generateTopic(prompt)
          if (tema) tema.numero = topic.position
          let { errors } = tema ? validateTopic(tema, topic.position, classMinutes) : { errors: ['respuesta vacía'] }
          if (errors.length) {
            tema = await generateTopic(prompt, errors)
            if (tema) tema.numero = topic.position
            ;({ errors } = tema ? validateTopic(tema, topic.position, classMinutes) : { errors: ['respuesta vacía'] })
          }
          if (errors.length) throw Object.assign(new Error('validation'), { details: errors })
          const { report, error } = await serialize(componentId, () => deps.importMaterialTemas(req, componentId, [tema], 'Generado con IA'))
          if (error) throw Object.assign(new Error(error), { details: [error] })
          if (!report.imported.includes(topic.position)) {
            throw Object.assign(new Error('rejected'), { details: report.rejected.find((r) => r.numero === topic.position)?.errors || ['no se pudo publicar'] })
          }
          state.status = 'done'
          state.errors = []
          done += 1
        } catch (err) {
          state.status = 'failed'
          state.errors = (err.details || [err.message]).slice(0, 5)
          failed += 1
        }
        await save('running')
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, selected.length) }, worker))
    const status = failed === 0 ? 'done' : done > 0 ? 'partial' : 'failed'
    await callProcedure('sp_material_jobs_finish', { p_job_id: jobId, p_status: status, p_topics: JSON.stringify(topicsState), p_done: done, p_failed: failed, p_error: null })
  } catch (err) {
    console.error('material job', jobId, err)
    await callProcedure('sp_material_jobs_finish', {
      p_job_id: jobId, p_status: 'failed', p_topics: JSON.stringify(topicsState), p_done: done, p_failed: failed, p_error: String(err.message || err).slice(0, 500),
    }).catch(() => {})
  }
}

function parseJob(row) {
  const parse = (v) => (typeof v === 'string' ? JSON.parse(v) : v)
  return {
    id: row.id, componentId: row.component_id, componentName: row.component_name, programName: row.program_name,
    status: row.status, topics: parse(row.topics) || [], total: row.total, done: row.done_count, failed: row.failed_count,
    model: row.model, error: row.error, createdAt: row.created_at, startedAt: row.started_at, finishedAt: row.finished_at,
    createdByName: row.created_by_name,
  }
}

export function registerMaterialJobRoutes(app, deps) {
  // Trabajos colgados (el servidor que los ejecutaba se reinicio).
  const sweep = () => callProcedure('sp_material_jobs_interrupt').catch(() => {})
  sweep()
  setInterval(sweep, 5 * 60 * 1000).unref()

  app.get('/api/material-jobs/status', authenticate, (req, res) => {
    res.json({ data: { configured: Boolean(process.env.OPENAI_API_KEY), model: model() } })
  })

  app.get('/api/components/:id/material/ai-jobs', authenticate, async (req, res) => {
    const componentId = Number(req.params.id)
    if (!Number.isInteger(componentId)) return res.status(400).json({ message: 'Invalid request format' })
    try {
      const rows = await callProcedure('sp_material_jobs_list', { ...actor(req.user), p_component_id: componentId })
      res.json({ data: rows.map(parseJob) })
    } catch (err) {
      sendError(res, err)
    }
  })

  // Para el indicador de la barra superior: en curso y terminados hace poco.
  app.get('/api/material-jobs/recent', authenticate, async (req, res) => {
    if (!['tenant_admin', 'super_admin'].includes(req.user.roleCode)) return res.json({ data: [] })
    try {
      const rows = await callProcedure('sp_material_jobs_list', { ...actor(req.user), p_component_id: null })
      const cutoff = Date.now() - 10 * 60 * 1000
      res.json({ data: rows.map(parseJob).filter((j) => ['queued', 'running'].includes(j.status) || (j.finishedAt && new Date(j.finishedAt).getTime() > cutoff)) })
    } catch (err) {
      sendError(res, err)
    }
  })

  // body: { topicNumbers: number[] | null (todos), options: {audience, level, sector, extra} }
  app.post('/api/components/:id/material/ai-jobs', authenticate, async (req, res) => {
    const componentId = Number(req.params.id)
    if (!Number.isInteger(componentId)) return res.status(400).json({ message: 'Invalid request format' })
    if (!process.env.OPENAI_API_KEY) return res.status(503).json({ message: 'ai_not_configured' })
    const raw = req.body?.options || {}
    const options = {
      audience: text(raw.audience, 300), level: LEVELS.has(raw.level) ? raw.level : 'Intermedio',
      sector: text(raw.sector, 200), extra: text(raw.extra, 1000),
    }
    try {
      const course = await deps.loadMaterialCourse(req, componentId)
      if (!course.topics.length) return res.status(409).json({ message: 'temario_empty' })
      const all = course.topics.map((t) => t.position)
      const requested = Array.isArray(req.body?.topicNumbers) && req.body.topicNumbers.length
        ? [...new Set(req.body.topicNumbers.map(Number))].filter((n) => all.includes(n))
        : all
      if (!requested.length) return res.status(400).json({ message: 'Invalid request format' })
      const topics = course.topics.filter((t) => requested.includes(t.position)).map((t) => ({ numero: t.position, titulo: t.title, status: 'pending', errors: [] }))
      const [created] = await callProcedure('sp_material_jobs_create', {
        ...actor(req.user), p_component_id: componentId, p_topics: JSON.stringify(topics), p_options: JSON.stringify(options),
        p_total: topics.length, p_model: model(),
      })
      // Corre en segundo plano: la respuesta vuelve de inmediato.
      setImmediate(() => runJob(created.job_id, req.user, componentId, requested, options, deps))
      res.status(202).json({ data: { jobId: created.job_id, total: topics.length } })
    } catch (err) {
      sendError(res, err)
    }
  })
}
