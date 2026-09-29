import fs from 'node:fs'
import path from 'node:path'
import multer from 'multer'

// UPLOADS_DIR debe apuntar a un volumen persistente en produccion/staging
// (Railway borra el disco local del contenedor en cada deploy). Localmente
// cae a ./uploads si no esta configurado.
export const UPLOADS_DIR = process.env.UPLOADS_DIR || path.resolve(process.cwd(), 'uploads')

const EXTENSION_BY_MIME = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
}

const storage = multer.diskStorage({
  destination(req, _file, cb) {
    const dir = path.join(UPLOADS_DIR, 'tenants', String(req.params.id))
    fs.mkdirSync(dir, { recursive: true })
    cb(null, dir)
  },
  filename(_req, file, cb) {
    cb(null, `logo${EXTENSION_BY_MIME[file.mimetype]}`)
  },
})

const uploadLogoMiddleware = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    if (!EXTENSION_BY_MIME[file.mimetype]) {
      return cb(new Error('invalid_file_type'))
    }
    cb(null, true)
  },
}).single('logo')

export function uploadLogo(req, res) {
  return new Promise((resolve, reject) => {
    uploadLogoMiddleware(req, res, (err) => (err ? reject(err) : resolve()))
  })
}

const SPREADSHEET_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/octet-stream', // algunos navegadores/SO no reconocen el MIME de .xlsx
])

// En memoria: se parsea y se descarta, nunca se guarda en disco/volumen.
const uploadSpreadsheetMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    if (!SPREADSHEET_MIME_TYPES.has(file.mimetype) && !file.originalname.toLowerCase().endsWith('.xlsx')) {
      return cb(new Error('invalid_file_type'))
    }
    cb(null, true)
  },
}).single('file')

export function uploadSpreadsheet(req, res) {
  return new Promise((resolve, reject) => {
    uploadSpreadsheetMiddleware(req, res, (err) => (err ? reject(err) : resolve()))
  })
}
