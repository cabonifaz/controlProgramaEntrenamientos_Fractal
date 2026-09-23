import 'dotenv/config'
import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'
import { callProcedure } from './db.js'
import { hashPassword, signSessionToken, verifyPassword } from './auth.js'
import { authenticate } from './middleware/authenticate.js'
import { mapStoredProcedureError } from './errors.js'

const app = express()
const port = Number(process.env.PORT || 3000)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const VALID_ROLES = new Set(['super_admin', 'tenant_admin', 'instructor', 'student'])

app.use(express.json())

app.get('/api/health', async (_req, res) => {
  try {
    const data = await callProcedure('sp_system_health')
    res.json({ ok: true, data })
  } catch {
    res.status(503).json({ ok: false, message: 'Database procedure unavailable' })
  }
})

app.get('/api/catalogs/:code', async (req, res) => {
  try {
    const data = await callProcedure('sp_master_catalog_values_list', { p_catalog_code: req.params.code })
    res.json({ data })
  } catch {
    res.status(500).json({ message: 'Catalog unavailable' })
  }
})

// La API solo valida formato basico, compara el hash de contrasena (operacion
// criptografica, no regla de negocio) y traduce a HTTP la decision que ya tomo
// el procedimiento almacenado (usuario activo, tenant activo, bloqueo por intentos).
app.post('/api/auth/login', async (req, res) => {
  const { email, password, role } = req.body || {}
  if (typeof email !== 'string' || !email.includes('@') || typeof password !== 'string' || !password || !VALID_ROLES.has(role)) {
    return res.status(400).json({ message: 'Invalid request format' })
  }

  const ip = req.ip
  const userAgent = req.headers['user-agent'] || null

  try {
    const [context] = await callProcedure('sp_auth_get_login_context', { p_email: email, p_role_code: role })

    if (!context) {
      await callProcedure('sp_auth_log_access', {
        p_user_id: null, p_tenant_id: null, p_email: email, p_role_code: role,
        p_success: false, p_failure_reason: 'user_not_found', p_ip: ip, p_user_agent: userAgent,
      })
      return res.status(401).json({ message: 'Invalid credentials' })
    }

    if (context.is_locked) {
      await callProcedure('sp_auth_log_access', {
        p_user_id: context.user_id, p_tenant_id: context.tenant_id, p_email: email, p_role_code: role,
        p_success: false, p_failure_reason: 'locked', p_ip: ip, p_user_agent: userAgent,
      })
      return res.status(423).json({ message: 'Account temporarily locked, try again later' })
    }

    if (!context.user_is_active || (context.tenant_row_id && !context.tenant_is_active)) {
      await callProcedure('sp_auth_log_access', {
        p_user_id: context.user_id, p_tenant_id: context.tenant_id, p_email: email, p_role_code: role,
        p_success: false, p_failure_reason: 'inactive', p_ip: ip, p_user_agent: userAgent,
      })
      return res.status(403).json({ message: 'User or tenant is inactive' })
    }

    const passwordMatches = await verifyPassword(password, context.password_hash)
    await callProcedure('sp_auth_register_login_result', { p_user_id: context.user_id, p_success: passwordMatches })
    await callProcedure('sp_auth_log_access', {
      p_user_id: context.user_id, p_tenant_id: context.tenant_id, p_email: email, p_role_code: role,
      p_success: passwordMatches, p_failure_reason: passwordMatches ? null : 'bad_password', p_ip: ip, p_user_agent: userAgent,
    })

    if (!passwordMatches) {
      return res.status(401).json({ message: 'Invalid credentials' })
    }

    const token = signSessionToken({
      userId: context.user_id, tenantId: context.tenant_id, roleCode: context.role_code, fullName: context.full_name,
    })
    res.json({
      token,
      user: {
        id: context.user_id, tenantId: context.tenant_id, fullName: context.full_name,
        email: context.email, roleCode: context.role_code, mustChangePassword: !!context.must_change_password,
      },
    })
  } catch (err) {
    res.status(500).json({ message: 'Login could not be processed' })
  }
})

