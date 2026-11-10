import crypto from 'node:crypto'
import { callProcedure } from './db.js'
import { authenticate } from './middleware/authenticate.js'
import { mapStoredProcedureError } from './errors.js'
import { uploadPublicImage } from './uploads.js'
import { removeUpload, saveImage } from './publicPrograms.js'

// Perfil del alumno (links y contacto) y el directorio que ven sus
// instructores y el admin. Quien ve el telefono lo decide el SP.

const publicUrl = (relativePath) => (relativePath ? `/uploads/${relativePath}` : null)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_RE = /^[0-9+()\-.\s]{6,40}$/

function sendError(res, err) {
  const { status, message } = mapStoredProcedureError(err)
  res.status(status).json({ message })
}

function cleanText(value, max) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : ''
}

// Vacio = se borra; si viene, debe ser https y (si aplica) del dominio esperado.
function cleanUrl(value, hostPattern) {
  const url = cleanText(value, 255)
  if (!url) return { url: null }
  let parsed
  try { parsed = new URL(url) } catch { return { invalid: true } }
  if (parsed.protocol !== 'https:') return { invalid: true }
  if (hostPattern && !hostPattern.test(parsed.hostname)) return { invalid: true }
  return { url }
}

export function toProfile(row) {
  return {
    id: row.id, fullName: row.full_name, email: row.email, headline: row.headline, bio: row.bio,
    photoUrl: publicUrl(row.photo_path), linkedinUrl: row.linkedin_url, githubUrl: row.github_url,
    portfolioUrl: row.portfolio_url, contactEmail: row.contact_email, city: row.city,
    // undefined = el SP no lo entrega a este rol (instructor).
    ...(row.phone !== undefined ? { phone: row.phone } : {}),
  }
}

export function registerProfileRoutes(app) {
  app.get('/api/me/profile', authenticate, async (req, res) => {
    try {
      const [row] = await callProcedure('sp_profile_get_mine', { p_actor_user_id: req.user.id })
      res.json({ data: row ? { ...toProfile(row), roleCode: row.role_code } : null })
    } catch (err) {
      sendError(res, err)
    }
  })

  app.post('/api/me/profile', authenticate, async (req, res) => {
    const body = req.body || {}
    const linkedin = cleanUrl(body.linkedinUrl, /(^|\.)linkedin\.com$/i)
    const github = cleanUrl(body.githubUrl, /(^|\.)github\.com$/i)
    const portfolio = cleanUrl(body.portfolioUrl)
    if (linkedin.invalid) return res.status(400).json({ message: 'invalid_linkedin_url' })
    if (github.invalid) return res.status(400).json({ message: 'invalid_github_url' })
    if (portfolio.invalid) return res.status(400).json({ message: 'invalid_portfolio_url' })
    const contactEmail = cleanText(body.contactEmail, 190)
    if (contactEmail && !EMAIL_RE.test(contactEmail)) return res.status(400).json({ message: 'invalid_contact_email' })
    const phone = cleanText(body.phone, 40)
    if (phone && !PHONE_RE.test(phone)) return res.status(400).json({ message: 'invalid_phone' })
    try {
      await callProcedure('sp_profile_update_mine', {
        p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode,
        p_headline: cleanText(body.headline, 160) || null,
        p_bio: typeof body.bio === 'string' ? body.bio.trim().slice(0, 500) : null,
        p_linkedin_url: linkedin.url, p_github_url: github.url, p_portfolio_url: portfolio.url,
        p_contact_email: contactEmail || null, p_phone: phone || null, p_city: cleanText(body.city, 120) || null,
      })
      res.json({ ok: true })
    } catch (err) {
      sendError(res, err)
    }
  })

  // Foto o imagen que identifica al alumno. Nombre aleatorio: la URL es
  // publica (como los avatares) pero no se puede adivinar.
  app.post('/api/me/photo', authenticate, async (req, res) => {
    if (req.user.roleCode !== 'student') return res.status(403).json({ message: 'not_authorized' })
    try {
      await uploadPublicImage(req, res)
    } catch (err) {
      return res.status(400).json({ message: err.message })
    }
    if (!req.file) return res.status(400).json({ message: 'Invalid request format' })

    const photoPath = await saveImage(req.file, `students/${req.user.id}`, `photo-${crypto.randomUUID()}`)
    try {
      const [result] = await callProcedure('sp_profile_set_my_photo', { p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_photo_path: photoPath })
      removeUpload(result?.previous_photo_path)
      res.json({ photoUrl: publicUrl(photoPath) })
    } catch (err) {
      removeUpload(photoPath)
      sendError(res, err)
    }
  })

  app.delete('/api/me/photo', authenticate, async (req, res) => {
    try {
      const [result] = await callProcedure('sp_profile_set_my_photo', { p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_photo_path: null })
      removeUpload(result?.previous_photo_path)
      res.json({ ok: true })
    } catch (err) {
      sendError(res, err)
    }
  })

  // Guia de primer uso.
  app.get('/api/me/onboarding', authenticate, async (req, res) => {
    try {
      const [row] = await callProcedure('sp_onboarding_get', { p_actor_user_id: req.user.id })
      res.json({ data: { done: Boolean(row?.onboarding_done_at) } })
    } catch (err) {
      sendError(res, err)
    }
  })

  app.post('/api/me/onboarding', authenticate, async (req, res) => {
    try {
      await callProcedure('sp_onboarding_set', { p_actor_user_id: req.user.id, p_done: req.body?.done !== false })
      res.json({ ok: true })
    } catch (err) {
      sendError(res, err)
    }
  })

  app.get('/api/students/profiles', authenticate, async (req, res) => {
    try {
      const rows = await callProcedure('sp_student_profiles_list', {
        p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId,
      })
      const showPhone = req.user.roleCode !== 'instructor'
      res.json({
        data: rows.map((row) => {
          const profile = toProfile(row)
          if (!showPhone) delete profile.phone
          return { ...profile, isActive: !!row.is_active, tenantName: row.tenant_name, programs: row.programs, components: row.components }
        }),
      })
    } catch (err) {
      sendError(res, err)
    }
  })
}
