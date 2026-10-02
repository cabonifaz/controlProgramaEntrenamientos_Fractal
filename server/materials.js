import fs from 'node:fs'
import path from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'
import multer from 'multer'
import { UPLOADS_DIR } from './uploads.js'

// Material didactico: un ZIP por componente con un HTML por tema
// (tema-01.html, tema-02.html...), sus soluciones en soluciones/ y los
// recursos que necesiten. Vive en el volumen persistente pero FUERA de lo
// que se publica en /uploads: solo se sirve via /material/<token>/...
export const MATERIALS_DIR = path.join(UPLOADS_DIR, 'materials', 'components')
export const SOLUTIONS_DIR_NAME = 'soluciones'

const MAX_ZIP_BYTES = 50 * 1024 * 1024
const MAX_EXTRACTED_BYTES = 300 * 1024 * 1024
const MAX_ENTRIES = 3000
const TOPIC_FILE_RE = /^tema-0*(\d+)\.html?$/i
const JUNK_NAMES = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini'])

const ZIP_MIME_TYPES = new Set([
  'application/zip',
  'application/x-zip-compressed',
  'application/x-zip',
  'application/octet-stream',
])

const uploadMaterialZipMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ZIP_BYTES },
  fileFilter(_req, file, cb) {
    if (!ZIP_MIME_TYPES.has(file.mimetype) && !file.originalname.toLowerCase().endsWith('.zip')) {
      return cb(new Error('invalid_file_type'))
    }
    cb(null, true)
  },
}).single('file')

export function uploadMaterialZip(req, res) {
  return new Promise((resolve, reject) => {
    uploadMaterialZipMiddleware(req, res, (err) => {
      if (!err) return resolve()
      if (err.code === 'LIMIT_FILE_SIZE') return reject(materialError('material_too_large'))
      reject(err.message === 'invalid_file_type' ? err : materialError('upload_failed'))
    })
  })
}

function materialError(code) {
  const err = new Error(code)
  err.materialCode = code
  return err
}

export function materialDir(componentId, folder) {
  return path.join(MATERIALS_DIR, String(componentId), folder)
}

export async function removeMaterialDir(componentId, folder) {
  if (!folder) return
  await fs.promises.rm(materialDir(componentId, folder), { recursive: true, force: true }).catch(() => {})
}

// Rechaza rutas que intenten salir de la carpeta destino (zip-slip).
function entryPathParts(name) {
  const parts = name.replace(/\\/g, '/').split('/').filter((p) => p && p !== '.')
  if (parts.some((p) => p === '..' || p.includes(':') || p.includes('\0'))) {
    throw materialError('material_invalid_path')
  }
  return parts
}

function isJunkEntry(parts) {
  return parts.length === 0 || parts[0] === '__MACOSX' || JUNK_NAMES.has(parts[parts.length - 1])
}

// Descomprime el ZIP en destDir validando estructura y tamaño real
// descomprimido (no el declarado, para frenar zip bombs).
export async function extractMaterialZip(buffer, destDir) {
  let zip
  try {
    zip = await JSZip.loadAsync(buffer)
  } catch {
    throw materialError('invalid_zip')
  }

  const rawEntries = []
  zip.forEach((_relativePath, file) => { if (!file.dir) rawEntries.push(file) })
  if (rawEntries.length > MAX_ENTRIES) throw materialError('material_too_large')

  let entries = rawEntries
    // JSZip ya sanea file.name; se valida el nombre original para rechazar
    // el ZIP entero en vez de aceptar rutas "arregladas" en silencio.
    .map((file) => ({ file, parts: entryPathParts(file.unsafeOriginalName || file.name) }))
    .filter((e) => !isJunkEntry(e.parts))

  // Si se comprimio la carpeta entera (curso/tema-01.html...), se quita
  // esa carpeta raiz para que los temas queden en la raiz.
  const hasRootTopic = entries.some((e) => e.parts.length === 1 && TOPIC_FILE_RE.test(e.parts[0]))
  const rootNames = new Set(entries.map((e) => e.parts[0]))
  if (!hasRootTopic && rootNames.size === 1 && entries.every((e) => e.parts.length > 1)) {
    entries = entries.map((e) => ({ ...e, parts: e.parts.slice(1) }))
  }

  const topicFileCount = entries.filter((e) => e.parts.length === 1 && TOPIC_FILE_RE.test(e.parts[0])).length
  if (topicFileCount === 0) throw materialError('material_missing_topics')
  const solutionFileCount = entries.filter((e) => (
    e.parts.length === 2 && e.parts[0].toLowerCase() === SOLUTIONS_DIR_NAME && TOPIC_FILE_RE.test(e.parts[1])
  )).length

  const resolvedDest = path.resolve(destDir)
  let extractedBytes = 0
  for (const { file, parts } of entries) {
    const target = path.resolve(resolvedDest, ...parts)
    if (!target.startsWith(resolvedDest + path.sep)) throw materialError('material_invalid_path')
    await fs.promises.mkdir(path.dirname(target), { recursive: true })
    const sizeGuard = new Transform({
      transform(chunk, _encoding, cb) {
        extractedBytes += chunk.length
        if (extractedBytes > MAX_EXTRACTED_BYTES) return cb(materialError('material_too_large'))
        cb(null, chunk)
      },
    })
    await pipeline(file.nodeStream('nodebuffer'), sizeGuard, fs.createWriteStream(target))
  }

  return { topicFileCount, solutionFileCount, extractedBytes }
}