app.get('/api/auth/me', authenticate, (req, res) => {
  res.json({ user: req.user })
})

// No hay servicio de correo disponible, por lo que no existe un "forgot password"
// por email. El propio usuario cambia su contrasena conociendo la actual; si la
// perdio, un administrador la resetea (ver /api/admin/users/:id/reset-password).
app.post('/api/auth/change-password', authenticate, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {}
  if (typeof currentPassword !== 'string' || !currentPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
    return res.status(400).json({ message: 'Invalid request format' })
  }

  try {
    const [credentials] = await callProcedure('sp_users_get_credentials', { p_user_id: req.user.id })
    if (!credentials) return res.status(404).json({ message: 'User not found' })

    const matches = await verifyPassword(currentPassword, credentials.password_hash)
    if (!matches) return res.status(401).json({ message: 'Current password is incorrect' })

    const newHash = await hashPassword(newPassword)
    await callProcedure('sp_auth_change_own_password', { p_user_id: req.user.id, p_new_password_hash: newHash })
    res.json({ ok: true })
  } catch {
    res.status(500).json({ message: 'Password could not be changed' })
  }
})

// Reseteo forzado por un admin cuando el usuario perdio el acceso. La API solo
// genera la contrasena temporal (operacion tecnica); el SP decide si el actor
// tiene permiso sobre el usuario objetivo y responde con SIGNAL si no lo tiene.
app.post('/api/admin/users/:id/reset-password', authenticate, async (req, res) => {
  const targetUserId = Number(req.params.id)
  if (!Number.isInteger(targetUserId)) {
    return res.status(400).json({ message: 'Invalid request format' })
  }

  const temporaryPassword = crypto.randomBytes(9).toString('base64url')
  try {
    const newHash = await hashPassword(temporaryPassword)
    await callProcedure('sp_auth_admin_reset_password', {
      p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId,
      p_target_user_id: targetUserId, p_new_password_hash: newHash,
    })
    res.json({ temporaryPassword })
  } catch (err) {
    const { status, message } = mapStoredProcedureError(err)
    res.status(status).json({ message })
  }
})

app.get('/api/tenants', authenticate, async (req, res) => {
  try {
    const data = await callProcedure('sp_tenants_list', { p_actor_role: req.user.roleCode })
    res.json({ data })
  } catch (err) {
    const { status, message } = mapStoredProcedureError(err)
    res.status(status).json({ message })
  }
})

app.post('/api/tenants', authenticate, async (req, res) => {
  const { name, slug, contactName, contactEmail, timezone } = req.body || {}
  if (typeof name !== 'string' || !name.trim() || typeof slug !== 'string' || !/^[a-z0-9-]+$/.test(slug)) {
    return res.status(400).json({ message: 'Invalid request format' })
  }

  try {
    const [result] = await callProcedure('sp_tenants_create', {
      p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_name: name, p_slug: slug,
      p_contact_name: contactName || null, p_contact_email: contactEmail || null, p_timezone: timezone || null,
    })
    res.status(201).json({ data: result })
  } catch (err) {
    const { status, message } = mapStoredProcedureError(err)
    res.status(status).json({ message })
  }
})

app.patch('/api/tenants/:id', authenticate, async (req, res) => {
  const tenantId = Number(req.params.id)
  const { name, contactName, contactEmail, timezone } = req.body || {}
  if (!Number.isInteger(tenantId) || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ message: 'Invalid request format' })
  }

  try {
    await callProcedure('sp_tenants_update', {
      p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_tenant_id: tenantId, p_name: name,
      p_contact_name: contactName || null, p_contact_email: contactEmail || null, p_timezone: timezone || null,
    })
    res.json({ ok: true })
  } catch (err) {
    const { status, message } = mapStoredProcedureError(err)
    res.status(status).json({ message })
  }
})

app.post('/api/tenants/:id/status', authenticate, async (req, res) => {
  const tenantId = Number(req.params.id)
  const { statusCode } = req.body || {}
  if (!Number.isInteger(tenantId) || typeof statusCode !== 'string' || !statusCode) {
    return res.status(400).json({ message: 'Invalid request format' })
  }

  try {
    await callProcedure('sp_tenants_set_status', {
      p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_tenant_id: tenantId, p_status_code: statusCode,
    })
    res.json({ ok: true })
  } catch (err) {
    const { status, message } = mapStoredProcedureError(err)
    res.status(status).json({ message })
  }
})

