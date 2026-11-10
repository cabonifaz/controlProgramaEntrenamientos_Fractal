import { callProcedure } from './db.js'
import { authenticate } from './middleware/authenticate.js'
import { mapStoredProcedureError } from './errors.js'

// Reacciones de los alumnos a los temas (satisfaccion 1..5 y "que se
// repita") y su feedback corto sobre tema, curso o profesor. Quien ve que
// lo decide cada SP: el instructor solo cantidades de sus temas; el admin
// todo, incluidos los comentarios.

export const FEEDBACK_MAX = 500
const TARGETS = new Set(['topic', 'component', 'instructor'])

function sendError(res, err) {
  const { status, message } = mapStoredProcedureError(err)
  res.status(status).json({ message })
}

const actor = (req) => ({ p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId })
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v))

export function registerFeedbackRoutes(app) {
  app.get('/api/reactions/mine', authenticate, async (req, res) => {
    try {
      const rows = await callProcedure('sp_reactions_list_mine', { p_actor_user_id: req.user.id })
      res.json({ data: rows.map((r) => ({ topicId: r.topic_id, satisfaction: r.satisfaction, wantsRepeat: !!r.wants_repeat })) })
    } catch (err) {
      sendError(res, err)
    }
  })

  app.post('/api/topics/:id/reaction', authenticate, async (req, res) => {
    const topicId = Number(req.params.id)
    const satisfaction = num(req.body?.satisfaction)
    const wantsRepeat = req.body?.wantsRepeat
    if (!Number.isInteger(topicId) || (satisfaction !== null && (!Number.isInteger(satisfaction) || satisfaction < 1 || satisfaction > 5))
      || (wantsRepeat !== undefined && typeof wantsRepeat !== 'boolean')) {
      return res.status(400).json({ message: 'Invalid request format' })
    }
    try {
      await callProcedure('sp_reactions_set', {
        p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_topic_id: topicId,
        p_satisfaction: satisfaction, p_wants_repeat: !!wantsRepeat,
      })
      res.json({ ok: true })
    } catch (err) {
      sendError(res, err)
    }
  })

  app.get('/api/reactions/summary', authenticate, async (req, res) => {
    try {
      const rows = await callProcedure('sp_reactions_summary', actor(req))
      res.json({
        data: rows.map((r) => ({
          topicId: r.topic_id, topicTitle: r.topic_title, scheduledOn: r.scheduled_on, sortOrder: r.sort_order,
          groupId: r.group_id, groupName: r.group_name, componentId: r.component_id, componentName: r.component_name,
          programId: r.program_id, programName: r.program_name, instructorId: r.instructor_id, instructorName: r.instructor_name,
          votes: Number(r.votes) || 0, avg: r.avg_satisfaction === null ? null : Number(r.avg_satisfaction),
          distribution: [r.s1, r.s2, r.s3, r.s4, r.s5].map((n) => Number(n) || 0),
          repeatCount: Number(r.repeat_count) || 0, reactions: Number(r.reactions) || 0,
        })),
      })
    } catch (err) {
      sendError(res, err)
    }
  })

  app.post('/api/feedback', authenticate, async (req, res) => {
    const { targetType, message } = req.body || {}
    const topicId = num(req.body?.topicId)
    const componentId = num(req.body?.componentId)
    const groupId = num(req.body?.groupId)
    const text = typeof message === 'string' ? message.trim() : ''
    if (!TARGETS.has(targetType) || !text || text.length > FEEDBACK_MAX
      || [topicId, componentId, groupId].some((v) => v !== null && !Number.isInteger(v))) {
      return res.status(400).json({ message: text.length > FEEDBACK_MAX ? 'feedback_too_long' : 'Invalid request format' })
    }
    try {
      const [result] = await callProcedure('sp_feedback_create', {
        p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_target_type: targetType,
        p_topic_id: topicId, p_component_id: componentId, p_group_id: groupId, p_message: text,
      })
      res.status(201).json({ data: result })
    } catch (err) {
      sendError(res, err)
    }
  })

  app.get('/api/feedback', authenticate, async (req, res) => {
    try {
      const rows = await callProcedure('sp_feedback_list', actor(req))
      res.json({ data: rows })
    } catch (err) {
      sendError(res, err)
    }
  })
}
