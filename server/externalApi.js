import crypto from 'node:crypto'
import { callProcedure } from './db.js'
import { authenticate } from './middleware/authenticate.js'
import { mapStoredProcedureError } from './errors.js'

// API para aplicaciones externas (p.ej. un tracker de horas de trabajo que
// paga las horas dictadas por los profesores).
//
// - El admin (o super admin) crea tokens en Configuracion. Se muestran UNA
//   sola vez; en la base solo queda su hash sha256.
// - Las apps externas llaman con  Authorization: Bearer <token>  a /api/external/v1/...
// - Un token de admin ve solo los programas de su tenant.

const TOKEN_PREFIX = 'ftk_'
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex')
const MAX_RANGE_DAYS = 366
const RATE_LIMIT = 120 // pedidos por minuto y token
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function newToken() {
  return TOKEN_PREFIX + crypto.randomBytes(30).toString('base64url')
}

const actor = (req) => ({ p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId })

function sendError(res, err) {
  const { status, message } = mapStoredProcedureError(err)
  res.status(status).json({ message })
}

const shapeToken = (r) => ({
  id: Number(r.id), tenantId: r.tenant_id === null ? null : Number(r.tenant_id), tenantName: r.tenant_name, name: r.name,
  prefix: r.token_prefix, scopes: String(r.scopes || '').split(',').filter(Boolean), status: r.status_code,
  createdAt: r.created_at, createdBy: r.created_by_name, useCount: Number(r.use_count) || 0,
  lastUsedMinutesAgo: r.last_used_minutes_ago === null || r.last_used_minutes_ago === undefined ? null : Number(r.last_used_minutes_ago),
  expiresInDays: r.expires_in_days === null || r.expires_in_days === undefined ? null : Number(r.expires_in_days),
})

// ---- Autenticacion de las apps externas ---------------------------------
const hits = new Map()
function rateLimited(tokenId) {
  const now = Date.now()
  const entry = hits.get(tokenId)
  if (!entry || now - entry.start > 60_000) { hits.set(tokenId, { start: now, count: 1 }); return false }
  entry.count += 1
  return entry.count > RATE_LIMIT
}

