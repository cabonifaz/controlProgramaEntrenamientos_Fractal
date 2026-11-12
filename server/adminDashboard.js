import { callProcedure } from './db.js'
import { authenticate } from './middleware/authenticate.js'
import { mapStoredProcedureError } from './errors.js'

// Inicio del admin y del super admin: indicadores reales y proximas clases.
// El super admin puede filtrar por tenant (?tenantId=); sin filtro ve todo.

const isoDay = (value) => (value ? (value instanceof Date ? value.toISOString() : String(value)).slice(0, 10) : null)
const num = (v) => (v === null || v === undefined ? null : Number(v))

export function registerAdminDashboardRoutes(app) {
  app.get('/api/admin/dashboard', authenticate, async (req, res) => {
    const tenantFilter = req.query.tenantId ? Number(req.query.tenantId) : null
    if (tenantFilter !== null && !Number.isInteger(tenantFilter)) return res.status(400).json({ message: 'Invalid request format' })
    const params = { p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId, p_tenant_filter: tenantFilter }
    try {
      const [[summary], agenda] = await Promise.all([
        callProcedure('sp_admin_dashboard', params),
        callProcedure('sp_admin_dashboard_agenda', params),
      ])
      res.json({
        data: {
          summary: Object.fromEntries(Object.entries(summary || {}).map(([k, v]) => [k, num(v)])),
          agenda: agenda.map((a) => ({
            topicId: a.topic_id, title: a.title, date: isoDay(a.scheduled_on), start: a.start_time, end: a.end_time,
            groupId: a.group_id, groupName: a.group_name, componentName: a.component_name, programName: a.program_name,
            tenantName: a.tenant_name, instructorName: a.instructor_name, enrolled: Number(a.enrolled) || 0,
          })),
        },
      })
    } catch (err) {
      const { status, message } = mapStoredProcedureError(err)
      res.status(status).json({ message })
    }
  })
}
