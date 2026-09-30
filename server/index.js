import 'dotenv/config'
import express from 'express'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'
import { callProcedure } from './db.js'
import { hashPassword, signSessionToken, verifyPassword } from './auth.js'
import { authenticate } from './middleware/authenticate.js'
import { mapStoredProcedureError } from './errors.js'
import { uploadLogo, uploadSpreadsheet, UPLOADS_DIR } from './uploads.js'
import {
  buildTemplateBuffer, parseUploadBuffer, toDateString, toTrimmedString, toIntOrNull,
  loadWorkbook, findSheetByHeaders, parseSheetRows, parseTimeRange, minutesToTime,
} from './excel.js'

const app = express()
const port = Number(process.env.PORT || 3000)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const VALID_ROLES = new Set(['super_admin', 'tenant_admin', 'instructor', 'student'])
// Regla de negocio del cliente: todo tema de un componente dura 45 min fijo,
// no se pide en el formulario ni en la carga por Excel.
const TOPIC_DURATION_MINUTES = 45

app.use(express.json())
// Publico a proposito (logos de tenant): sin datos sensibles, se sirve tal
// cual desde el volumen persistente configurado en UPLOADS_DIR.
app.use('/uploads', express.static(UPLOADS_DIR))

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

// Publico a proposito: el login propio de un tenant (/t/:slug) necesita su
// logo y color ANTES de autenticar a nadie. No expone contacto ni datos internos.
app.get('/api/public/tenants/:slug/branding', async (req, res) => {
  try {
    const [data] = await callProcedure('sp_tenants_get_public_branding', { p_slug: req.params.slug })
    if (!data) return res.status(404).json({ message: 'tenant_not_found' })
    res.json({
      data: {
        name: data.name,
        slug: data.slug,
        logoUrl: data.logo_path ? `/uploads/${data.logo_path}` : null,
        brandColor: data.brand_color || null,
      },
    })
  } catch {
    res.status(500).json({ message: 'tenant_branding_unavailable' })
  }
})

