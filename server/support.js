import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import multer from 'multer'
import { callProcedure } from './db.js'
import { authenticate } from './middleware/authenticate.js'
import { mapStoredProcedureError } from './errors.js'
import { PUBLIC_IMAGE_EXTENSIONS, UPLOADS_DIR } from './uploads.js'

// Incidencias, observaciones y mejoras. Cada reporte puede traer la captura
// automatica de la pantalla desde donde se registro y una imagen adjunta.
// Ambas son privadas (support/ no se sirve como estatico): las entrega
// GET /api/support-tickets/:id/file/:kind a quien puede ver el reporte.

const SUPPORT_PREFIX = 'support/'
const TYPES = new Set(['incident', 'observation', 'improvement'])
const STATUSES = new Set(['open', 'in_progress', 'resolved', 'closed'])

const uploadTicketFiles = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 2 },
  fileFilter(_req, file, cb) {
    if (!PUBLIC_IMAGE_EXTENSIONS[file.mimetype]) return cb(new Error('invalid_file_type'))
    cb(null, true)
  },
}).fields([{ name: 'screenshot', maxCount: 1 }, { name: 'image', maxCount: 1 }])

function runUpload(req, res) {
  return new Promise((resolve, reject) => {
    uploadTicketFiles(req, res, (err) => {
      if (!err) return resolve()
      reject(new Error(err.code === 'LIMIT_FILE_SIZE' ? 'image_too_large' : err.message === 'invalid_file_type' ? 'invalid_file_type' : 'upload_failed'))
    })
  })
}

function saveFile(file, userId) {
  if (!file) return null
  const relative = `${SUPPORT_PREFIX}${userId}/${crypto.randomUUID()}${PUBLIC_IMAGE_EXTENSIONS[file.mimetype]}`
  const absolute = path.join(UPLOADS_DIR, relative)
  fs.mkdirSync(path.dirname(absolute), { recursive: true })
  fs.writeFileSync(absolute, file.buffer)
  return relative
}

function removeFile(relative) {
  if (relative && relative.startsWith(SUPPORT_PREFIX)) fs.unlink(path.join(UPLOADS_DIR, relative), () => {})
}

function sendError(res, err) {
  const { status, message } = mapStoredProcedureError(err)
  res.status(status).json({ message })
}
const actor = (req) => ({ p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId })
const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

export function registerSupportRoutes(app) {
  app.post('/api/support-tickets', authenticate, async (req, res) => {
    try {
      await runUpload(req, res)
    } catch (err) {
      return res.status(400).json({ message: err.message })
    }
    const body = req.body || {}
    if (!TYPES.has(body.type) || !text(body.title, 140) || !text(body.description, 2000)) {
      return res.status(400).json({ message: 'Invalid request format' })
    }
    const screenshotPath = saveFile(req.files?.screenshot?.[0], req.user.id)
    const imagePath = saveFile(req.files?.image?.[0], req.user.id)
    try {
      const [result] = await callProcedure('sp_support_tickets_create', {
        ...actor(req), p_type: body.type, p_title: text(body.title, 140), p_description: text(body.description, 2000),
        p_section: text(body.section, 80) || null, p_page_url: text(body.pageUrl, 300) || null,
        p_user_agent: text(req.get('user-agent'), 300) || null, p_viewport: text(body.viewport, 30) || null,
        p_screenshot_path: screenshotPath, p_image_path: imagePath,
      })
      res.status(201).json({ data: result })
    } catch (err) {
      removeFile(screenshotPath)
      removeFile(imagePath)
      sendError(res, err)
    }
  })

  app.get('/api/support-tickets', authenticate, async (req, res) => {
    try {
      res.json({ data: await callProcedure('sp_support_tickets_list', actor(req)) })
    } catch (err) {
      sendError(res, err)
    }
  })

  app.get('/api/support-tickets/:id', authenticate, async (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isInteger(id)) return res.status(400).json({ message: 'Invalid request format' })
    try {
      const [ticket] = await callProcedure('sp_support_ticket_get', { ...actor(req), p_ticket_id: id })
      if (!ticket) return res.status(404).json({ message: 'Not found' })
      const messages = await callProcedure('sp_support_ticket_messages', { ...actor(req), p_ticket_id: id })
      const { screenshot_path: s, image_path: i, ...rest } = ticket
      res.json({ data: { ...rest, has_screenshot: Boolean(s), has_image: Boolean(i), messages } })
    } catch (err) {
      sendError(res, err)
    }
  })

  app.get('/api/support-tickets/:id/file/:kind', authenticate, async (req, res) => {
    const id = Number(req.params.id)
    const kind = req.params.kind
    if (!Number.isInteger(id) || !['screenshot', 'image'].includes(kind)) return res.status(400).json({ message: 'Invalid request format' })
    try {
      const [ticket] = await callProcedure('sp_support_ticket_get', { ...actor(req), p_ticket_id: id })
      const relative = ticket?.[kind === 'screenshot' ? 'screenshot_path' : 'image_path']
      if (!relative || !relative.startsWith(SUPPORT_PREFIX)) return res.status(404).json({ message: 'Not found' })
      const absolute = path.resolve(UPLOADS_DIR, relative)
      if (!absolute.startsWith(path.resolve(UPLOADS_DIR, SUPPORT_PREFIX)) || !fs.existsSync(absolute)) return res.status(404).json({ message: 'Not found' })
      res.setHeader('X-Content-Type-Options', 'nosniff')
      res.setHeader('Cache-Control', 'private, max-age=300')
      res.sendFile(absolute)
    } catch (err) {
      sendError(res, err)
    }
  })

  app.post('/api/support-tickets/:id/reply', authenticate, async (req, res) => {
    const id = Number(req.params.id)
    const message = text(req.body?.message, 2000)
    if (!Number.isInteger(id) || !message) return res.status(400).json({ message: 'Invalid request format' })
    try {
      await callProcedure('sp_support_ticket_reply', { ...actor(req), p_ticket_id: id, p_message: message })
      res.json({ ok: true })
    } catch (err) {
      sendError(res, err)
    }
  })

  app.post('/api/support-tickets/:id/status', authenticate, async (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || !STATUSES.has(req.body?.status)) return res.status(400).json({ message: 'Invalid request format' })
    try {
      await callProcedure('sp_support_ticket_set_status', { ...actor(req), p_ticket_id: id, p_status: req.body.status })
      res.json({ ok: true })
    } catch (err) {
      sendError(res, err)
    }
  })
}