async function readdirSafe(dir) {
  return fs.promises.readdir(dir).catch(() => [])
}

function numberedFiles(names) {
  const byPosition = new Map()
  for (const name of names) {
    const match = name.match(TOPIC_FILE_RE)
    if (match && !byPosition.has(Number(match[1]))) byPosition.set(Number(match[1]), name)
  }
  return byPosition
}

// Inventario del material ya descomprimido: que archivo corresponde a cada
// posicion del temario y si trae solucion. withSolutions=false las omite.
export async function describeMaterial(componentId, folder, { withSolutions }) {
  const base = materialDir(componentId, folder)
  const rootNames = await readdirSafe(base)
  const solutionsDir = rootNames.find((n) => n.toLowerCase() === SOLUTIONS_DIR_NAME) || null
  const topics = numberedFiles(rootNames)
  const solutions = withSolutions && solutionsDir ? numberedFiles(await readdirSafe(path.join(base, solutionsDir))) : new Map()

  return {
    indexFile: rootNames.find((n) => n.toLowerCase() === 'index.html') || null,
    topics: [...topics.entries()]
      .sort(([a], [b]) => a - b)
      .map(([position, file]) => ({
        position,
        file,
        solutionFile: solutions.has(position) ? `${solutionsDir}/${solutions.get(position)}` : null,
      })),
  }
}

export function isSolutionsPath(segments) {
  return segments.some((s) => s.toLowerCase() === SOLUTIONS_DIR_NAME)
}

// El HTML del material lo escribe una IA fuera de la plataforma: se sirve
// en un origen opaco (sandbox sin allow-same-origin), asi no puede leer la
// sesion ni llamar a la API como el usuario. no-referrer evita que el token
// de la URL se filtre a CDNs externos que cargue el HTML. Un origen opaco
// pide fuentes, fetch() y <script type="module"> con CORS: el permiso ya
// es el token de la URL, asi que abrir CORS no expone nada nuevo.
export const MATERIAL_RESPONSE_HEADERS = {
  'Content-Security-Policy': 'sandbox allow-scripts allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-downloads',
  'Access-Control-Allow-Origin': '*',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'private, max-age=3600',
}

const TEMPLATE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'templates', 'material')

const SKILL_TEMPLATE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'templates', 'material-skill')

async function addDirToZip(zip, dir, prefix = '') {
  for (const entry of await fs.promises.readdir(dir, { withFileTypes: true })) {
    if (entry.name === '__pycache__') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) await addDirToZip(zip, full, `${prefix}${entry.name}/`)
    else zip.file(`${prefix}${entry.name}`, await fs.promises.readFile(full))
  }
}

// ZIP de ejemplo descargable: la estructura esperada + la guia/prompt para
// pedirle el material a Claude (u otra IA) fuera de la plataforma.
export async function buildMaterialTemplateZip() {
  const zip = new JSZip()
  await addDirToZip(zip, TEMPLATE_DIR)
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}

// Skill de Claude que genera el material: se instala una vez en Claude
// (Configuracion > Capacidades > Skills) y trae diseno, plantillas y un
// script que valida y arma el ZIP. Asi la IA solo escribe contenido en
// JSON, lo que ahorra muchos tokens frente a escribir cada HTML a mano.
// El ZIP contiene la carpeta de la skill (formato que espera Claude).
export async function buildMaterialSkillZip() {
  const zip = new JSZip()
  await addDirToZip(zip, SKILL_TEMPLATE_DIR)
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}
