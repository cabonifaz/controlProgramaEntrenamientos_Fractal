import { callProcedure } from './db.js'
import { authenticate } from './middleware/authenticate.js'
import { mapStoredProcedureError } from './errors.js'

// Autoinscripcion: un profesor, admin o super admin elige por su cuenta
// cursos (grupos) para cursarlos como alumno. Nunca uno que dicta ni uno que
// cruce, a la misma fecha y hora, con lo que ya dicta o cursa (lo valida el SP).
// Despues cursa desde "Modo alumno".

function sendError(res, err) {
  const { status, message } = mapStoredProcedureError(err)
  res.status(status).json({ message })
}
const actor = (req) => ({ p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId })
const isoDay = (value) => (value ? (value instanceof Date ? value.toISOString() : String(value)).slice(0, 10) : null)

export function registerSelfEnrollRoutes(app) {
  app.get('/api/me/course-catalog', authenticate, async (req, res) => {
    try {
      const rows = await callProcedure('sp_self_enroll_catalog', actor(req))
      res.json({
        data: rows.map((r) => ({
          programId: r.program_id, programName: r.program_name, cohort: r.cohort, tenantId: r.tenant_id, tenantName: r.tenant_name,
          startsOn: isoDay(r.starts_on), endsOn: isoDay(r.ends_on),
          componentId: r.component_id, componentName: r.component_name, groupId: r.group_id, groupName: r.group_name,
          instructorName: r.instructor_name,
          schedule: (r.schedule || '').split(',').filter(Boolean).map((x) => { const [weekday, start, end] = x.split('|'); return { weekday: Number(weekday), start, end } }),
          firstDate: isoDay(r.first_date), lastDate: isoDay(r.last_date), topicCount: Number(r.topic_count) || 0,
          enrolled: Boolean(r.enrolled), inOtherGroup: Boolean(r.in_other_group), clashes: Boolean(r.clashes),
        })),
      })
    } catch (err) {
      sendError(res, err)
    }
  })

  app.post('/api/me/enrollments', authenticate, async (req, res) => {
    const groupId = Number(req.body?.groupId)
    if (!Number.isInteger(groupId)) return res.status(400).json({ message: 'Invalid request format' })
    try {
      await callProcedure('sp_group_self_enroll', { ...actor(req), p_group_id: groupId })
      res.status(201).json({ ok: true })
    } catch (err) {
      sendError(res, err)
    }
  })

  app.delete('/api/me/enrollments/:groupId', authenticate, async (req, res) => {
    const groupId = Number(req.params.groupId)
    if (!Number.isInteger(groupId)) return res.status(400).json({ message: 'Invalid request format' })
    try {
      await callProcedure('sp_group_self_unenroll', { ...actor(req), p_group_id: groupId })
      res.json({ ok: true })
    } catch (err) {
      sendError(res, err)
    }
  })
}