app.get('/api/users', authenticate, async (req, res) => {
  const tenantIdFilter = req.query.tenantId ? Number(req.query.tenantId) : null
  const roleCodeFilter = typeof req.query.role === 'string' ? req.query.role : null
  try {
    const data = await callProcedure('sp_users_list', {
      p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId,
      p_tenant_id_filter: tenantIdFilter, p_role_code_filter: roleCodeFilter,
    })
    res.json({ data })
  } catch (err) {
    const { status, message } = mapStoredProcedureError(err)
    res.status(status).json({ message })
  }
})

app.get('/api/my/components', authenticate, async (req, res) => {
  try {
    const data = await callProcedure('sp_components_list_by_instructor', {
      p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode,
    })
    res.json({ data })
  } catch (err) {
    const { status, message } = mapStoredProcedureError(err)
    res.status(status).json({ message })
  }
})

app.get('/api/programs', authenticate, async (req, res) => {
  const tenantIdFilter = req.query.tenantId ? Number(req.query.tenantId) : null
  try {
    const data = await callProcedure('sp_programs_list', {
      p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId, p_tenant_id_filter: tenantIdFilter,
    })
    res.json({ data })
  } catch (err) {
    const { status, message } = mapStoredProcedureError(err)
    res.status(status).json({ message })
  }
})

app.post('/api/programs', authenticate, async (req, res) => {
  const { tenantId, name, description, cohort, modalityCode, startsOn, endsOn } = req.body || {}
  if (typeof name !== 'string' || !name.trim() || typeof cohort !== 'string' || !cohort.trim()) {
    return res.status(400).json({ message: 'Invalid request format' })
  }

  try {
    const [result] = await callProcedure('sp_programs_create', {
      p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId,
      p_tenant_id: tenantId ?? req.user.tenantId, p_name: name, p_description: description || null,
      p_cohort: cohort, p_modality_code: modalityCode || null, p_starts_on: startsOn || null, p_ends_on: endsOn || null,
    })
    res.status(201).json({ data: result })
  } catch (err) {
    const { status, message } = mapStoredProcedureError(err)
    res.status(status).json({ message })
  }
})

app.patch('/api/programs/:id', authenticate, async (req, res) => {
  const programId = Number(req.params.id)
  const { name, description, cohort, modalityCode, startsOn, endsOn } = req.body || {}
  if (!Number.isInteger(programId) || typeof name !== 'string' || !name.trim() || typeof cohort !== 'string' || !cohort.trim()) {
    return res.status(400).json({ message: 'Invalid request format' })
  }

  try {
    await callProcedure('sp_programs_update', {
      p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId,
      p_program_id: programId, p_name: name, p_description: description || null, p_cohort: cohort,
      p_modality_code: modalityCode || null, p_starts_on: startsOn || null, p_ends_on: endsOn || null,
    })
    res.json({ ok: true })
  } catch (err) {
    const { status, message } = mapStoredProcedureError(err)
    res.status(status).json({ message })
  }
})

app.post('/api/programs/:id/status', authenticate, async (req, res) => {
  const programId = Number(req.params.id)
  const { statusCode } = req.body || {}
  if (!Number.isInteger(programId) || typeof statusCode !== 'string' || !statusCode) {
    return res.status(400).json({ message: 'Invalid request format' })
  }

  try {
    await callProcedure('sp_programs_set_status', {
      p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId,
      p_program_id: programId, p_status_code: statusCode,
    })
    res.json({ ok: true })
  } catch (err) {
    const { status, message } = mapStoredProcedureError(err)
    res.status(status).json({ message })
  }
})