// El login no pide ni muestra rol: cada correo tiene un unico rol en la
// cuenta (UNIQUE en users.email), asi que el SP lo determina el mismo, no
// el cliente. La API solo valida formato basico, compara el hash de
// contrasena (operacion criptografica, no regla de negocio) y traduce a
// HTTP la decision que ya tomo el procedimiento almacenado.
app.post('/api/auth/login', async (req, res) => {
  const { email, password, tenantSlug } = req.body || {}
  if (typeof email !== 'string' || !email.includes('@') || typeof password !== 'string' || !password) {
    return res.status(400).json({ message: 'Invalid request format' })
  }

  const ip = req.ip
  const userAgent = req.headers['user-agent'] || null

  try {
    const [context] = await callProcedure('sp_auth_get_login_context', { p_email: email })

    if (!context) {
      await callProcedure('sp_auth_log_access', {
        p_user_id: null, p_tenant_id: null, p_email: email, p_role_code: null,
        p_success: false, p_failure_reason: 'user_not_found', p_ip: ip, p_user_agent: userAgent,
      })
      return res.status(401).json({ message: 'Invalid credentials' })
    }

    // Login desde el link propio de un tenant (/t/:slug): solo autentica
    // cuentas que pertenecen a ESE tenant. Se trata igual que "no existe"
    // para no revelar si el correo existe en otro tenant.
    if (tenantSlug && context.tenant_slug !== tenantSlug) {
      await callProcedure('sp_auth_log_access', {
        p_user_id: context.user_id, p_tenant_id: context.tenant_id, p_email: email, p_role_code: context.role_code,
        p_success: false, p_failure_reason: 'tenant_mismatch', p_ip: ip, p_user_agent: userAgent,
      })
      return res.status(401).json({ message: 'Invalid credentials' })
    }

    if (context.is_locked) {
      await callProcedure('sp_auth_log_access', {
        p_user_id: context.user_id, p_tenant_id: context.tenant_id, p_email: email, p_role_code: context.role_code,
        p_success: false, p_failure_reason: 'locked', p_ip: ip, p_user_agent: userAgent,
      })
      return res.status(423).json({ message: 'Account temporarily locked, try again later' })
    }

    if (!context.user_is_active || (context.tenant_row_id && !context.tenant_is_active)) {
      await callProcedure('sp_auth_log_access', {
        p_user_id: context.user_id, p_tenant_id: context.tenant_id, p_email: email, p_role_code: context.role_code,
        p_success: false, p_failure_reason: 'inactive', p_ip: ip, p_user_agent: userAgent,
      })
      return res.status(403).json({ message: 'User or tenant is inactive' })
    }

    const passwordMatches = await verifyPassword(password, context.password_hash)
    await callProcedure('sp_auth_register_login_result', { p_user_id: context.user_id, p_success: passwordMatches })
    await callProcedure('sp_auth_log_access', {
      p_user_id: context.user_id, p_tenant_id: context.tenant_id, p_email: email, p_role_code: context.role_code,
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
        tenantLogoUrl: context.tenant_logo_path ? `/uploads/${context.tenant_logo_path}` : null,
        tenantBrandColor: context.tenant_brand_color || null,
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

// Cualquier rol autenticado puede leer su propio tenant (nombre, logo);
// super_admin no tiene tenant, asi que no aplica para ese rol.
app.get('/api/tenants/me', authenticate, async (req, res) => {
  if (!req.user.tenantId) return res.status(404).json({ message: 'tenant_not_found' })
  try {
    const [data] = await callProcedure('sp_tenants_get', {
      p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId, p_tenant_id: req.user.tenantId,
    })
    res.json({ data: data || null })
  } catch (err) {
    const { status, message } = mapStoredProcedureError(err)
    res.status(status).json({ message })
  }
})

app.post('/api/tenants/:id/logo', authenticate, async (req, res) => {
  const tenantId = Number(req.params.id)
  if (!Number.isInteger(tenantId)) return res.status(400).json({ message: 'Invalid request format' })

  try {
    await uploadLogo(req, res)
  } catch (err) {
    return res.status(400).json({ message: err.message === 'invalid_file_type' ? 'invalid_file_type' : 'upload_failed' })
  }
  if (!req.file) return res.status(400).json({ message: 'Invalid request format' })

  const logoPath = `tenants/${tenantId}/${req.file.filename}`
  try {
    await callProcedure('sp_tenants_set_logo', {
      p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId,
      p_tenant_id: tenantId, p_logo_path: logoPath,
    })
    res.json({ logoUrl: `/uploads/${logoPath}` })
  } catch (err) {
    fs.unlink(path.join(UPLOADS_DIR, logoPath), () => {})
    const { status, message } = mapStoredProcedureError(err)
    res.status(status).json({ message })
  }
})

app.post('/api/tenants/:id/brand-color', authenticate, async (req, res) => {
  const tenantId = Number(req.params.id)
  const { brandColor } = req.body || {}
  if (!Number.isInteger(tenantId) || (brandColor !== null && !/^#[0-9A-Fa-f]{6}$/.test(brandColor || ''))) {
    return res.status(400).json({ message: 'Invalid request format' })
  }
  try {
    await callProcedure('sp_tenants_set_brand_color', {
      p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId,
      p_tenant_id: tenantId, p_brand_color: brandColor || null,
    })
    res.json({ brandColor: brandColor || null })
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

app.get('/api/my/groups', authenticate, async (req, res) => {
  try {
    const data = await callProcedure('sp_groups_list_by_instructor', {
      p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode,
    })
    res.json({ data })
  } catch (err) {
    const { status, message } = mapStoredProcedureError(err)
    res.status(status).json({ message })
  }
})

// Todo el temario del instructor (pasado y futuro): alimenta su calendario
// semanal visual, sin el recorte a "solo proximas 10" de /api/me/agenda.
app.get('/api/my/topics', authenticate, async (req, res) => {
  try {
    const data = await callProcedure('sp_topics_list_by_instructor', {
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

// Vista unificada: todos los grupos (de todos los componentes) de un
// programa, y todos sus horarios, en dos llamadas -- alimenta el horario
// semanal de programa completo (un solo grid para armar toda la malla).
app.get('/api/programs/:id/groups', authenticate, async (req, res) => {
  const programId = Number(req.params.id)
  if (!Number.isInteger(programId)) return res.status(400).json({ message: 'Invalid request format' })

  try {
    const data = await callProcedure('sp_component_groups_list_by_program', {
      p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId, p_program_id: programId,
    })
    res.json({ data })
  } catch (err) {
    const { status, message } = mapStoredProcedureError(err)
    res.status(status).json({ message })
  }
})

app.get('/api/programs/:id/schedule-days', authenticate, async (req, res) => {
  const programId = Number(req.params.id)
  if (!Number.isInteger(programId)) return res.status(400).json({ message: 'Invalid request format' })

  try {
    const data = await callProcedure('sp_group_schedule_days_list_by_program', {
      p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId, p_program_id: programId,
    })
    res.json({ data })
  } catch (err) {
    const { status, message } = mapStoredProcedureError(err)
    res.status(status).json({ message })
  }
})

// Temario real (con fecha) de todos los grupos del programa: alimenta la
// vista de calendario semana por semana.
app.get('/api/programs/:id/topics', authenticate, async (req, res) => {
  const programId = Number(req.params.id)
  if (!Number.isInteger(programId)) return res.status(400).json({ message: 'Invalid request format' })

  try {
    const data = await callProcedure('sp_topics_list_by_program', {
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
  const { name, description, sortOrder } = req.body || {}
  if (!Number.isInteger(programId) || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ message: 'Invalid request format' })
  }

  try {
    const [result] = await callProcedure('sp_components_create', {
      p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId,
      p_program_id: programId, p_name: name, p_description: description || null, p_sort_order: sortOrder ?? 0,
    })
    res.status(201).json({ data: result })
  } catch (err) {
    const { status, message } = mapStoredProcedureError(err)
    res.status(status).json({ message })
  }
})

app.patch('/api/components/:id', authenticate, async (req, res) => {
  const componentId = Number(req.params.id)
  const { name, description, sortOrder } = req.body || {}
  if (!Number.isInteger(componentId) || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ message: 'Invalid request format' })
  }

  try {
    await callProcedure('sp_components_update', {
      p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId,
      p_component_id: componentId, p_name: name, p_description: description || null, p_sort_order: sortOrder ?? null,
    })
    res.json({ ok: true })
  } catch (err) {
    const { status, message } = mapStoredProcedureError(err)
    res.status(status).json({ message })
  }
})

app.get('/api/components/:id/groups', authenticate, async (req, res) => {
  const componentId = Number(req.params.id)
  if (!Number.isInteger(componentId)) return res.status(400).json({ message: 'Invalid request format' })

  try {
    const data = await callProcedure('sp_component_groups_list', {
      p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId, p_component_id: componentId,
    })
    res.json({ data })
  } catch (err) {
    const { status, message } = mapStoredProcedureError(err)
    res.status(status).json({ message })
  }
})

app.post('/api/components/:id/groups', authenticate, async (req, res) => {
  const componentId = Number(req.params.id)
  const { name, instructorId } = req.body || {}
  if (!Number.isInteger(componentId) || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ message: 'Invalid request format' })
  }

  try {
    const [result] = await callProcedure('sp_component_groups_create', {
      p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId,
      p_component_id: componentId, p_name: name, p_instructor_id: instructorId ?? null,
    })
    res.status(201).json({ data: result })
  } catch (err) {
    const { status, message } = mapStoredProcedureError(err)
    res.status(status).json({ message })
  }
})

app.patch('/api/groups/:id', authenticate, async (req, res) => {
  const groupId = Number(req.params.id)
  const { name, instructorId } = req.body || {}
  if (!Number.isInteger(groupId)) return res.status(400).json({ message: 'Invalid request format' })

  try {
    await callProcedure('sp_component_groups_update', {
      p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId,
      p_group_id: groupId, p_name: name || '', p_instructor_id: instructorId ?? null,
    })
    res.json({ ok: true })
  } catch (err) {
    const { status, message } = mapStoredProcedureError(err)
    res.status(status).json({ message })
  }
})

app.post('/api/groups/:id/students', authenticate, async (req, res) => {
  const groupId = Number(req.params.id)
  const { studentId } = req.body || {}
  if (!Number.isInteger(groupId) || !Number.isInteger(studentId)) {
    return res.status(400).json({ message: 'Invalid request format' })
  }

  try {
    await callProcedure('sp_group_enrollments_add', {
      p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId,
      p_group_id: groupId, p_student_id: studentId,
    })
    res.status(201).json({ ok: true })
  } catch (err) {
    const { status, message } = mapStoredProcedureError(err)
    res.status(status).json({ message })
  }
})

app.get('/api/groups/:id/topics', authenticate, async (req, res) => {
  const groupId = Number(req.params.id)
  if (!Number.isInteger(groupId)) return res.status(400).json({ message: 'Invalid request format' })

  try {
    const data = await callProcedure('sp_topics_list', {
      p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId, p_group_id: groupId,
    })
    res.json({ data })
  } catch (err) {
    const { status, message } = mapStoredProcedureError(err)
    res.status(status).json({ message })
  }
})

app.post('/api/groups/:id/topics', authenticate, async (req, res) => {
  const groupId = Number(req.params.id)
  const { title, description, sortOrder, scheduledOn, durationMinutes } = req.body || {}
  if (!Number.isInteger(groupId) || typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ message: 'Invalid request format' })
  }

  try {
    const [result] = await callProcedure('sp_topics_create', {
      p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId,
      p_group_id: groupId, p_title: title, p_description: description || null,
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

app.get('/api/groups/:id/schedule-days', authenticate, async (req, res) => {
  const groupId = Number(req.params.id)
  if (!Number.isInteger(groupId)) return res.status(400).json({ message: 'Invalid request format' })

  try {
    const data = await callProcedure('sp_group_schedule_days_list', {
      p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId, p_group_id: groupId,
    })
    res.json({ data })
  } catch (err) {
    const { status, message } = mapStoredProcedureError(err)
    res.status(status).json({ message })
  }
})

app.post('/api/groups/:id/schedule-days', authenticate, async (req, res) => {
  const groupId = Number(req.params.id)
  const { weekday, startTime, endTime } = req.body || {}
  if (!Number.isInteger(groupId) || !Number.isInteger(weekday) || weekday < 0 || weekday > 6 ||
      typeof startTime !== 'string' || typeof endTime !== 'string') {
    return res.status(400).json({ message: 'Invalid request format' })
  }

  try {
    await callProcedure('sp_group_schedule_days_add', {
      p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId,
      p_group_id: groupId, p_weekday: weekday, p_start_time: startTime, p_end_time: endTime,
    })
    res.status(201).json({ ok: true })
  } catch (err) {
    const { status, message } = mapStoredProcedureError(err)
    res.status(status).json({ message })
  }
})

app.delete('/api/groups/:id/schedule-days/:weekday', authenticate, async (req, res) => {
  const groupId = Number(req.params.id)
  const weekday = Number(req.params.weekday)
  if (!Number.isInteger(groupId) || !Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    return res.status(400).json({ message: 'Invalid request format' })
  }

  try {
    await callProcedure('sp_group_schedule_days_remove', {
      p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId,
      p_group_id: groupId, p_weekday: weekday,
    })
    res.json({ ok: true })
  } catch (err) {
    const { status, message } = mapStoredProcedureError(err)
    res.status(status).json({ message })
  }
})

app.post('/api/groups/:id/generate-schedule', authenticate, async (req, res) => {
  const groupId = Number(req.params.id)
  const { startDate } = req.body || {}
  if (!Number.isInteger(groupId)) return res.status(400).json({ message: 'Invalid request format' })

  try {
    const [result] = await callProcedure('sp_topics_generate_schedule', {
      p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId,
      p_group_id: groupId, p_start_date: startDate || null,
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

// ===================================================================
// Carga masiva por Excel: una plantilla descargable y un endpoint de
// import por entidad. Cada fila reutiliza el mismo SP que el formulario
// manual (una llamada por fila); los errores de negocio (SIGNAL) se
// reportan por fila y no abortan el resto del archivo.
// ===================================================================
const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

function sendXlsx(res, buffer, filename) {
  res.setHeader('Content-Type', XLSX_CONTENT_TYPE)
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  res.send(buffer)
}

async function readSpreadsheetUpload(req, res) {
  try {
    await uploadSpreadsheet(req, res)
  } catch (err) {
    res.status(400).json({ message: err.message === 'invalid_file_type' ? 'invalid_file_type' : 'upload_failed' })
    return null
  }
  if (!req.file) {
    res.status(400).json({ message: 'Invalid request format' })
    return null
  }
  return req.file.buffer
}

function summarize(results) {
  return { created: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results }
}

const PROGRAM_IMPORT_COLUMNS = [
  { header: 'Nombre', key: 'name' },
  { header: 'Cohorte', key: 'cohort' },
  { header: 'Descripción', key: 'description' },
  { header: 'Modalidad (presencial/virtual/hibrida)', key: 'modality' },
  { header: 'Fecha inicio (AAAA-MM-DD)', key: 'startsOn' },
  { header: 'Fecha fin (AAAA-MM-DD)', key: 'endsOn' },
  { header: 'Tenant (slug, solo super_admin)', key: 'tenantSlug' },
]
const MODALITY_LABEL_TO_CODE = { presencial: 'onsite', virtual: 'virtual', hibrida: 'hybrid', hibrido: 'hybrid' }

app.get('/api/templates/programs', async (_req, res) => {
  const buffer = await buildTemplateBuffer('Cursos', PROGRAM_IMPORT_COLUMNS, [
    { name: 'Full-stack 2026', cohort: '2026-1', description: 'Programa completo de formación full-stack', modality: 'presencial', startsOn: '2026-03-02', endsOn: '2026-08-28', tenantSlug: '' },
  ])
  sendXlsx(res, buffer, 'plantilla-cursos.xlsx')
})

app.post('/api/programs/import', authenticate, async (req, res) => {
  const buffer = await readSpreadsheetUpload(req, res)
  if (!buffer) return

  let tenantBySlug = null
  if (req.user.roleCode === 'super_admin') {
    const tenants = await callProcedure('sp_tenants_list', { p_actor_role: req.user.roleCode })
    tenantBySlug = new Map(tenants.map((t) => [t.slug, t.id]))
  }

  const rows = await parseUploadBuffer(buffer, PROGRAM_IMPORT_COLUMNS)
  const results = []
  for (const row of rows) {
    const name = toTrimmedString(row.name)
    const cohort = toTrimmedString(row.cohort)
    if (!name || !cohort) {
      results.push({ row: row.__row, ok: false, message: 'Nombre y Cohorte son obligatorios' })
      continue
    }
    let tenantId = req.user.tenantId
    if (req.user.roleCode === 'super_admin') {
      const slug = toTrimmedString(row.tenantSlug)
      tenantId = tenantBySlug.get(slug)
      if (!tenantId) {
        results.push({ row: row.__row, ok: false, message: `Tenant "${slug}" no encontrado` })
        continue
      }
    }
    const modalityLabel = toTrimmedString(row.modality).toLowerCase()
    const modalityCode = modalityLabel ? MODALITY_LABEL_TO_CODE[modalityLabel] : null
    if (modalityLabel && !modalityCode) {
      results.push({ row: row.__row, ok: false, message: `Modalidad "${row.modality}" no reconocida` })
      continue
    }
    try {
      const [result] = await callProcedure('sp_programs_create', {
        p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId,
        p_tenant_id: tenantId, p_name: name, p_description: toTrimmedString(row.description) || null,
        p_cohort: cohort, p_modality_code: modalityCode, p_starts_on: toDateString(row.startsOn), p_ends_on: toDateString(row.endsOn),
      })
      results.push({ row: row.__row, ok: true, id: result.program_id, name })
    } catch (err) {
      const { message } = mapStoredProcedureError(err)
      results.push({ row: row.__row, ok: false, message })
    }
  }
  res.json(summarize(results))
})

// El instructor es opcional: si no se da, el componente igual se crea con
// un "Grupo A" sin instructor asignado (se puede asignar despues).
const COMPONENT_IMPORT_COLUMNS = [
  { header: 'Nombre', key: 'name' },
  { header: 'Descripción', key: 'description' },
  { header: 'Orden', key: 'sortOrder' },
  { header: 'Instructor (correo, opcional)', key: 'instructorEmail' },
]

app.get('/api/templates/components', async (_req, res) => {
  const buffer = await buildTemplateBuffer('Componentes', COMPONENT_IMPORT_COLUMNS, [
    { name: 'Fundamentos de Frontend', description: 'HTML, CSS y JavaScript moderno', sortOrder: 1, instructorEmail: '' },
  ])
  sendXlsx(res, buffer, 'plantilla-componentes.xlsx')
})

app.post('/api/programs/:id/components/import', authenticate, async (req, res) => {
  const programId = Number(req.params.id)
  if (!Number.isInteger(programId)) return res.status(400).json({ message: 'Invalid request format' })
  const buffer = await readSpreadsheetUpload(req, res)
  if (!buffer) return

  // El actor puede ser super_admin (sin tenant propio): se resuelve el
  // tenant del PROGRAMA para no mezclar instructores de otros tenants.
  const programs = await callProcedure('sp_programs_list', {
    p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId, p_tenant_id_filter: null,
  })
  const program = programs.find((p) => p.id === programId)
  if (!program) return res.status(404).json({ message: 'program_not_found' })

  const instructors = await callProcedure('sp_users_list', {
    p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId, p_tenant_id_filter: program.tenant_id, p_role_code_filter: 'instructor',
  })
  const instructorByEmail = new Map(instructors.map((i) => [i.email.toLowerCase(), i.id]))

  const rows = await parseUploadBuffer(buffer, COMPONENT_IMPORT_COLUMNS)
  const results = []
  for (const row of rows) {
    const name = toTrimmedString(row.name)
    if (!name) {
      results.push({ row: row.__row, ok: false, message: 'Nombre es obligatorio' })
      continue
    }
    const instructorEmail = toTrimmedString(row.instructorEmail).toLowerCase()
    let instructorId = null
    if (instructorEmail) {
      instructorId = instructorByEmail.get(instructorEmail)
      if (!instructorId) {
        results.push({ row: row.__row, ok: false, message: `Instructor "${row.instructorEmail}" no encontrado` })
        continue
      }
    }
    try {
      const [component] = await callProcedure('sp_components_create', {
        p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId,
        p_program_id: programId, p_name: name, p_description: toTrimmedString(row.description) || null,
        p_sort_order: toIntOrNull(row.sortOrder) ?? 0,
      })
      const [group] = await callProcedure('sp_component_groups_create', {
        p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId,
        p_component_id: component.component_id, p_name: 'Grupo A', p_instructor_id: instructorId,
      })
      results.push({ row: row.__row, ok: true, componentId: component.component_id, groupId: group.group_id, name })
    } catch (err) {
      const { message } = mapStoredProcedureError(err)
      results.push({ row: row.__row, ok: false, message })
    }
  }
  res.json(summarize(results))
})

// Sin columna de duracion: todo tema dura 45 min fijo (TOPIC_DURATION_MINUTES).
const TOPIC_IMPORT_COLUMNS = [
  { header: 'Orden', key: 'sortOrder' },
  { header: 'Tema', key: 'title' },
  { header: 'Descripción', key: 'description' },
  { header: 'Fecha programada (AAAA-MM-DD, opcional)', key: 'scheduledOn' },
]

app.get('/api/templates/topics', async (_req, res) => {
  const buffer = await buildTemplateBuffer('Temario', TOPIC_IMPORT_COLUMNS, [
    { sortOrder: 1, title: 'Introducción a HTML semántico', description: '', scheduledOn: '' },
  ])
  sendXlsx(res, buffer, 'plantilla-temario.xlsx')
})

app.post('/api/groups/:id/topics/import', authenticate, async (req, res) => {
  const groupId = Number(req.params.id)
  if (!Number.isInteger(groupId)) return res.status(400).json({ message: 'Invalid request format' })
  const buffer = await readSpreadsheetUpload(req, res)
  if (!buffer) return

  const rows = await parseUploadBuffer(buffer, TOPIC_IMPORT_COLUMNS)
  const results = []
  for (const row of rows) {
    const title = toTrimmedString(row.title)
    if (!title) {
      results.push({ row: row.__row, ok: false, message: 'Tema es obligatorio' })
      continue
    }
    try {
      const [result] = await callProcedure('sp_topics_create', {
        p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId,
        p_group_id: groupId, p_title: title, p_description: toTrimmedString(row.description) || null,
        p_sort_order: toIntOrNull(row.sortOrder) ?? 0, p_scheduled_on: toDateString(row.scheduledOn), p_duration_minutes: TOPIC_DURATION_MINUTES,
      })
      results.push({ row: row.__row, ok: true, id: result.topic_id, title })
    } catch (err) {
      const { message } = mapStoredProcedureError(err)
      results.push({ row: row.__row, ok: false, message })
    }
  }
  res.json(summarize(results))
})

// Password temporal generada por fila (mismo patron que el reseteo por
// admin): no hay servicio de correo, asi que el resumen de la carga trae
// las contrasenas para que el admin las reparta fuera del sistema.
const USER_IMPORT_COLUMNS = [
  { header: 'Nombre completo', key: 'fullName' },
  { header: 'Correo', key: 'email' },
  { header: 'Rol (instructor/estudiante)', key: 'role' },
  { header: 'Tenant (slug, solo super_admin)', key: 'tenantSlug' },
]
const ROLE_LABEL_TO_CODE = { instructor: 'instructor', estudiante: 'student', alumno: 'student', student: 'student' }

app.get('/api/templates/users', async (_req, res) => {
  const buffer = await buildTemplateBuffer('Usuarios', USER_IMPORT_COLUMNS, [
    { fullName: 'Ana Torres', email: 'ana.torres@ejemplo.com', role: 'estudiante', tenantSlug: '' },
  ])
  sendXlsx(res, buffer, 'plantilla-usuarios.xlsx')
})

app.post('/api/users/import', authenticate, async (req, res) => {
  const buffer = await readSpreadsheetUpload(req, res)
  if (!buffer) return

  let tenantBySlug = null
  if (req.user.roleCode === 'super_admin') {
    const tenants = await callProcedure('sp_tenants_list', { p_actor_role: req.user.roleCode })
    tenantBySlug = new Map(tenants.map((t) => [t.slug, t.id]))
  }

  const rows = await parseUploadBuffer(buffer, USER_IMPORT_COLUMNS)
  const results = []
  for (const row of rows) {
    const fullName = toTrimmedString(row.fullName)
    const email = toTrimmedString(row.email)
    const roleLabel = toTrimmedString(row.role).toLowerCase()
    const roleCode = ROLE_LABEL_TO_CODE[roleLabel]
    if (!fullName || !email || !email.includes('@') || !roleCode) {
      results.push({ row: row.__row, ok: false, message: 'Nombre, Correo y Rol (instructor/estudiante) son obligatorios' })
      continue
    }
    let tenantId = req.user.tenantId
    if (req.user.roleCode === 'super_admin') {
      const slug = toTrimmedString(row.tenantSlug)
      tenantId = tenantBySlug.get(slug)
      if (!tenantId) {
        results.push({ row: row.__row, ok: false, message: `Tenant "${slug}" no encontrado` })
        continue
      }
    }
    try {
      const temporaryPassword = crypto.randomBytes(9).toString('base64url')
      const passwordHash = await hashPassword(temporaryPassword)
      const [result] = await callProcedure('sp_users_create', {
        p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId,
        p_target_tenant_id: tenantId, p_full_name: fullName, p_email: email, p_password_hash: passwordHash, p_role_code: roleCode,
      })
      results.push({ row: row.__row, ok: true, id: result.user_id, email, temporaryPassword })
    } catch (err) {
      const { message } = mapStoredProcedureError(err)
      results.push({ row: row.__row, ok: false, message })
    }
  }
  res.json(summarize(results))
})

// ===================================================================
// Carga completa de un programa: un solo Excel con 3 hojas (Componentes,
// una hoja de horario con columnas Semana/Dia/Fecha/.../Componente/Tema/
// Contenidos, y Resumen con parametros) crea o actualiza los componentes,
// su grupo por defecto, TODO el temario con fecha y hora reales, y el
// horario semanal recurrente de cada grupo (rango fusionado por dia de
// semana). Es EL formato estandar para cargar la estructura completa de
// un programa de una sola vez; la hoja de horario se ubica por sus
// encabezados, no por el nombre de la hoja, para que sirva igual con
// programas de 6, 8 o 10 semanas.
const PROGRAM_FULL_TEMPLATE_PATH = path.resolve(__dirname, 'templates/programa-completo.xlsx')
const HORARIO_SHEET_REQUIRED_HEADERS = ['Semana', 'Día', 'Fecha', 'Componente', 'Tema']
const HORARIO_SHEET_COLUMNS = [
  { header: 'Semana', key: 'week' },
  { header: 'Día', key: 'weekdayLabel' },
  { header: 'Fecha', key: 'scheduledOn' },
  { header: 'Sesión', key: 'session' },
  { header: 'Bloque', key: 'block' },
  { header: 'Horario', key: 'timeRange' },
  { header: 'Componente', key: 'componentName' },
  { header: 'Tema', key: 'title' },
  { header: 'Contenidos', key: 'description' },
  { header: 'Horas académicas', key: 'academicHours' },
]
const HOLIDAY_SHEET_COLUMNS = [
  { header: 'Fecha', key: 'holidayOn' },
  { header: 'Feriado', key: 'name' },
]

app.get('/api/templates/program-full', (_req, res) => {
  res.setHeader('Content-Type', XLSX_CONTENT_TYPE)
  res.setHeader('Content-Disposition', 'attachment; filename="plantilla-programa-completo.xlsx"')
  res.sendFile(PROGRAM_FULL_TEMPLATE_PATH)
})

app.post('/api/programs/:id/full-import', authenticate, async (req, res) => {
  const programId = Number(req.params.id)
  if (!Number.isInteger(programId)) return res.status(400).json({ message: 'Invalid request format' })
  const buffer = await readSpreadsheetUpload(req, res)
  if (!buffer) return

  let workbook
  try {
    workbook = await loadWorkbook(buffer)
  } catch {
    return res.status(400).json({ message: 'invalid_file_type' })
  }

  const horarioSheet = findSheetByHeaders(workbook, HORARIO_SHEET_REQUIRED_HEADERS)
  if (!horarioSheet) {
    return res.status(400).json({ message: 'El archivo no tiene una hoja de horario con las columnas Semana/Día/Fecha/Componente/Tema.' })
  }
  const componentsSheet = findSheetByHeaders(workbook, ['Nombre', 'Descripción'])
  const holidaysSheet = findSheetByHeaders(workbook, ['Fecha', 'Feriado'])

  const instructors = await callProcedure('sp_users_list', {
    p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId, p_tenant_id_filter: null, p_role_code_filter: 'instructor',
  })
  const instructorByEmail = new Map(instructors.map((i) => [i.email.toLowerCase(), i.id]))

  // 0) Feriados (opcional): antes que el temario, para que las fechas que
  // caigan en feriado se rechacen de una (regla ya aplicada en sp_topics_create).
  // Alimentan tambien el calendario semanal visible para todos los roles.
  const holidayResults = []
  if (holidaysSheet) {
    const programs = await callProcedure('sp_programs_list', {
      p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId, p_tenant_id_filter: null,
    })
    const program = programs.find((p) => p.id === programId)
    const tenantId = program ? program.tenant_id : req.user.tenantId
    const rows = parseSheetRows(holidaysSheet, HOLIDAY_SHEET_COLUMNS)
    for (const row of rows) {
      const holidayOn = toDateString(row.holidayOn)
      const name = toTrimmedString(row.name)
      if (!holidayOn || !name) continue
      try {
        await callProcedure('sp_holidays_create', {
          p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId,
          p_tenant_id: tenantId, p_holiday_on: holidayOn, p_name: name, p_type_code: 'national',
        })
        holidayResults.push({ row: row.__row, ok: true, name })
      } catch (err) {
        const { message } = mapStoredProcedureError(err)
        holidayResults.push({ row: row.__row, ok: false, message })
      }
    }
  }

  // 1) Componentes: reusa por nombre (actualiza descripcion/orden) o crea.
  //    Cada uno recibe (o conserva) un grupo por defecto "Grupo A".
  const componentResults = []
  if (componentsSheet) {
    const existingComponents = await callProcedure('sp_components_list', {
      p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId, p_program_id: programId,
    })
    const componentByName = new Map(existingComponents.map((c) => [c.name.trim().toLowerCase(), c]))
    const rows = parseSheetRows(componentsSheet, COMPONENT_IMPORT_COLUMNS)
    for (const row of rows) {
      const name = toTrimmedString(row.name)
      if (!name) continue
      const instructorEmail = toTrimmedString(row.instructorEmail).toLowerCase()
      let instructorId = null
      if (instructorEmail) {
        instructorId = instructorByEmail.get(instructorEmail)
        if (!instructorId) {
          componentResults.push({ row: row.__row, ok: false, message: `Instructor "${row.instructorEmail}" no encontrado` })
          continue
        }
      }
      try {
        let component = componentByName.get(name.toLowerCase())
        if (component) {
          await callProcedure('sp_components_update', {
            p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId,
            p_component_id: component.id, p_name: name, p_description: toTrimmedString(row.description) || null,
            p_sort_order: toIntOrNull(row.sortOrder),
          })
        } else {
          const [created] = await callProcedure('sp_components_create', {
            p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId,
            p_program_id: programId, p_name: name, p_description: toTrimmedString(row.description) || null,
            p_sort_order: toIntOrNull(row.sortOrder) ?? 0,
          })
          component = { id: created.component_id, name }
          componentByName.set(name.toLowerCase(), component)
        }
        const groups = await callProcedure('sp_component_groups_list', {
          p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId, p_component_id: component.id,
        })
        if (groups.length === 0) {
          await callProcedure('sp_component_groups_create', {
            p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId,
            p_component_id: component.id, p_name: 'Grupo A', p_instructor_id: instructorId,
          })
        } else if (instructorId && !groups[0].instructor_id) {
          await callProcedure('sp_component_groups_update', {
            p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId,
            p_group_id: groups[0].id, p_name: groups[0].name, p_instructor_id: instructorId,
          })
        }
        componentResults.push({ row: row.__row, ok: true, componentId: component.id, name })
      } catch (err) {
        const { message } = mapStoredProcedureError(err)
        componentResults.push({ row: row.__row, ok: false, message })
      }
    }
  }

  // Mapa fresco componente->grupo (incluye los recien creados arriba y los
  // que ya existian de antes aunque no vinieran en la hoja Componentes).
  const allComponents = await callProcedure('sp_components_list', {
    p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId, p_program_id: programId,
  })
  const componentIdByName = new Map(allComponents.map((c) => [c.name.trim().toLowerCase(), c.id]))
  const groupIdByComponentId = new Map()
  for (const c of allComponents) {
    const groups = await callProcedure('sp_component_groups_list', {
      p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId, p_component_id: c.id,
    })
    if (groups.length > 0) groupIdByComponentId.set(c.id, groups[0].id)
  }

  // 2) Temario: una fila = un tema, con su fecha y duracion reales (no el
  //    default fijo de 45 min: aqui el archivo ya trae el horario exacto).
  const rows = parseSheetRows(horarioSheet, HORARIO_SHEET_COLUMNS)
  const topicResults = []
  const sortOrderByGroup = new Map()
  const weekdayRangeByGroup = new Map() // groupId -> Map(weekday -> {startMinutes, endMinutes})

  for (const row of rows) {
    const title = toTrimmedString(row.title)
    const componentName = toTrimmedString(row.componentName)
    if (!title || !componentName) continue // filas vacias o de totales al final de la hoja

    const componentId = componentIdByName.get(componentName.toLowerCase())
    if (!componentId) {
      topicResults.push({ row: row.__row, ok: false, message: `Componente "${componentName}" no existe en este programa` })
      continue
    }
    const groupId = groupIdByComponentId.get(componentId)
    if (!groupId) {
      topicResults.push({ row: row.__row, ok: false, message: `El componente "${componentName}" no tiene grupo` })
      continue
    }

    const scheduledOn = toDateString(row.scheduledOn)
    const timeRange = parseTimeRange(row.timeRange)
    const academicHours = toIntOrNull(row.academicHours)
    const durationMinutes = timeRange?.durationMinutes || (academicHours ? academicHours * TOPIC_DURATION_MINUTES : TOPIC_DURATION_MINUTES)
    const sortOrder = (sortOrderByGroup.get(groupId) || 0) + 1
    sortOrderByGroup.set(groupId, sortOrder)

    try {
      const [result] = await callProcedure('sp_topics_create', {
        p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId,
        p_group_id: groupId, p_title: title, p_description: toTrimmedString(row.description) || null,
        p_sort_order: sortOrder, p_scheduled_on: scheduledOn, p_duration_minutes: durationMinutes,
      })
      topicResults.push({ row: row.__row, ok: true, id: result.topic_id, title })

      if (scheduledOn && timeRange) {
        const weekday = new Date(`${scheduledOn}T00:00:00Z`).getUTCDay()
        if (!weekdayRangeByGroup.has(groupId)) weekdayRangeByGroup.set(groupId, new Map())
        const perWeekday = weekdayRangeByGroup.get(groupId)
        const existing = perWeekday.get(weekday)
        perWeekday.set(weekday, {
          startMinutes: existing ? Math.min(existing.startMinutes, timeRange.startMinutes) : timeRange.startMinutes,
          endMinutes: existing ? Math.max(existing.endMinutes, timeRange.endMinutes) : timeRange.endMinutes,
        })
      }
    } catch (err) {
      const { message } = mapStoredProcedureError(err)
      topicResults.push({ row: row.__row, ok: false, message })
    }
  }

  // 3) Horario semanal recurrente por grupo: rango fusionado (min inicio,
  //    max fin) por dia de semana, derivado de las fechas reales de arriba.
  const scheduleResults = []
  for (const [groupId, perWeekday] of weekdayRangeByGroup) {
    for (const [weekday, range] of perWeekday) {
      try {
        await callProcedure('sp_group_schedule_days_add', {
          p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId,
          p_group_id: groupId, p_weekday: weekday, p_start_time: minutesToTime(range.startMinutes), p_end_time: minutesToTime(range.endMinutes),
        })
        scheduleResults.push({ groupId, weekday, ok: true })
      } catch (err) {
        const { message } = mapStoredProcedureError(err)
        scheduleResults.push({ groupId, weekday, ok: false, message })
      }
    }
  }

  res.json({
    holidays: summarize(holidayResults),
    components: summarize(componentResults),
    topics: summarize(topicResults),
    scheduleDays: summarize(scheduleResults),
  })
})

if (process.env.NODE_ENV === 'production') {
  const dist = path.resolve(__dirname, '../dist')
  app.use(express.static(dist))
  // Middleware, not a '*' route pattern: Express 5's path-to-regexp no
  // longer accepts a bare '*' as a route path.
  app.use((_req, res) => res.sendFile(path.join(dist, 'index.html')))
}

app.listen(port, () => console.log(`Training monolith listening on http://localhost:${port}`))