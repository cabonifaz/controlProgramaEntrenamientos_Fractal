import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { callProcedure } from './db.js'
import { hashPassword } from './auth.js'
import { authenticate } from './middleware/authenticate.js'
import { mapStoredProcedureError } from './errors.js'
import { uploadPublicImage, PUBLIC_IMAGE_EXTENSIONS, UPLOADS_DIR } from './uploads.js'

// Web publica de cada programa (/p/<tenant>/<programa>), su formulario de
// preinscripcion y la gestion de ambos (configuracion, banner, perfil
// publico de instructores, confirmar/rechazar preinscripciones). Como en
// el resto de la API, las reglas viven en los SPs.

const PUBLIC_UPLOADS_DIR = path.join(UPLOADS_DIR, 'public')
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function sendError(res, err) {
  const { status, message } = mapStoredProcedureError(err)
  res.status(status).json({ message })
}

const publicUrl = (relativePath) => (relativePath ? `/uploads/${relativePath}` : null)

function actorParams(req) {
  return { p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId }
}

// Guarda la imagen ya validada por multer bajo uploads/public/<carpeta>/ y
// devuelve la ruta relativa (la que se guarda en la base).
async function saveImage(file, folder, baseName) {
  const relative = `public/${folder}/${baseName}-${Date.now()}${PUBLIC_IMAGE_EXTENSIONS[file.mimetype]}`
  const absolute = path.join(UPLOADS_DIR, relative)
  await fs.promises.mkdir(path.dirname(absolute), { recursive: true })
  await fs.promises.writeFile(absolute, file.buffer)
  return relative
}

function removeUpload(relativePath) {
  if (!relativePath || !relativePath.startsWith('public/')) return
  const absolute = path.resolve(UPLOADS_DIR, relativePath)
  if (absolute.startsWith(path.resolve(PUBLIC_UPLOADS_DIR) + path.sep)) fs.unlink(absolute, () => {})
}

// Todo lo que muestra la web publica de un programa, en una sola respuesta.
export async function loadPublicProgram(tenantSlug, programSlug) {
  const [program] = await callProcedure('sp_public_program_get', { p_tenant_slug: tenantSlug, p_program_slug: programSlug })
  const id = program.program_id
  const [temario, instructors, schedule] = await Promise.all([
    callProcedure('sp_public_program_temario', { p_program_id: id }),
    callProcedure('sp_public_program_instructors', { p_program_id: id }),
    callProcedure('sp_public_program_schedule', { p_program_id: id }),
  ])

  const components = []
  for (const row of temario) {
    let component = components.find((c) => c.id === row.component_id)
    if (!component) {
      component = { id: row.component_id, name: row.component_name, description: row.component_description, topics: [] }
      components.push(component)
    }
    if (row.title) component.topics.push({ position: Number(row.topic_position), title: row.title, durationMinutes: row.duration_minutes })
  }
  const totalMinutes = components.reduce((sum, c) => sum + c.topics.reduce((s, t) => s + (Number(t.durationMinutes) || 0), 0), 0)

  return {
    tenant: { name: program.tenant_name, slug: program.tenant_slug, logoUrl: publicUrl(program.logo_path), brandColor: program.brand_color },
    program: {
      name: program.name, description: program.description, cohort: program.cohort,
      startsOn: program.starts_on, endsOn: program.ends_on, modality: program.modality_label,
      tagline: program.public_tagline, audience: program.public_audience, bannerUrl: publicUrl(program.banner_path),
      enrollmentOpen: Boolean(program.enrollment_open),
      topicsCount: components.reduce((sum, c) => sum + c.topics.length, 0), totalHours: Math.round(totalMinutes / 60),
    },
    components,
    instructors: instructors.map((i) => ({
      name: i.full_name, headline: i.public_headline, bio: i.public_bio, photoUrl: publicUrl(i.photo_path),
      linkedinUrl: i.linkedin_url, components: i.components,
    })),
    schedule: schedule.map((s) => ({ weekday: Number(s.weekday), start: s.start_time, end: s.end_time })),
  }
}

// Freno en memoria del formulario publico (ademas del limite por IP del
// SP): 5 envios cada 10 minutos por IP.
const recentSubmissions = new Map()
function rateLimited(ip) {
  const now = Date.now()
  const windowStart = now - 10 * 60 * 1000
  const hits = (recentSubmissions.get(ip) || []).filter((t) => t > windowStart)
  hits.push(now)
  recentSubmissions.set(ip, hits)
  if (recentSubmissions.size > 5000) {
    for (const [key, times] of recentSubmissions) if (times.every((t) => t <= windowStart)) recentSubmissions.delete(key)
  }
  return hits.length > 5
}

function cleanText(value, max) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : ''
}