app.post('/api/programs/:id/students', authenticate, async (req, res) => {
  const programId = Number(req.params.id)
  const { studentId } = req.body || {}
  if (!Number.isInteger(programId) || !Number.isInteger(studentId)) {
    return res.status(400).json({ message: 'Invalid request format' })
  }

  try {
    await callProcedure('sp_programs_enroll_student', {
      p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId,
      p_program_id: programId, p_student_id: studentId,
    })
    res.status(201).json({ ok: true })
  } catch (err) {
    const { status, message } = mapStoredProcedureError(err)
    res.status(status).json({ message })
  }
})

app.get('/api/programs/:id/components', authenticate, async (req, res) => {
  const programId = Number(req.params.id)
  if (!Number.isInteger(programId)) return res.status(400).json({ message: 'Invalid request format' })

  try {
    const data = await callProcedure('sp_components_list', {
      p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId, p_program_id: programId,
    })
    res.json({ data })
  } catch (err) {
    const { status, message } = mapStoredProcedureError(err)
    res.status(status).json({ message })
  }
})

app.post('/api/programs/:id/components', authenticate, async (req, res) => {
  const programId = Number(req.params.id)
  const { name, description, sortOrder, instructorId } = req.body || {}
  if (!Number.isInteger(programId) || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ message: 'Invalid request format' })
  }

  try {
    const [result] = await callProcedure('sp_components_create', {
      p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId,
      p_program_id: programId, p_name: name, p_description: description || null,
      p_sort_order: sortOrder ?? 0, p_instructor_id: instructorId ?? null,
    })
    res.status(201).json({ data: result })
  } catch (err) {
    const { status, message } = mapStoredProcedureError(err)
    res.status(status).json({ message })
  }
})

app.post('/api/components/:id/instructor', authenticate, async (req, res) => {
  const componentId = Number(req.params.id)
  const { instructorId } = req.body || {}
  if (!Number.isInteger(componentId) || !Number.isInteger(instructorId)) {
    return res.status(400).json({ message: 'Invalid request format' })
  }

  try {
    await callProcedure('sp_components_assign_instructor', {
      p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId,
      p_component_id: componentId, p_instructor_id: instructorId,
    })
    res.json({ ok: true })
  } catch (err) {
    const { status, message } = mapStoredProcedureError(err)
    res.status(status).json({ message })
  }
})

app.post('/api/components/:id/students', authenticate, async (req, res) => {
  const componentId = Number(req.params.id)
  const { studentId } = req.body || {}
  if (!Number.isInteger(componentId) || !Number.isInteger(studentId)) {
    return res.status(400).json({ message: 'Invalid request format' })
  }

  try {
    await callProcedure('sp_components_enroll_student', {
      p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId,
      p_component_id: componentId, p_student_id: studentId,
    })
    res.status(201).json({ ok: true })
  } catch (err) {
    const { status, message } = mapStoredProcedureError(err)
    res.status(status).json({ message })
  }
})

app.get('/api/components/:id/topics', authenticate, async (req, res) => {
  const componentId = Number(req.params.id)
  if (!Number.isInteger(componentId)) return res.status(400).json({ message: 'Invalid request format' })

  try {
    const data = await callProcedure('sp_topics_list', {
      p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId, p_component_id: componentId,
    })
    res.json({ data })
  } catch (err) {
    const { status, message } = mapStoredProcedureError(err)
    res.status(status).json({ message })
  }
})

app.post('/api/components/:id/topics', authenticate, async (req, res) => {
  const componentId = Number(req.params.id)
  const { title, description, sortOrder, scheduledOn, durationMinutes } = req.body || {}
  if (!Number.isInteger(componentId) || typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ message: 'Invalid request format' })
  }

  try {
    const [result] = await callProcedure('sp_topics_create', {
      p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId,
      p_component_id: componentId, p_title: title, p_description: description || null,
      p_sort_order: sortOrder ?? 0, p_scheduled_on: scheduledOn || null, p_duration_minutes: durationMinutes ?? null,
    })
    res.status(201).json({ data: result })
  } catch (err) {
    const { status, message } = mapStoredProcedureError(err)
    res.status(status).json({ message })
  }
})

