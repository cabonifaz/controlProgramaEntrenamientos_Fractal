import { callProcedure } from './db.js'
import { authenticate } from './middleware/authenticate.js'
import { mapStoredProcedureError } from './errors.js'

// Inasistencias de profesores (aviso del propio profesor o registro del
// admin), historial de cambios de profesor y los datos de los indicadores
// de inasistencias de alumnos y profesores. Las reglas viven en los SPs.

function sendError(res, err) {
  const { status, message } = mapStoredProcedureError(err)
  res.status(status).json({ message })
}

const actor = (req) => ({ p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId })
const JUSTIFICATIONS = new Set(['pending', 'justified', 'unjustified'])
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/

export function registerAbsenceRoutes(app) {
  app.get('/api/instructor-absences', authenticate, async (req, res) => {
    try {
      res.json({ data: await callProcedure('sp_instructor_absences_list', actor(req)) })
    } catch (err) {
      sendError(res, err)
    }
  })

  app.get('/api/instructor-absences/classes', authenticate, async (req, res) => {
    try {
      res.json({ data: await callProcedure('sp_instructor_absence_classes', actor(req)) })
    } catch (err) {
      sendError(res, err)
    }
  })

  app.post('/api/instructor-absences', authenticate, async (req, res) => {
    const { topicId, reason, notifiedAt, justification, substituteId } = req.body || {}
    const text = typeof reason === 'string' ? reason.trim() : ''
    if (!Number.isInteger(topicId) || !text || text.length > 500
      || (notifiedAt && (typeof notifiedAt !== 'string' || !DATETIME_RE.test(notifiedAt)))
      || (justification && !JUSTIFICATIONS.has(justification))
      || (substituteId !== undefined && substituteId !== null && !Number.isInteger(substituteId))) {
      return res.status(400).json({ message: 'Invalid request format' })
    }
    try {
      const [result] = await callProcedure('sp_instructor_absences_create', {
        ...actor(req), p_topic_id: topicId, p_reason: text,
        p_notified_at: notifiedAt ? notifiedAt.replace('T', ' ') : null,
        p_justification: justification || null, p_substitute_id: substituteId ?? null,
      })
      res.status(201).json({ data: result })
    } catch (err) {
      sendError(res, err)
    }
  })

  app.post('/api/instructor-absences/:id/resolve', authenticate, async (req, res) => {
    const id = Number(req.params.id)
    const { justification, note } = req.body || {}
    if (!Number.isInteger(id) || !JUSTIFICATIONS.has(justification)) return res.status(400).json({ message: 'Invalid request format' })
    try {
      await callProcedure('sp_instructor_absences_resolve', {
        ...actor(req), p_absence_id: id, p_justification: justification, p_note: typeof note === 'string' ? note.slice(0, 500) : null,
      })
      res.json({ ok: true })
    } catch (err) {
      sendError(res, err)
    }
  })

  app.post('/api/instructor-absences/:id/cancel', authenticate, async (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isInteger(id)) return res.status(400).json({ message: 'Invalid request format' })
    try {
      await callProcedure('sp_instructor_absences_cancel', { ...actor(req), p_absence_id: id })
      res.json({ ok: true })
    } catch (err) {
      sendError(res, err)
    }
  })

  app.get('/api/instructor-changes', authenticate, async (req, res) => {
    try {
      res.json({ data: await callProcedure('sp_instructor_changes_list', actor(req)) })
    } catch (err) {
      sendError(res, err)
    }
  })

  app.get('/api/indicators/instructors', authenticate, async (req, res) => {
    try {
      const [instructors, absences, changes] = await Promise.all([
        callProcedure('sp_instructor_indicators', actor(req)),
        callProcedure('sp_instructor_absences_list', actor(req)),
        callProcedure('sp_instructor_changes_list', actor(req)),
      ])
      res.json({ data: { instructors, absences, changes } })
    } catch (err) {
      sendError(res, err)
    }
  })

  app.get('/api/indicators/students', authenticate, async (req, res) => {
    try {
      const [events, totals] = await Promise.all([
        callProcedure('sp_student_absence_events', actor(req)),
        callProcedure('sp_student_attendance_totals', actor(req)),
      ])
      res.json({ data: { events, totals } })
    } catch (err) {
      sendError(res, err)
    }
  })
}