export function registerPublicProgramRoutes(app) {
  // ------------------------------------------------------------- publico
  app.get('/api/public/programs/:tenantSlug/:programSlug', async (req, res) => {
    try {
      res.json({ data: await loadPublicProgram(req.params.tenantSlug, req.params.programSlug) })
    } catch (err) {
      sendError(res, err)
    }
  })

  app.post('/api/public/programs/:tenantSlug/:programSlug/pre-enrollments', async (req, res) => {
    const body = req.body || {}
    // Honeypot: campo oculto que solo llenan los bots. Se responde "ok"
    // para no darles pistas, sin guardar nada.
    if (body.website) return res.status(201).json({ ok: true })
    if (rateLimited(req.ip)) return res.status(429).json({ message: 'too_many_requests' })

    const data = {
      fullName: cleanText(body.fullName, 160),
      email: cleanText(body.email, 190).toLowerCase(),
      phone: cleanText(body.phone, 40),
      corporateEmail: cleanText(body.corporateEmail, 190).toLowerCase(),
      documentTypeCode: cleanText(body.documentTypeCode, 80),
      documentNumber: cleanText(body.documentNumber, 40).toUpperCase(),
      country: cleanText(body.country, 80),
    }
    const invalid = []
    if (data.fullName.length < 3) invalid.push('fullName')
    if (!EMAIL_RE.test(data.email)) invalid.push('email')
    if (!/^\+?[\d\s()-]{6,40}$/.test(data.phone)) invalid.push('phone')
    if (data.corporateEmail && !EMAIL_RE.test(data.corporateEmail)) invalid.push('corporateEmail')
    if (!data.documentTypeCode) invalid.push('documentTypeCode')
    if (!/^[A-Z0-9-]{4,40}$/.test(data.documentNumber)) invalid.push('documentNumber')
    if (data.country.length < 2) invalid.push('country')
    if (body.consent !== true) invalid.push('consent')
    if (invalid.length) return res.status(400).json({ message: 'invalid_fields', fields: invalid })

    try {
      await callProcedure('sp_pre_enrollments_create', {
        p_tenant_slug: req.params.tenantSlug, p_program_slug: req.params.programSlug,
        p_full_name: data.fullName, p_email: data.email, p_phone: data.phone, p_corporate_email: data.corporateEmail || null,
        p_document_type_code: data.documentTypeCode, p_document_number: data.documentNumber, p_country: data.country,
        p_ip_address: req.ip || null,
      })
      res.status(201).json({ ok: true })
    } catch (err) {
      sendError(res, err)
    }
  })

  // ------------------------------------------------------------- gestion
  app.post('/api/programs/:id/public', authenticate, async (req, res) => {
    const programId = Number(req.params.id)
    const { publicSlug, isPublic, enrollmentOpen, tagline, audience } = req.body || {}
    if (!Number.isInteger(programId)) return res.status(400).json({ message: 'Invalid request format' })
    try {
      await callProcedure('sp_programs_update_public', {
        ...actorParams(req), p_program_id: programId,
        p_public_slug: typeof publicSlug === 'string' && publicSlug.trim() ? publicSlug.trim().toLowerCase() : null,
        p_is_public: Boolean(isPublic), p_enrollment_open: enrollmentOpen !== false,
        p_tagline: cleanText(tagline, 255) || null, p_audience: typeof audience === 'string' ? audience.trim().slice(0, 4000) : null,
      })
      res.json({ ok: true })
    } catch (err) {
      sendError(res, err)
    }
  })

  app.post('/api/programs/:id/banner', authenticate, async (req, res) => {
    const programId = Number(req.params.id)
    if (!Number.isInteger(programId)) return res.status(400).json({ message: 'Invalid request format' })
    try {
      await uploadPublicImage(req, res)
    } catch (err) {
      return res.status(400).json({ message: err.message })
    }
    if (!req.file) return res.status(400).json({ message: 'Invalid request format' })

    const bannerPath = await saveImage(req.file, `programs/${programId}`, 'banner')
    try {
      const [result] = await callProcedure('sp_programs_set_banner', { ...actorParams(req), p_program_id: programId, p_banner_path: bannerPath })
      removeUpload(result?.previous_banner_path)
      res.json({ bannerUrl: publicUrl(bannerPath) })
    } catch (err) {
      removeUpload(bannerPath)
      sendError(res, err)
    }
  })

  app.post('/api/users/:id/public-profile', authenticate, async (req, res) => {
    const userId = Number(req.params.id)
    const { headline, bio, linkedinUrl } = req.body || {}
    if (!Number.isInteger(userId)) return res.status(400).json({ message: 'Invalid request format' })
    const linkedin = cleanText(linkedinUrl, 255)
    if (linkedin && !/^https:\/\/([a-z]{2,3}\.)?linkedin\.com\//i.test(linkedin)) return res.status(400).json({ message: 'invalid_linkedin_url' })
    try {
      await callProcedure('sp_users_update_public_profile', {
        ...actorParams(req), p_user_id: userId, p_headline: cleanText(headline, 160) || null,
        p_bio: typeof bio === 'string' ? bio.trim().slice(0, 2000) : null, p_linkedin_url: linkedin || null,
      })
      res.json({ ok: true })
    } catch (err) {
      sendError(res, err)
    }
  })

  app.post('/api/users/:id/photo', authenticate, async (req, res) => {
    const userId = Number(req.params.id)
    if (!Number.isInteger(userId)) return res.status(400).json({ message: 'Invalid request format' })
    try {
      await uploadPublicImage(req, res)
    } catch (err) {
      return res.status(400).json({ message: err.message })
    }
    if (!req.file) return res.status(400).json({ message: 'Invalid request format' })

    const photoPath = await saveImage(req.file, `instructors/${userId}`, 'photo')
    try {
      const [result] = await callProcedure('sp_users_set_photo', { ...actorParams(req), p_user_id: userId, p_photo_path: photoPath })
      removeUpload(result?.previous_photo_path)
      res.json({ photoUrl: publicUrl(photoPath) })
    } catch (err) {
      removeUpload(photoPath)
      sendError(res, err)
    }
  })

  app.get('/api/pre-enrollments', authenticate, async (req, res) => {
    const programId = req.query.programId ? Number(req.query.programId) : null
    const tenantId = req.query.tenantId ? Number(req.query.tenantId) : null
    try {
      const data = await callProcedure('sp_pre_enrollments_list', {
        p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId, p_tenant_id_filter: tenantId,
        p_program_id: Number.isInteger(programId) ? programId : null,
        p_status_code: typeof req.query.status === 'string' && req.query.status ? req.query.status : null,
      })
      res.json({ data })
    } catch (err) {
      sendError(res, err)
    }
  })

  // Confirmar crea la cuenta del alumno (si no la tenia) con una
  // contrasena temporal que se muestra UNA vez al admin para que la
  // comparta: no hay servicio de correo (mismo patron que la carga masiva).
  app.post('/api/pre-enrollments/:id/resolve', authenticate, async (req, res) => {
    const id = Number(req.params.id)
    const { action, comments } = req.body || {}
    if (!Number.isInteger(id) || !['confirm', 'reject'].includes(action)) return res.status(400).json({ message: 'Invalid request format' })

    const temporaryPassword = action === 'confirm' ? crypto.randomBytes(9).toString('base64url') : null
    try {
      const [result] = await callProcedure('sp_pre_enrollments_resolve', {
        ...actorParams(req), p_pre_enrollment_id: id, p_action: action,
        p_password_hash: temporaryPassword ? await hashPassword(temporaryPassword) : null,
        p_comments: cleanText(comments, 500) || null,
      })
      const accountCreated = Boolean(result?.account_created)
      res.json({
        data: {
          studentId: result?.student_id ?? null, email: result?.email, accountCreated,
          temporaryPassword: accountCreated ? temporaryPassword : null,
        },
      })
    } catch (err) {
      sendError(res, err)
    }
  })
}

// Para compartir el link en WhatsApp/redes: la web publica es una SPA, asi
// que el servidor inyecta titulo, descripcion e imagen (banner) en el HTML
// antes de enviarlo. Si algo falla, se sirve el HTML tal cual.
export async function renderPublicProgramHtml(indexHtml, req, tenantSlug, programSlug) {
  try {
    const { tenant, program } = await loadPublicProgram(tenantSlug, programSlug)
    const escape = (s) => String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const title = `${program.name} · ${tenant.name}`
    const description = program.tagline || program.description || `Programa de formación de ${tenant.name}`
    const origin = `${req.protocol}://${req.get('host')}`
    const image = program.bannerUrl ? `${origin}${program.bannerUrl}` : null
    const tags = [
      `<meta name="description" content="${escape(description)}">`,
      `<meta property="og:type" content="website">`,
      `<meta property="og:title" content="${escape(title)}">`,
      `<meta property="og:description" content="${escape(description)}">`,
      `<meta property="og:url" content="${escape(origin + req.originalUrl)}">`,
      image ? `<meta property="og:image" content="${escape(image)}">` : '',
      `<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">`,
    ].join('\n    ')
    return indexHtml
      .replace(/<title>[^<]*<\/title>/, `<title>${escape(title)}</title>`)
      .replace('</head>', `    ${tags}\n  </head>`)
  } catch {
    return indexHtml
  }
}
