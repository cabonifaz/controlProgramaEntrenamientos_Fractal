import 'dotenv/config'
import express from 'express'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import ExcelJS from 'exceljs'
import crypto from 'node:crypto'
import { callProcedure } from './db.js'
import { hashPassword, signSessionToken, verifyPassword, signMaterialToken, verifyMaterialToken } from './auth.js'
import { authenticate } from './middleware/authenticate.js'
import { mapStoredProcedureError } from './errors.js'
import { uploadLogo, uploadSpreadsheet, UPLOADS_DIR } from './uploads.js'
import { registerPublicProgramRoutes, renderPublicProgramHtml } from './publicPrograms.js'
import {
  uploadMaterialZip, extractMaterialZip, materialDir, removeMaterialDir, describeMaterial,
  isSolutionsPath, buildMaterialTemplateZip, buildMaterialSkillZip, MATERIAL_RESPONSE_HEADERS,
  readMaterialContent, writeMaterialFiles,
} from './materials.js'
import { buildMaterialFromContent, courseTopics, parsePastedContent } from './materialRender.js'
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

// Railway pone un proxy delante: sin esto req.ip seria la IP del proxy y el
// freno anti-abuso del formulario publico trataria a todos como uno solo.
app.set('trust proxy', 1)
// 2 MB: el contenido de material que se pega desde una IA (JSON de varios
// temas) supera el limite por defecto de 100 KB.
app.use(express.json({ limit: '2mb' }))
// Publico a proposito (logos de tenant; banners de programa y fotos de
// instructores de la web publica): sin datos sensibles, se sirve tal cual
// desde el volumen persistente configurado en UPLOADS_DIR. Solo estas
// subcarpetas: el material didactico (materials/) tambien vive en el
// volumen y NO debe quedar publico (lo sirve /material/<token>/...).
// Un SVG abierto directamente podria ejecutar scripts: se sirve en sandbox.
const publicStaticOptions = {
  setHeaders(res, filePath) {
    if (filePath.toLowerCase().endsWith('.svg')) res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox")
    res.setHeader('X-Content-Type-Options', 'nosniff')
  },
}
app.use('/uploads/tenants', express.static(path.join(UPLOADS_DIR, 'tenants'), publicStaticOptions))
app.use('/uploads/public', express.static(path.join(UPLOADS_DIR, 'public'), publicStaticOptions))

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
// Para un alumno, todo su temario ("Mis temas", con acceso al material).
app.get('/api/my/topics', authenticate, async (req, res) => {
  try {
    const procedure = req.user.roleCode === 'student' ? 'sp_topics_list_by_student' : 'sp_topics_list_by_instructor'
    const data = await callProcedure(procedure, {
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

// ---------------------------------------------------------------------
// Material didactico: un ZIP por componente (ver server/materials.js).
// Quien puede ver/gestionar lo deciden los SPs; aqui solo se manejan los
// archivos y se firman URLs temporales para el iframe.
// ---------------------------------------------------------------------
function materialBaseUrl(componentId, folder, withSolutions) {
  return `/material/${signMaterialToken({ componentId, folder, withSolutions })}/`
}

function encodeMaterialPath(relativePath) {
  return relativePath.split('/').map(encodeURIComponent).join('/')
}

app.get('/api/components/:id/material', authenticate, async (req, res) => {
  const componentId = Number(req.params.id)
  if (!Number.isInteger(componentId)) return res.status(400).json({ message: 'Invalid request format' })

  try {
    const [row] = await callProcedure('sp_component_materials_get', {
      p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId,
      p_component_id: componentId,
    })
    const canManage = Boolean(row.can_manage)
    let material = null
    if (row.folder) {
      const { indexFile, topics } = await describeMaterial(componentId, row.folder, { withSolutions: canManage })
      const baseUrl = materialBaseUrl(componentId, row.folder, canManage)
      material = {
        originalName: row.original_name, sizeBytes: row.size_bytes, uploadedAt: row.uploaded_at, uploadedByName: row.uploaded_by_name,
        indexUrl: indexFile ? baseUrl + encodeMaterialPath(indexFile) : null,
        topics: topics.map((t) => ({
          position: t.position, file: t.file, url: baseUrl + encodeMaterialPath(t.file),
          solutionUrl: t.solutionFile ? baseUrl + encodeMaterialPath(t.solutionFile) : null,
        })),
      }
    }
    res.json({ data: { componentId, componentName: row.component_name, canManage, material } })
  } catch (err) {
    const { status, message } = mapStoredProcedureError(err)
    res.status(status).json({ message })
  }
})

// Datos para que el frontend arme el prompt de generacion del material:
// temario numerado exactamente como los tema-NN.html que se esperan.
// Componente + programa + marca del tenant + temario numerado: base del
// prompt de material y del armado de paginas a partir del contenido pegado.
// El SP solo lo entrega a quien puede gestionar el material.
async function loadMaterialCourse(req, componentId) {
  const rows = await callProcedure('sp_component_material_prompt_data', {
    p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId,
    p_component_id: componentId,
  })
  const [first] = rows
  return {
    componentName: first.component_name, componentDescription: first.component_description,
    programName: first.program_name, programDescription: first.program_description, cohort: first.cohort,
    modality: first.modality_label, startsOn: first.starts_on, endsOn: first.ends_on,
    tenant: {
      name: first.tenant_name, brandColor: first.tenant_brand_color,
      logoUrl: first.tenant_logo_path ? `/uploads/${first.tenant_logo_path}` : null,
    },
    topics: rows.filter((r) => r.topic_id).map((r, i) => ({
      position: i + 1, title: r.topic_title, description: r.topic_description,
      durationMinutes: r.duration_minutes ?? TOPIC_DURATION_MINUTES,
    })),
  }
}

app.get('/api/components/:id/material-prompt', authenticate, async (req, res) => {
  const componentId = Number(req.params.id)
  if (!Number.isInteger(componentId)) return res.status(400).json({ message: 'Invalid request format' })

  try {
    res.json({ data: await loadMaterialCourse(req, componentId) })
  } catch (err) {
    const { status, message } = mapStoredProcedureError(err)
    res.status(status).json({ message })
  }
})

app.post('/api/components/:id/material', authenticate, async (req, res) => {
  const componentId = Number(req.params.id)
  if (!Number.isInteger(componentId)) return res.status(400).json({ message: 'Invalid request format' })
  const actor = { p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId }

  // Autoriza ANTES de recibir y descomprimir el ZIP (el SP _set vuelve a
  // validar al registrar): nadie sin permiso llega a escribir en el volumen.
  try {
    const [row] = await callProcedure('sp_component_materials_get', { ...actor, p_component_id: componentId })
    if (!row?.can_manage) return res.status(403).json({ message: 'not_authorized' })
  } catch (err) {
    const { status, message } = mapStoredProcedureError(err)
    return res.status(status).json({ message })
  }

  try {
    await uploadMaterialZip(req, res)
  } catch (err) {
    return res.status(400).json({ message: err.materialCode || (err.message === 'invalid_file_type' ? 'invalid_file_type' : 'upload_failed') })
  }
  if (!req.file) return res.status(400).json({ message: 'Invalid request format' })

  const folder = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`
  let summary
  try {
    summary = await extractMaterialZip(req.file.buffer, materialDir(componentId, folder))
  } catch (err) {
    await removeMaterialDir(componentId, folder)
    return res.status(400).json({ message: err.materialCode || 'invalid_zip' })
  }

  // multer entrega el nombre original como latin1 aunque venga en UTF-8.
  const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8').slice(0, 255)
  try {
    const [result] = await callProcedure('sp_component_materials_set', {
      ...actor, p_component_id: componentId, p_folder: folder, p_original_name: originalName,
      p_size_bytes: req.file.size, p_topic_file_count: summary.topicFileCount, p_solution_file_count: summary.solutionFileCount,
    })
    if (result?.previous_folder) await removeMaterialDir(componentId, result.previous_folder)
    res.status(201).json({ data: summary })
  } catch (err) {
    await removeMaterialDir(componentId, folder)
    const { status, message } = mapStoredProcedureError(err)
    res.status(status).json({ message })
  }
})

// Contenido pegado desde cualquier IA (JSON por tema): la plataforma arma
// las paginas con la marca del tenant y lo publica como material. Se
// acumula por lotes: cada envio agrega/reemplaza temas sobre el contenido
// ya importado (si el material vigente es un ZIP subido, se empieza de cero).
app.post('/api/components/:id/material/content', authenticate, async (req, res) => {
  const componentId = Number(req.params.id)
  const text = req.body?.content
  if (!Number.isInteger(componentId) || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ message: 'Invalid request format' })
  }
  const actor = { p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId }

  try {
    const course = await loadMaterialCourse(req, componentId)
    if (course.topics.length === 0) return res.status(409).json({ message: 'temario_empty' })

    const { temas, failures } = parsePastedContent(text)
    if (temas.length === 0) return res.status(400).json({ message: 'content_empty', details: failures })

    const [current] = await callProcedure('sp_component_materials_get', { ...actor, p_component_id: componentId })
    const previousContent = await readMaterialContent(componentId, current?.folder)
    const { files, content, report } = buildMaterialFromContent({
      componentName: course.componentName, componentDescription: course.componentDescription,
      programName: course.programName, tenantName: course.tenant.name, brandColor: course.tenant.brandColor,
      logoUrl: course.tenant.logoUrl, classMinutes: course.topics[0].durationMinutes,
      topics: courseTopics(course.topics),
    }, previousContent, temas)
    report.parseErrors = failures
    if (report.imported.length === 0) return res.status(400).json({ message: 'content_rejected', report })

    const folder = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`
    try {
      const bytes = await writeMaterialFiles(componentId, folder, files, content)
      const [result] = await callProcedure('sp_component_materials_set', {
        ...actor, p_component_id: componentId, p_folder: folder, p_original_name: 'Contenido generado con IA',
        p_size_bytes: bytes, p_topic_file_count: report.available.length, p_solution_file_count: report.available.length,
      })
      if (result?.previous_folder) await removeMaterialDir(componentId, result.previous_folder)
    } catch (err) {
      await removeMaterialDir(componentId, folder)
      throw err
    }
    res.status(201).json({ data: report })
  } catch (err) {
    const { status, message } = mapStoredProcedureError(err)
    res.status(status).json({ message })
  }
})

app.delete('/api/components/:id/material', authenticate, async (req, res) => {
  const componentId = Number(req.params.id)
  if (!Number.isInteger(componentId)) return res.status(400).json({ message: 'Invalid request format' })

  try {
    const [result] = await callProcedure('sp_component_materials_remove', {
      p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId,
      p_component_id: componentId,
    })
    await removeMaterialDir(componentId, result?.removed_folder)
    res.json({ ok: true })
  } catch (err) {
    const { status, message } = mapStoredProcedureError(err)
    res.status(status).json({ message })
  }
})

app.get('/api/topics/:id/material', authenticate, async (req, res) => {
  const topicId = Number(req.params.id)
  if (!Number.isInteger(topicId)) return res.status(400).json({ message: 'Invalid request format' })

  try {
    const [row] = await callProcedure('sp_topic_material_get', {
      p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId,
      p_topic_id: topicId,
    })
    const position = Number(row.topic_position)
    if (!row.folder) return res.json({ data: { available: false, reason: 'no_material', position } })

    const withSolutions = Boolean(row.can_view_solutions)
    const { indexFile, topics } = await describeMaterial(row.component_id, row.folder, { withSolutions })
    const topic = topics.find((t) => t.position === position)
    const baseUrl = materialBaseUrl(row.component_id, row.folder, withSolutions)
    res.json({
      data: {
        available: Boolean(topic), reason: topic ? null : 'topic_file_missing', position,
        url: topic ? baseUrl + encodeMaterialPath(topic.file) : null,
        solutionUrl: topic?.solutionFile ? baseUrl + encodeMaterialPath(topic.solutionFile) : null,
        indexUrl: indexFile ? baseUrl + encodeMaterialPath(indexFile) : null,
      },
    })
  } catch (err) {
    const { status, message } = mapStoredProcedureError(err)
    res.status(status).json({ message })
  }
})

// Sin authenticate: el permiso es el token firmado de la URL (un iframe no
// puede mandar Authorization). Las rutas relativas del HTML (assets/...)
// siguen funcionando porque el token es un segmento mas del path.
app.get('/material/:token/{*filePath}', (req, res) => {
  let claims
  try {
    claims = verifyMaterialToken(req.params.token)
  } catch {
    return res.status(401).type('text/plain; charset=utf-8').send('El enlace al material venció. Vuelve a abrirlo desde la plataforma.')
  }

  const segments = req.params.filePath?.length ? req.params.filePath : ['index.html']
  if (segments.some((s) => s === '..' || s.includes('\\') || s.includes('\0'))) {
    return res.status(400).end()
  }
  if (!claims.withSolutions && isSolutionsPath(segments)) {
    return res.status(403).type('text/plain; charset=utf-8').send('Las soluciones solo están disponibles para el instructor.')
  }

  const base = path.resolve(materialDir(claims.componentId, claims.folder))
  const filePath = path.resolve(base, ...segments)
  if (!filePath.startsWith(base + path.sep)) return res.status(400).end()

  res.set(MATERIAL_RESPONSE_HEADERS)
  res.sendFile(filePath, (err) => {
    if (err && !res.headersSent) res.status(404).type('text/plain; charset=utf-8').send('Archivo no encontrado.')
  })
})

registerPublicProgramRoutes(app)

app.get('/api/templates/material-skill', async (_req, res) => {
  const buffer = await buildMaterialSkillZip()
  res.set({
    'Content-Type': 'application/zip',
    'Content-Disposition': 'attachment; filename="generador-material-curso.zip"',
  })
  res.send(buffer)
})

app.get('/api/templates/material', async (_req, res) => {
  const buffer = await buildMaterialTemplateZip()
  res.set({
    'Content-Type': 'application/zip',
    'Content-Disposition': 'attachment; filename="plantilla-material.zip"',
  })
  res.send(buffer)
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

// Exportar el temario de un programa para corregirlo y volverlo a cargar.
// La clave de cada fila es (ID componente, N°): la carga actualiza el
// tema en esa posicion en TODOS los grupos del componente, sin crear ni
// borrar temas y sin tocar fechas.
const TEMARIO_COLUMNS = [
  { header: 'ID componente', key: 'componentId', width: 8 },
  { header: 'Componente', key: 'componentName', width: 28 },
  { header: 'N°', key: 'position', width: 6 },
  { header: 'Tema', key: 'title', width: 48 },
  { header: 'Alcance / descripción', key: 'description', width: 70 },
]

app.get('/api/programs/:id/temario/export', authenticate, async (req, res) => {
  const programId = Number(req.params.id)
  if (!Number.isInteger(programId)) return res.status(400).json({ message: 'Invalid request format' })

  try {
    const rows = await callProcedure('sp_program_temario_export', {
      p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId, p_program_id: programId,
    })
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Temario')
    sheet.columns = TEMARIO_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }))
    sheet.getRow(1).font = { bold: true }
    sheet.views = [{ state: 'frozen', ySplit: 1 }]
    rows.forEach((r) => sheet.addRow({
      componentId: r.component_id, componentName: r.component_name, position: Number(r.topic_position),
      title: r.title, description: r.description || '',
    }))
    // Columnas clave en gris: no deben editarse.
    ;[1, 2, 3].forEach((col) => sheet.getColumn(col).eachCell((cell, rowNumber) => {
      if (rowNumber > 1) cell.font = { color: { argb: 'FF7F8C8D' } }
    }))
    sheet.getColumn(5).alignment = { wrapText: true, vertical: 'top' }

    const help = workbook.addWorksheet('Instrucciones')
    help.getColumn(1).width = 110
    ;[
      'Cómo corregir el temario',
      '1. Edita solo las columnas "Tema" y "Alcance / descripción" de la hoja Temario.',
      '2. No cambies "ID componente" ni "N°": identifican el tema. "Componente" es solo referencia.',
      '3. La corrección se aplica a ese tema en TODOS los grupos del componente.',
      '4. No agregues ni borres filas: esta carga solo corrige temas existentes (no crea, no elimina, no cambia fechas).',
      '5. Guarda el archivo y súbelo con "Cargar temario corregido".',
    ].forEach((line, i) => { const row = help.addRow([line]); if (i === 0) row.font = { bold: true, size: 13 } })

    sendXlsx(res, await workbook.xlsx.writeBuffer(), `temario-programa-${programId}.xlsx`)
  } catch (err) {
    const { status, message } = mapStoredProcedureError(err)
    res.status(status).json({ message })
  }
})

app.post('/api/programs/:id/temario/import', authenticate, async (req, res) => {
  const programId = Number(req.params.id)
  if (!Number.isInteger(programId)) return res.status(400).json({ message: 'Invalid request format' })
  const buffer = await readSpreadsheetUpload(req, res)
  if (!buffer) return

  const workbook = await loadWorkbook(buffer)
  const sheet = findSheetByHeaders(workbook, ['ID componente', 'N°', 'Tema'])
  if (!sheet) return res.status(400).json({ message: 'temario_sheet_not_found' })

  const results = []
  for (const row of parseSheetRows(sheet, TEMARIO_COLUMNS)) {
    const componentId = toIntOrNull(row.componentId)
    const position = toIntOrNull(row.position)
    const title = toTrimmedString(row.title)
    if (!componentId || !position) {
      results.push({ row: row.__row, ok: false, message: 'Faltan "ID componente" o "N°" (no los borres)' })
      continue
    }
    if (!title) {
      results.push({ row: row.__row, ok: false, message: 'El tema no puede quedar vacío' })
      continue
    }
    try {
      const [result] = await callProcedure('sp_topics_update_by_position', {
        p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId,
        p_program_id: programId, p_component_id: componentId, p_position: position,
        p_title: title.slice(0, 180), p_description: toTrimmedString(row.description) || null,
      })
      results.push({ row: row.__row, ok: true, changed: Number(result.updated_topics) > 0, title })
    } catch (err) {
      const { message } = mapStoredProcedureError(err)
      results.push({
        row: row.__row, ok: false,
        message: message === 'target_not_found' ? `No existe el tema N° ${position} en ese componente` : message,
      })
    }
  }
  const ok = results.filter((r) => r.ok)
  res.json({
    updated: ok.filter((r) => r.changed).length,
    unchanged: ok.filter((r) => !r.changed).length,
    failed: results.length - ok.length,
    results,
  })
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
  // Web publica de un programa: mismo index.html, con titulo/imagen del
  // programa para la vista previa al compartir el link.
  app.get(['/p/:tenantSlug/:programSlug', '/p/:tenantSlug/:programSlug/inscripcion'], async (req, res) => {
    const indexHtml = await fs.promises.readFile(path.join(dist, 'index.html'), 'utf8')
    res.type('html').send(await renderPublicProgramHtml(indexHtml, req, req.params.tenantSlug, req.params.programSlug))
  })
  app.use(express.static(dist))
  // Middleware, not a '*' route pattern: Express 5's path-to-regexp no
  // longer accepts a bare '*' as a route path.
  app.use((_req, res) => res.sendFile(path.join(dist, 'index.html')))
}

app.listen(port, () => console.log(`Training monolith listening on http://localhost:${port}`))