app.post('/api/topics/:id/status', authenticate, async (req, res) => {
  const topicId = Number(req.params.id)
  const { statusCode, actualDate } = req.body || {}
  if (!Number.isInteger(topicId) || typeof statusCode !== 'string' || !statusCode) {
    return res.status(400).json({ message: 'Invalid request format' })
  }

  try {
    await callProcedure('sp_topics_update_status', {
      p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId,
      p_topic_id: topicId, p_status_code: statusCode, p_actual_date: actualDate || null,
    })
    res.json({ ok: true })
  } catch (err) {
    const { status, message } = mapStoredProcedureError(err)
    res.status(status).json({ message })
  }
})

app.post('/api/topics/:id/reschedule', authenticate, async (req, res) => {
  const topicId = Number(req.params.id)
  const { newDate } = req.body || {}
  if (!Number.isInteger(topicId) || typeof newDate !== 'string' || !newDate) {
    return res.status(400).json({ message: 'Invalid request format' })
  }

  try {
    await callProcedure('sp_topics_reschedule', {
      p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId,
      p_topic_id: topicId, p_new_date: newDate,
    })
    res.json({ ok: true })
  } catch (err) {
    const { status, message } = mapStoredProcedureError(err)
    res.status(status).json({ message })
  }
})

app.get('/api/programs/:id/schedule-days', authenticate, async (req, res) => {
  const programId = Number(req.params.id)
  if (!Number.isInteger(programId)) return res.status(400).json({ message: 'Invalid request format' })

  try {
    const data = await callProcedure('sp_program_schedule_days_list', {
      p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId, p_program_id: programId,
    })
    res.json({ data })
  } catch (err) {
    const { status, message } = mapStoredProcedureError(err)
    res.status(status).json({ message })
  }
})

app.post('/api/programs/:id/schedule-days', authenticate, async (req, res) => {
  const programId = Number(req.params.id)
  const { weekday, startTime, endTime } = req.body || {}
  if (!Number.isInteger(programId) || !Number.isInteger(weekday) || weekday < 0 || weekday > 6 ||
      typeof startTime !== 'string' || typeof endTime !== 'string') {
    return res.status(400).json({ message: 'Invalid request format' })
  }

  try {
    await callProcedure('sp_program_schedule_days_add', {
      p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId,
      p_program_id: programId, p_weekday: weekday, p_start_time: startTime, p_end_time: endTime,
    })
    res.status(201).json({ ok: true })
  } catch (err) {
    const { status, message } = mapStoredProcedureError(err)
    res.status(status).json({ message })
  }
})

app.delete('/api/programs/:id/schedule-days/:weekday', authenticate, async (req, res) => {
  const programId = Number(req.params.id)
  const weekday = Number(req.params.weekday)
  if (!Number.isInteger(programId) || !Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    return res.status(400).json({ message: 'Invalid request format' })
  }

  try {
    await callProcedure('sp_program_schedule_days_remove', {
      p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId,
      p_program_id: programId, p_weekday: weekday,
    })
    res.json({ ok: true })
  } catch (err) {
    const { status, message } = mapStoredProcedureError(err)
    res.status(status).json({ message })
  }
})

app.post('/api/components/:id/generate-schedule', authenticate, async (req, res) => {
  const componentId = Number(req.params.id)
  const { startDate } = req.body || {}
  if (!Number.isInteger(componentId)) return res.status(400).json({ message: 'Invalid request format' })

  try {
    const [result] = await callProcedure('sp_topics_generate_schedule', {
      p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId,
      p_component_id: componentId, p_start_date: startDate || null,
    })
    res.json({ data: result })
  } catch (err) {
    const { status, message } = mapStoredProcedureError(err)
    res.status(status).json({ message })
  }
})