async function authenticateApiToken(req, res, next) {
  const header = req.get('authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : (req.get('x-api-key') || '').trim()
  if (!token.startsWith(TOKEN_PREFIX)) {
    return res.status(401).json({ error: 'invalid_token', message: 'Falta el token o no es válido. Envíalo como: Authorization: Bearer ftk_…' })
  }
  try {
    const rows = await callProcedure('sp_api_token_resolve', { p_token_hash: hashToken(token) })
    const row = Array.isArray(rows) ? rows[0] : null
    if (!row) return res.status(401).json({ error: 'invalid_token', message: 'El token no existe, venció o fue revocado.' })
    if (rateLimited(row.id)) return res.status(429).json({ error: 'too_many_requests', message: `Máximo ${RATE_LIMIT} pedidos por minuto.` })
    req.apiToken = { id: Number(row.id), tenantId: row.tenant_id === null ? null : Number(row.tenant_id), scopes: String(row.scopes || '').split(',') }
    next()
  } catch (err) {
    console.error('[api externa] no se pudo validar el token:', err.message)
    res.status(500).json({ error: 'server_error', message: 'No se pudo validar el token.' })
  }
}

const requireScope = (scope) => (req, res, next) => (
  req.apiToken.scopes.includes(scope) ? next() : res.status(403).json({ error: 'insufficient_scope', message: `El token no tiene el permiso ${scope}.` })
)

function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

const csvCell = (v) => {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function registerExternalApiRoutes(app) {
  // ---- Administracion de tokens (admin / super admin) -------------------
  app.get('/api/api-tokens', authenticate, async (req, res) => {
    const tenantId = req.query.tenantId === 'global' ? null : req.query.tenantId ? Number(req.query.tenantId) : req.user.tenantId
    if (tenantId !== null && !Number.isInteger(tenantId)) return res.status(400).json({ message: 'Invalid request format' })
    try {
      const rows = await callProcedure('sp_api_tokens_list', { ...actor(req), p_tenant_id: tenantId })
      res.json({ data: (rows || []).map(shapeToken) })
    } catch (err) { sendError(res, err) }
  })

  app.post('/api/api-tokens', authenticate, async (req, res) => {
    const { name, tenantId: rawTenant, expiresInDays } = req.body || {}
    const tenantId = req.user.roleCode === 'tenant_admin' ? req.user.tenantId : (rawTenant === null || rawTenant === undefined ? null : Number(rawTenant))
    const days = expiresInDays === null || expiresInDays === undefined ? null : Number(expiresInDays)
    if (typeof name !== 'string' || name.trim().length > 120 || (tenantId !== null && !Number.isInteger(tenantId))
      || (days !== null && (!Number.isInteger(days) || days < 1 || days > 3650))) {
      return res.status(400).json({ message: 'Invalid request format' })
    }
    const token = newToken()
    try {
      const [row] = await callProcedure('sp_api_tokens_create', {
        ...actor(req), p_tenant_id: tenantId, p_name: name, p_token_prefix: token.slice(0, 12), p_token_hash: hashToken(token), p_expires_days: days,
      })
      res.status(201).json({ data: { id: Number(row?.token_id), token, prefix: token.slice(0, 12) } })
    } catch (err) { sendError(res, err) }
  })

  app.delete('/api/api-tokens/:id', authenticate, async (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isInteger(id)) return res.status(400).json({ message: 'Invalid request format' })
    try {
      await callProcedure('sp_api_tokens_revoke', { ...actor(req), p_token_id: id })
      res.json({ ok: true })
    } catch (err) { sendError(res, err) }
  })

  // ---- API externa v1 ----------------------------------------------------
  app.get('/api/external/v1/programs', authenticateApiToken, requireScope('instructor_hours:read'), async (req, res) => {
    try {
      const rows = await callProcedure('sp_external_programs', { p_tenant_id: req.apiToken.tenantId })
      res.json({
        data: (rows || []).map((p) => ({
          id: Number(p.id), name: p.name, cohort: p.cohort, startsOn: p.starts_on, endsOn: p.ends_on, status: p.status_code,
          tenantId: Number(p.tenant_id), tenantName: p.tenant_name,
        })),
      })
    } catch (err) {
      res.status(500).json({ error: 'server_error', message: 'No se pudo leer los programas.' })
    }
  })

  // Horas dictadas por profesor en un programa y rango de fechas (inclusive).
  // ?programId=2&from=2026-11-01&to=2026-11-30[&instructorEmail=...][&format=csv]
  app.get('/api/external/v1/instructor-hours', authenticateApiToken, requireScope('instructor_hours:read'), async (req, res) => {
    const programId = Number(req.query.programId)
    const { from, to } = req.query
    const email = typeof req.query.instructorEmail === 'string' ? req.query.instructorEmail.trim().toLowerCase() : ''
    const problems = []
    if (!Number.isInteger(programId) || programId <= 0) problems.push('programId es obligatorio (número). Consulta /api/external/v1/programs.')
    if (!ISO_DATE.test(from || '') || Number.isNaN(Date.parse(from))) problems.push('from es obligatorio con formato AAAA-MM-DD.')
    if (!ISO_DATE.test(to || '') || Number.isNaN(Date.parse(to))) problems.push('to es obligatorio con formato AAAA-MM-DD.')
    if (!problems.length && from > to) problems.push('from debe ser anterior o igual a to.')
    if (!problems.length && daysBetween(from, to) > MAX_RANGE_DAYS) problems.push(`El rango máximo es de ${MAX_RANGE_DAYS} días.`)
    if (problems.length) return res.status(400).json({ error: 'invalid_request', message: problems.join(' ') })

    let rows
    try {
      rows = await callProcedure('sp_external_instructor_hours', { p_tenant_id: req.apiToken.tenantId, p_program_id: programId, p_from: from, p_to: to })
    } catch (err) {
      if (err?.sqlMessage === 'program_not_found') return res.status(404).json({ error: 'program_not_found', message: 'El programa no existe o no pertenece a tu organización.' })
      console.error('[api externa] horas:', err.message)
      return res.status(500).json({ error: 'server_error', message: 'No se pudo calcular las horas.' })
    }

    const classes = (rows || [])
      .filter((r) => !email || String(r.instructor_email || '').toLowerCase() === email)
      .map((r) => ({
        date: r.class_date, start: r.start_time, end: r.end_time,
        minutes: r.minutes === null ? null : Number(r.minutes), minutesSource: r.minutes_source,
        plannedMinutes: r.planned_minutes === null ? null : Number(r.planned_minutes),
        instructorId: r.instructor_id === null ? null : Number(r.instructor_id), instructorName: r.instructor_name, instructorEmail: r.instructor_email,
        substitute: Boolean(r.is_substitute),
        assignedInstructorId: r.assigned_instructor_id === null ? null : Number(r.assigned_instructor_id),
        componentId: Number(r.component_id), componentName: r.component_name, groupId: Number(r.group_id), groupName: r.group_name,
        topicId: Number(r.topic_id), topicTitle: r.topic_title,
      }))

    if (req.query.format === 'csv') {
      const head = ['fecha', 'inicio', 'fin', 'minutos', 'horas', 'origen_minutos', 'profesor', 'correo_profesor', 'reemplazo', 'curso', 'grupo', 'tema']
      const lines = classes.map((c) => [c.date, c.start, c.end, c.minutes, c.minutes === null ? '' : (c.minutes / 60).toFixed(2), c.minutesSource,
        c.instructorName, c.instructorEmail, c.substitute ? 'si' : 'no', c.componentName, c.groupName, c.topicTitle].map(csvCell).join(','))
      res.set('Content-Type', 'text/csv; charset=utf-8')
      res.set('Content-Disposition', `attachment; filename="horas-programa-${programId}-${from}-a-${to}.csv"`)
      return res.send('﻿' + [head.join(','), ...lines].join('\n'))
    }

    const byInstructor = new Map()
    for (const c of classes) {
      const key = c.instructorId ?? 'sin_profesor'
      if (!byInstructor.has(key)) byInstructor.set(key, { instructorId: c.instructorId, instructorName: c.instructorName || 'Sin profesor asignado', instructorEmail: c.instructorEmail, classes: 0, minutes: 0, classesWithoutDuration: 0 })
      const t = byInstructor.get(key)
      t.classes += 1
      if (c.minutes === null) t.classesWithoutDuration += 1
      else t.minutes += c.minutes
    }
    const instructors = [...byInstructor.values()].map((t) => ({ ...t, hours: Math.round((t.minutes / 60) * 100) / 100 }))
      .sort((a, b) => a.instructorName.localeCompare(b.instructorName))
    const totalMinutes = instructors.reduce((n, t) => n + t.minutes, 0)
    res.json({
      data: {
        programId, from, to,
        totals: { classes: classes.length, minutes: totalMinutes, hours: Math.round((totalMinutes / 60) * 100) / 100 },
        instructors,
        classes,
      },
      notes: 'Solo clases dictadas (temas marcados como dictados). Minutos: horario real del grupo ese día (minutesSource=schedule); si no hay horario, la duración planificada del tema (planned). Si hubo reemplazo registrado, las horas son del reemplazo.',
    })
  })
}
