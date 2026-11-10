import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import multer from 'multer'
import { callProcedure } from './db.js'
import { authenticate } from './middleware/authenticate.js'
import { mapStoredProcedureError } from './errors.js'
import { UPLOADS_DIR } from './uploads.js'

// Clase en linea: link de la reunion (Teams/Meet/Zoom), grabacion, nota del
// profesor y materiales (archivos o links). Edita el profesor del grupo o
// el admin; los alumnos inscritos solo ven y descargan. Los archivos son
// privados (class-files/ no se sirve como estatico).

const FILES_PREFIX = 'class-files/'
const MAX_FILE = 25 * 1024 * 1024
const ALLOWED_EXT = new Set(['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.csv', '.txt', '.md', '.zip', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.json', '.sql', '.js', '.ts', '.html', '.css', '.py', '.java', '.cs'])

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE, files: 1 },
  fileFilter(_req, file, cb) {
    if (!ALLOWED_EXT.has(path.extname(file.originalname).toLowerCase())) return cb(new Error('invalid_file_type'))
    cb(null, true)
  },
}).single('file')

function runUpload(req, res) {
  return new Promise((resolve, reject) => {
    upload(req, res, (err) => {
      if (!err) return resolve()
      reject(new Error(err.code === 'LIMIT_FILE_SIZE' ? 'file_too_large' : err.message === 'invalid_file_type' ? 'invalid_file_type' : 'upload_failed'))
    })
  })
}

function sendError(res, err) {
  const { status, message } = mapStoredProcedureError(err)
  res.status(status).json({ message })
}
const actor = (req) => ({ p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId })
const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

// '' = borrar; si viene, debe ser http(s).
function cleanUrl(value) {
  const url = text(value, 500)
  if (!url) return { url: null }
  try {
    const parsed = new URL(url)
    if (!['https:', 'http:'].includes(parsed.protocol)) return { invalid: true }
  } catch { return { invalid: true } }
  return { url }
}

export function meetingProvider(url) {
  if (!url) return null
  const host = (() => { try { return new URL(url).hostname } catch { return '' } })()
  if (/teams\.(microsoft|live)\.com$/.test(host) || host.endsWith('teams.microsoft.com')) return 'teams'
  if (host === 'meet.google.com') return 'meet'
  if (/(^|\.)zoom\.us$/.test(host)) return 'zoom'
  return 'other'
}

async function access(req, topicId) {
  const [row] = await callProcedure('sp_class_access', { ...actor(req), p_topic_id: topicId })
  return row?.access || 'none'
}