// Cada reporte es una SP de agregacion pura; esta ruta solo elige cual
// invocar. Los 3 parametros de tenant/rol son identicos en todos, por eso
// es una sola ruta parametrizada en vez de 9 handlers casi identicos.
const REPORT_PROCEDURES = {
  'attendance-by-program': 'sp_reports_attendance_by_program',
  'attendance-by-component': 'sp_reports_attendance_by_component',
  'attendance-by-student': 'sp_reports_attendance_by_student',
  'program-progress': 'sp_reports_program_progress',
  'component-progress': 'sp_reports_component_progress',
  'instructor-compliance': 'sp_reports_instructor_compliance',
  'delayed-topics': 'sp_reports_delayed_topics',
  'ahead-topics': 'sp_reports_ahead_topics',
  'leave-requests-summary': 'sp_reports_leave_requests_summary',
}

// Debe registrarse antes de /api/reports/:key para no chocar con ese patron.
app.get('/api/reports/period-comparison', authenticate, async (req, res) => {
  const { start, end } = req.query
  const tenantIdFilter = req.query.tenantId ? Number(req.query.tenantId) : null
  if (typeof start !== 'string' || !start || typeof end !== 'string' || !end) {
    return res.status(400).json({ message: 'Invalid request format' })
  }
  try {
    const data = await callProcedure('sp_reports_period_comparison', {
      p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId,
      p_tenant_id_filter: tenantIdFilter, p_period_start: start, p_period_end: end,
    })
    res.json({ data })
  } catch (err) {
    const { status, message } = mapStoredProcedureError(err)
    res.status(status).json({ message })
  }
})

app.get('/api/reports/:key', authenticate, async (req, res) => {
  const procedureName = REPORT_PROCEDURES[req.params.key]
  if (!procedureName) return res.status(404).json({ message: 'Unknown report' })

  const tenantIdFilter = req.query.tenantId ? Number(req.query.tenantId) : null
  try {
    const data = await callProcedure(procedureName, {
      p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId, p_tenant_id_filter: tenantIdFilter,
    })
    res.json({ data })
  } catch (err) {
    const { status, message } = mapStoredProcedureError(err)
    res.status(status).json({ message })
  }
})

app.get('/api/reports/absences/:justified', authenticate, async (req, res) => {
  if (!['justified', 'unjustified'].includes(req.params.justified)) {
    return res.status(400).json({ message: 'Invalid request format' })
  }
  const tenantIdFilter = req.query.tenantId ? Number(req.query.tenantId) : null
  try {
    const data = await callProcedure('sp_reports_absences', {
      p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId,
      p_tenant_id_filter: tenantIdFilter, p_justified: req.params.justified === 'justified',
    })
    res.json({ data })
  } catch (err) {
    const { status, message } = mapStoredProcedureError(err)
    res.status(status).json({ message })
  }
})

app.post('/api/alerts/detect', authenticate, async (req, res) => {
  try {
    const [result] = await callProcedure('sp_alerts_run_detection', {
      p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId,
    })
    res.json({ data: result })
  } catch (err) {
    const { status, message } = mapStoredProcedureError(err)
    res.status(status).json({ message })
  }
})

app.get('/api/alerts', authenticate, async (req, res) => {
  try {
    const data = await callProcedure('sp_alerts_list', {
      p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId,
    })
    res.json({ data })
  } catch (err) {
    const { status, message } = mapStoredProcedureError(err)
    res.status(status).json({ message })
  }
})

app.post('/api/alerts/:id/read', authenticate, async (req, res) => {
  const alertId = Number(req.params.id)
  if (!Number.isInteger(alertId)) return res.status(400).json({ message: 'Invalid request format' })

  try {
    await callProcedure('sp_alerts_mark_read', {
      p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId, p_alert_id: alertId,
    })
    res.json({ ok: true })
  } catch (err) {
    const { status, message } = mapStoredProcedureError(err)
    res.status(status).json({ message })
  }
})

app.get('/api/holidays', authenticate, async (req, res) => {
  const tenantIdFilter = req.query.tenantId ? Number(req.query.tenantId) : null
  try {
    const data = await callProcedure('sp_holidays_list', {
      p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId, p_tenant_id_filter: tenantIdFilter,
    })
    res.json({ data })
  } catch (err) {
    const { status, message } = mapStoredProcedureError(err)
    res.status(status).json({ message })
  }
})