export function registerClassRoutes(app) {
  app.get('/api/topics/:id/class', authenticate, async (req, res) => {
    const topicId = Number(req.params.id)
    if (!Number.isInteger(topicId)) return res.status(400).json({ message: 'Invalid request format' })
    try {
      const level = await access(req, topicId)
      if (level === 'none') return res.status(404).json({ message: 'Not found' })
      const [info] = await callProcedure('sp_topic_class_get', { ...actor(req), p_topic_id: topicId })
      const resources = await callProcedure('sp_topic_resources_list', { p_topic_id: topicId })
      res.json({
        data: {
          canEdit: level === 'edit', meetingUrl: info.meeting_url, meetingProvider: meetingProvider(info.meeting_url),
          ownMeetingUrl: info.topic_meeting_url, groupMeetingUrl: info.group_meeting_url, groupName: info.group_name,
          recordingUrl: info.recording_url, classNotes: info.class_notes,
          resources: resources.map((r) => ({ id: r.id, kind: r.kind, title: r.title, url: r.kind === 'link' ? r.url : null, originalName: r.original_name, sizeBytes: r.size_bytes, createdAt: r.created_at, createdByName: r.created_by_name })),
        },
      })
    } catch (err) {
      sendError(res, err)
    }
  })

  app.put('/api/topics/:id/class', authenticate, async (req, res) => {
    const topicId = Number(req.params.id)
    if (!Number.isInteger(topicId)) return res.status(400).json({ message: 'Invalid request format' })
    const meeting = cleanUrl(req.body?.meetingUrl)
    const recording = cleanUrl(req.body?.recordingUrl)
    if (meeting.invalid || recording.invalid) return res.status(400).json({ message: 'invalid_url' })
    try {
      const [row] = await callProcedure('sp_class_access', { ...actor(req), p_topic_id: topicId })
      if (row?.access !== 'edit') return res.status(403).json({ message: 'not_authorized' })
      // "Para todas las clases del grupo": el link queda en el grupo.
      if (req.body?.applyToGroup) {
        await callProcedure('sp_group_meeting_set', { p_actor_user_id: req.user.id, p_group_id: row.group_id, p_meeting_url: meeting.url, p_apply_all: true })
      }
      await callProcedure('sp_topic_class_info_set', {
        p_actor_user_id: req.user.id, p_topic_id: topicId, p_meeting_url: req.body?.applyToGroup ? null : meeting.url,
        p_recording_url: recording.url, p_class_notes: text(req.body?.classNotes, 2000) || null,
      })
      res.json({ ok: true })
    } catch (err) {
      sendError(res, err)
    }
  })

  // Material: archivo (multipart "file" + "title") o link (JSON {title, url}).
  app.post('/api/topics/:id/resources', authenticate, async (req, res) => {
    const topicId = Number(req.params.id)
    if (!Number.isInteger(topicId)) return res.status(400).json({ message: 'Invalid request format' })
    if (req.is('multipart/form-data')) {
      try { await runUpload(req, res) } catch (err) { return res.status(400).json({ message: err.message }) }
    }
    let relative = null
    try {
      if (await access(req, topicId) !== 'edit') return res.status(403).json({ message: 'not_authorized' })
      if (req.file) {
        relative = `${FILES_PREFIX}${topicId}/${crypto.randomUUID()}${path.extname(req.file.originalname).toLowerCase()}`
        const absolute = path.join(UPLOADS_DIR, relative)
        fs.mkdirSync(path.dirname(absolute), { recursive: true })
        fs.writeFileSync(absolute, req.file.buffer)
        // multer entrega el nombre original como latin1 aunque venga en UTF-8.
        const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8')
        const [r] = await callProcedure('sp_topic_resources_add', {
          p_actor_user_id: req.user.id, p_topic_id: topicId, p_kind: 'file', p_title: text(req.body?.title, 200) || originalName,
          p_url: null, p_file_path: relative, p_original_name: originalName.slice(0, 255), p_size_bytes: req.file.size, p_mime_type: req.file.mimetype.slice(0, 120),
        })
        return res.status(201).json({ data: r })
      }
      const link = cleanUrl(req.body?.url)
      if (!link.url || link.invalid || !text(req.body?.title, 200)) return res.status(400).json({ message: link.invalid ? 'invalid_url' : 'Invalid request format' })
      const [r] = await callProcedure('sp_topic_resources_add', {
        p_actor_user_id: req.user.id, p_topic_id: topicId, p_kind: 'link', p_title: text(req.body.title, 200),
        p_url: link.url, p_file_path: null, p_original_name: null, p_size_bytes: null, p_mime_type: null,
      })
      res.status(201).json({ data: r })
    } catch (err) {
      if (relative) fs.unlink(path.join(UPLOADS_DIR, relative), () => {})
      sendError(res, err)
    }
  })

  app.delete('/api/topics/:id/resources/:rid', authenticate, async (req, res) => {
    const topicId = Number(req.params.id)
    const resourceId = Number(req.params.rid)
    if (!Number.isInteger(topicId) || !Number.isInteger(resourceId)) return res.status(400).json({ message: 'Invalid request format' })
    try {
      if (await access(req, topicId) !== 'edit') return res.status(403).json({ message: 'not_authorized' })
      const [r] = await callProcedure('sp_topic_resource_get', { p_resource_id: resourceId })
      if (!r || r.topic_id !== topicId) return res.status(404).json({ message: 'Not found' })
      await callProcedure('sp_topic_resources_remove', { p_actor_user_id: req.user.id, p_resource_id: resourceId })
      res.json({ ok: true })
    } catch (err) {
      sendError(res, err)
    }
  })

  app.get('/api/topics/:id/resources/:rid/download', authenticate, async (req, res) => {
    const topicId = Number(req.params.id)
    const resourceId = Number(req.params.rid)
    if (!Number.isInteger(topicId) || !Number.isInteger(resourceId)) return res.status(400).json({ message: 'Invalid request format' })
    try {
      if (await access(req, topicId) === 'none') return res.status(404).json({ message: 'Not found' })
      const [r] = await callProcedure('sp_topic_resource_get', { p_resource_id: resourceId })
      if (!r || r.topic_id !== topicId || r.kind !== 'file' || !r.file_path?.startsWith(FILES_PREFIX)) return res.status(404).json({ message: 'Not found' })
      const absolute = path.resolve(UPLOADS_DIR, r.file_path)
      if (!absolute.startsWith(path.resolve(UPLOADS_DIR, FILES_PREFIX)) || !fs.existsSync(absolute)) return res.status(404).json({ message: 'Not found' })
      res.setHeader('X-Content-Type-Options', 'nosniff')
      res.download(absolute, r.original_name || path.basename(absolute))
    } catch (err) {
      sendError(res, err)
    }
  })
}