app.post('/api/holidays', authenticate, async (req, res) => {
  const { tenantId, holidayOn, name, typeCode } = req.body || {}
  if (typeof holidayOn !== 'string' || !holidayOn || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ message: 'Invalid request format' })
  }

  try {
    const [result] = await callProcedure('sp_holidays_create', {
      p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId,
      p_tenant_id: tenantId ?? req.user.tenantId, p_holiday_on: holidayOn, p_name: name, p_type_code: typeCode || null,
    })
    res.status(201).json({ data: result })
  } catch (err) {
    const { status, message } = mapStoredProcedureError(err)
    res.status(status).json({ message })
  }
})

app.post('/api/users', authenticate, async (req, res) => {
  const { tenantId, fullName, email, password, roleCode } = req.body || {}
  if (
    typeof fullName !== 'string' || !fullName.trim() ||
    typeof email !== 'string' || !email.includes('@') ||
    typeof password !== 'string' || password.length < 8 ||
    !VALID_ROLES.has(roleCode)
  ) {
    return res.status(400).json({ message: 'Invalid request format' })
  }

  try {
    const passwordHash = await hashPassword(password)
    const [result] = await callProcedure('sp_users_create', {
      p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId,
      p_target_tenant_id: tenantId ?? req.user.tenantId ?? null, p_full_name: fullName, p_email: email,
      p_password_hash: passwordHash, p_role_code: roleCode,
    })
    res.status(201).json({ data: result })
  } catch (err) {
    const { status, message } = mapStoredProcedureError(err)
    res.status(status).json({ message })
  }
})

app.post('/api/users/:id/active', authenticate, async (req, res) => {
  const targetUserId = Number(req.params.id)
  const { isActive } = req.body || {}
  if (!Number.isInteger(targetUserId) || typeof isActive !== 'boolean') {
    return res.status(400).json({ message: 'Invalid request format' })
  }

  try {
    await callProcedure('sp_users_set_active', {
      p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId,
      p_target_user_id: targetUserId, p_is_active: isActive,
    })
    res.json({ ok: true })
  } catch (err) {
    const { status, message } = mapStoredProcedureError(err)
    res.status(status).json({ message })
  }
})

app.get('/api/dashboard/:role', authenticate, async (req, res) => {
  try {
    const data = await callProcedure('sp_dashboard_get', { p_user_id: req.user.id, p_role: req.params.role, p_tenant_id: req.user.tenantId })
    res.json({ data })
  } catch {
    res.status(500).json({ message: 'Dashboard procedure unavailable' })
  }
})

const AGENDA_PROCEDURE_BY_ROLE = { student: 'sp_student_agenda', instructor: 'sp_instructor_agenda' }
const METRICS_PROCEDURE_BY_ROLE = { student: 'sp_student_metrics', instructor: 'sp_instructor_metrics' }

app.get('/api/me/agenda', authenticate, async (req, res) => {
  const procedureName = AGENDA_PROCEDURE_BY_ROLE[req.user.roleCode]
  if (!procedureName) return res.status(403).json({ message: 'No agenda available for this role' })
  try {
    const data = await callProcedure(procedureName, { p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode })
    res.json({ data })
  } catch (err) {
    const { status, message } = mapStoredProcedureError(err)
    res.status(status).json({ message })
  }
})

app.get('/api/me/metrics', authenticate, async (req, res) => {
  const procedureName = METRICS_PROCEDURE_BY_ROLE[req.user.roleCode]
  if (!procedureName) return res.status(403).json({ message: 'No metrics available for this role' })
  try {
    const [result] = await callProcedure(procedureName, { p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode })
    res.json({ data: result || {} })
  } catch (err) {
    const { status, message } = mapStoredProcedureError(err)
    res.status(status).json({ message })
  }
})

app.get('/api/topics/:id/attendance', authenticate, async (req, res) => {
  const topicId = Number(req.params.id)
  if (!Number.isInteger(topicId)) return res.status(400).json({ message: 'Invalid request format' })

  try {
    const data = await callProcedure('sp_attendance_list_by_topic', {
      p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId, p_actor_user_id: req.user.id, p_topic_id: topicId,
    })
    res.json({ data })
  } catch (err) {
    const { status, message } = mapStoredProcedureError(err)
    res.status(status).json({ message })
  }
})

app.post('/api/topics/:id/attendance', authenticate, async (req, res) => {
  const topicId = Number(req.params.id)
  const { studentId, statusCode, reasonCode, observations } = req.body || {}
  if (!Number.isInteger(topicId) || !Number.isInteger(studentId) || typeof statusCode !== 'string' || !statusCode) {
    return res.status(400).json({ message: 'Invalid request format' })
  }

  try {
    await callProcedure('sp_attendance_upsert', {
      p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId,
      p_topic_id: topicId, p_student_id: studentId, p_status_code: statusCode,
      p_reason_code: reasonCode || null, p_observations: observations || null,
    })
    res.status(201).json({ ok: true })
  } catch (err) {
    const { status, message } = mapStoredProcedureError(err)
    res.status(status).json({ message })
  }
})

app.get('/api/students/:id/attendance', authenticate, async (req, res) => {
  const studentId = Number(req.params.id)
  if (!Number.isInteger(studentId)) return res.status(400).json({ message: 'Invalid request format' })

  try {
    const data = await callProcedure('sp_attendance_list_by_student', {
      p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId, p_actor_user_id: req.user.id, p_student_id: studentId,
    })
    res.json({ data })
  } catch (err) {
    const { status, message } = mapStoredProcedureError(err)
    res.status(status).json({ message })
  }
})

app.get('/api/leave-requests', authenticate, async (req, res) => {
  try {
    const data = await callProcedure('sp_leave_requests_list', {
      p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId,
    })
    res.json({ data })
  } catch (err) {
    const { status, message } = mapStoredProcedureError(err)
    res.status(status).json({ message })
  }
})

app.post('/api/leave-requests', authenticate, async (req, res) => {
  const { startsOn, endsOn, reason, leaveTypeCode, evidenceUrl } = req.body || {}
  if (typeof startsOn !== 'string' || !startsOn || typeof endsOn !== 'string' || !endsOn || typeof reason !== 'string' || !reason.trim()) {
    return res.status(400).json({ message: 'Invalid request format' })
  }

  try {
    const [result] = await callProcedure('sp_leave_requests_create', {
      p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_starts_on: startsOn, p_ends_on: endsOn,
      p_reason: reason, p_leave_type_code: leaveTypeCode || null, p_evidence_url: evidenceUrl || null,
    })
    res.status(201).json({ data: result })
  } catch (err) {
    const { status, message } = mapStoredProcedureError(err)
    res.status(status).json({ message })
  }
})

app.post('/api/leave-requests/:id/resolve', authenticate, async (req, res) => {
  const leaveRequestId = Number(req.params.id)
  const { statusCode, adminComments } = req.body || {}
  if (!Number.isInteger(leaveRequestId) || !['approved', 'rejected'].includes(statusCode)) {
    return res.status(400).json({ message: 'Invalid request format' })
  }

  try {
    await callProcedure('sp_leave_requests_resolve', {
      p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId,
      p_leave_request_id: leaveRequestId, p_status_code: statusCode, p_admin_comments: adminComments || null,
    })
    res.json({ ok: true })
  } catch (err) {
    const { status, message } = mapStoredProcedureError(err)
    res.status(status).json({ message })
  }
})

app.post('/api/leave-requests/:id/cancel', authenticate, async (req, res) => {
  const leaveRequestId = Number(req.params.id)
  if (!Number.isInteger(leaveRequestId)) return res.status(400).json({ message: 'Invalid request format' })

  try {
    await callProcedure('sp_leave_requests_cancel', {
      p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_leave_request_id: leaveRequestId,
    })
    res.json({ ok: true })
  } catch (err) {
    const { status, message } = mapStoredProcedureError(err)
    res.status(status).json({ message })
  }
})

if (process.env.NODE_ENV === 'production') {
  const dist = path.resolve(__dirname, '../dist')
  app.use(express.static(dist))
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')))
}

app.listen(port, () => console.log(`Training monolith listening on http://localhost:${port}`))