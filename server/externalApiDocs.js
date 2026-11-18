import path from 'node:path'
import { createRequire } from 'node:module'
import express from 'express'

// Documentacion Swagger de la API externa. La pagina /api/external/docs es
// publica pero vacia: solo pide el token. La especificacion OpenAPI se
// entrega unicamente con un token valido (la sirve externalApi.js).

const require = createRequire(import.meta.url)
const SWAGGER_DIR = path.dirname(require.resolve('swagger-ui-dist/package.json'))

export function openApiSpec(origin) {
  const err = (example) => ({ type: 'object', properties: { error: { type: 'string', example }, message: { type: 'string' } } })
  return {
    openapi: '3.0.3',
    info: {
      title: 'API de horas dictadas',
      version: '1.0.0',
      description: [
        'Lectura de las **horas dictadas por los profesores** de un programa de entrenamiento, para declararlas en un tracker de horas de trabajo.',
        '',
        '**Autenticación:** cada pedido lleva la cabecera `Authorization: Bearer ftk_…`. El token lo crea un administrador en *Configuración → Integraciones: tokens de API* y solo ve los programas de su organización. Máximo 120 pedidos por minuto por token.',
        '',
        '**Cómo se calculan las horas:**',
        '- Solo cuentan las clases **dictadas** (temas marcados como dictados), por su fecha real.',
        '- Los minutos salen del **horario real del grupo** ese día (18:30–20:00 = 90 min). Si el grupo no tiene horario ese día se usa la duración planificada del tema (`minutesSource: "planned"`).',
        '- Si el profesor faltó y se registró un **reemplazo**, la clase es del reemplazo (`substitute: true`).',
        '- Si cambió el profesor del grupo, cada clase es de quien lo tenía a cargo en esa fecha.',
      ].join('\n'),
    },
    servers: [{ url: `${origin}/api/external/v1` }],
    security: [{ token: [] }],
    tags: [{ name: 'Programas' }, { name: 'Horas dictadas' }],
    paths: {
      '/programs': {
        get: {
          tags: ['Programas'],
          summary: 'Programas de entrenamiento disponibles',
          description: 'Devuelve los programas de entrenamiento de la organización del token (las inducciones no se incluyen). Usa el `id` en `/instructor-hours`.',
          operationId: 'listPrograms',
          responses: {
            200: { description: 'Lista de programas', content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'array', items: { $ref: '#/components/schemas/Program' } } } } } } },
            401: { $ref: '#/components/responses/Unauthorized' },
            429: { $ref: '#/components/responses/TooManyRequests' },
          },
        },
      },
      '/instructor-hours': {
        get: {
          tags: ['Horas dictadas'],
          summary: 'Horas dictadas por profesor en un programa y rango de fechas',
          description: 'Clases dictadas entre `from` y `to` (ambas fechas incluidas), con el total por profesor y el detalle de cada clase. Con `format=csv` devuelve un archivo CSV (una fila por clase).',
          operationId: 'getInstructorHours',
          parameters: [
            { name: 'programId', in: 'query', required: true, description: 'Id del programa (ver `/programs`).', schema: { type: 'integer', example: 2 } },
            { name: 'from', in: 'query', required: true, description: 'Fecha inicial, AAAA-MM-DD (incluida).', schema: { type: 'string', format: 'date', example: '2026-11-01' } },
            { name: 'to', in: 'query', required: true, description: 'Fecha final, AAAA-MM-DD (incluida). Rango máximo: 366 días.', schema: { type: 'string', format: 'date', example: '2026-11-30' } },
            { name: 'instructorEmail', in: 'query', required: false, description: 'Solo las clases de este profesor.', schema: { type: 'string', format: 'email' } },
            { name: 'format', in: 'query', required: false, description: '`csv` para descargar en CSV en lugar de JSON.', schema: { type: 'string', enum: ['json', 'csv'], default: 'json' } },
          ],
          responses: {
            200: {
              description: 'Horas dictadas',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/InstructorHoursResponse' } },
                'text/csv': { schema: { type: 'string', example: 'fecha,inicio,fin,minutos,horas,origen_minutos,profesor,correo_profesor,reemplazo,curso,grupo,tema\n2026-11-04,18:30,20:00,90,1.50,schedule,Gustavo Moreno,gustavo@ejemplo.pe,no,Versionamiento de código,Grupo A,Ramas y estrategias de trabajo' } },
              },
            },
            400: { description: 'Parámetros inválidos (fechas, rango o programId).', content: { 'application/json': { schema: err('invalid_request') } } },
            401: { $ref: '#/components/responses/Unauthorized' },
            404: { description: 'El programa no existe o no pertenece a la organización del token.', content: { 'application/json': { schema: err('program_not_found') } } },
            429: { $ref: '#/components/responses/TooManyRequests' },
          },
        },
      },
    },
    components: {
      securitySchemes: { token: { type: 'http', scheme: 'bearer', bearerFormat: 'ftk_…', description: 'Token creado en Configuración → Integraciones: tokens de API.' } },
      responses: {
        Unauthorized: { description: 'Falta el token, no existe, venció o fue revocado.', content: { 'application/json': { schema: err('invalid_token') } } },
        TooManyRequests: { description: 'Más de 120 pedidos por minuto con el mismo token.', content: { 'application/json': { schema: err('too_many_requests') } } },
      },
      schemas: {
        Program: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 2 },
            name: { type: 'string', example: 'Full-stack Fractal 2026' },
            cohort: { type: 'string', nullable: true, example: '2026-2' },
            startsOn: { type: 'string', format: 'date', nullable: true, example: '2026-11-04' },
            endsOn: { type: 'string', format: 'date', nullable: true, example: '2026-12-31' },
            status: { type: 'string', example: 'active', description: 'draft, active, paused, completed, archived o cancelled.' },
            tenantId: { type: 'integer', example: 1 },
            tenantName: { type: 'string', example: 'Fractal' },
          },
        },
        InstructorTotal: {
          type: 'object',
          properties: {
            instructorId: { type: 'integer', nullable: true, example: 7 },
            instructorName: { type: 'string', example: 'Gustavo Moreno' },
            instructorEmail: { type: 'string', nullable: true, example: 'gustavo@ejemplo.pe' },
            classes: { type: 'integer', example: 5 },
            minutes: { type: 'integer', example: 450 },
            hours: { type: 'number', example: 7.5 },
            classesWithoutDuration: { type: 'integer', example: 0, description: 'Clases sin horario ni duración planificada (no suman minutos).' },
          },
        },
        TaughtClass: {
          type: 'object',
          properties: {
            date: { type: 'string', format: 'date', example: '2026-11-04' },
            start: { type: 'string', nullable: true, example: '18:30' },
            end: { type: 'string', nullable: true, example: '20:00' },
            minutes: { type: 'integer', nullable: true, example: 90 },
            minutesSource: { type: 'string', enum: ['schedule', 'planned', 'unknown'], example: 'schedule' },
            plannedMinutes: { type: 'integer', nullable: true, example: 180, description: 'Duración planificada del tema (informativa).' },
            instructorId: { type: 'integer', nullable: true, example: 7 },
            instructorName: { type: 'string', nullable: true, example: 'Gustavo Moreno' },
            instructorEmail: { type: 'string', nullable: true, example: 'gustavo@ejemplo.pe' },
            substitute: { type: 'boolean', example: false, description: 'true si la dictó un reemplazo registrado.' },
            assignedInstructorId: { type: 'integer', nullable: true, example: 7, description: 'Profesor a cargo del grupo esa fecha.' },
            componentId: { type: 'integer', example: 10 },
            componentName: { type: 'string', example: 'Versionamiento de código' },
            groupId: { type: 'integer', example: 10 },
            groupName: { type: 'string', example: 'Grupo A' },
            topicId: { type: 'integer', example: 161 },
            topicTitle: { type: 'string', example: 'Ramas y estrategias de trabajo' },
          },
        },
        InstructorHoursResponse: {
          type: 'object',
          properties: {
            data: {
              type: 'object',
              properties: {
                programId: { type: 'integer', example: 2 },
                from: { type: 'string', format: 'date', example: '2026-11-01' },
                to: { type: 'string', format: 'date', example: '2026-11-30' },
                totals: { type: 'object', properties: { classes: { type: 'integer', example: 5 }, minutes: { type: 'integer', example: 450 }, hours: { type: 'number', example: 7.5 } } },
                instructors: { type: 'array', items: { $ref: '#/components/schemas/InstructorTotal' } },
                classes: { type: 'array', items: { $ref: '#/components/schemas/TaughtClass' } },
              },
            },
            notes: { type: 'string' },
          },
        },
      },
    },
  }
}

const PAGE = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>API de horas dictadas</title>
<link rel="icon" href="/api/external/docs/assets/favicon-32x32.png">
<link rel="stylesheet" href="/api/external/docs/assets/swagger-ui.css">
<style>
  :root{--ink:#17232d;--muted:#4f616b;--deep:#06425e;--line:#dfe6e9;--soft:#eef4f6;--accent:#f4a500}
  *{box-sizing:border-box}
  body{margin:0;background:#f5f7f8;color:var(--ink);font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}
  .gate{min-height:100vh;display:grid;place-items:center;padding:24px 16px}
  .card{width:100%;max-width:460px;background:#fff;border:1px solid var(--line);border-radius:14px;padding:28px;box-shadow:0 10px 30px rgba(23,35,45,.08)}
  .kicker{margin:0 0 6px;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:var(--muted);font-weight:700}
  .card h1{margin:0 0 8px;font-size:22px;color:var(--deep)}
  .card p{margin:0 0 16px;font-size:14px;line-height:1.5;color:var(--muted)}
  .card label{display:block;font-size:12px;font-weight:700;color:var(--muted);margin-bottom:6px}
  .card input{width:100%;height:44px;border:1px solid var(--line);border-radius:8px;padding:0 12px;font:inherit;font-size:14px;color:var(--ink)}
  .card input:focus{outline:3px solid rgba(6,66,94,.2);border-color:var(--deep)}
  .card button{margin-top:14px;width:100%;height:44px;border:0;border-radius:8px;background:var(--deep);color:#fff;font:inherit;font-weight:700;font-size:15px;cursor:pointer}
  .card button:disabled{opacity:.7;cursor:wait}
  .error{margin:12px 0 0;padding:10px 12px;border-radius:8px;background:#fdecec;border:1px solid #f3c6c2;color:#8f1f14;font-size:13px}
  .bar{display:none;align-items:center;justify-content:space-between;gap:12px;padding:10px 16px;background:var(--deep);color:#fff;font-size:14px;flex-wrap:wrap}
  .bar button{border:0;border-radius:8px;font:inherit;font-weight:700;cursor:pointer;margin:0;height:36px;padding:0 14px;background:#fff;color:var(--deep);font-size:13px}
  body.open .gate{display:none}
  body.open .bar{display:flex}
  #swagger{display:none}
  body.open #swagger{display:block}
  .swagger-ui .topbar{display:none}
</style>
</head>
<body>
<div class="bar"><span>API de horas dictadas · conectado con el token <code id="who"></code></span><button type="button" id="logout">Salir</button></div>
<main class="gate">
  <form class="card" id="gate">
    <p class="kicker">Documentación de la API</p>
    <h1>Ingresa tu token</h1>
    <p>Esta documentación solo está disponible con un token de API. Pídelo a un administrador: lo crea en Configuración → Integraciones: tokens de API.</p>
    <label for="token">Token</label>
    <input id="token" name="token" type="password" autocomplete="off" placeholder="ftk_…" required>
    <button type="submit" id="go">Ver documentación</button>
    <div class="error" id="error" role="alert" hidden></div>
  </form>
</main>
<div id="swagger"></div>
<script src="/api/external/docs/assets/swagger-ui-bundle.js"></script>
<script>
(function () {
  var KEY = 'ftk-docs-token'
  var form = document.getElementById('gate'), input = document.getElementById('token'), btn = document.getElementById('go'), errorBox = document.getElementById('error')
  function store(t) { try { t ? sessionStorage.setItem(KEY, t) : sessionStorage.removeItem(KEY) } catch (e) {} }
  function stored() { try { return sessionStorage.getItem(KEY) || '' } catch (e) { return '' } }
  function fail(msg) { errorBox.textContent = msg; errorBox.hidden = false; btn.disabled = false; btn.textContent = 'Ver documentación' }
  function open(token) {
    btn.disabled = true; btn.textContent = 'Verificando…'; errorBox.hidden = true
    fetch('/api/external/v1/openapi.json', { headers: { Authorization: 'Bearer ' + token } })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, status: r.status, body: j } }) })
      .then(function (res) {
        if (!res.ok) { store(''); return fail(res.status === 429 ? 'Demasiados intentos. Espera un minuto.' : 'El token no existe, venció o fue revocado.') }
        store(token)
        document.getElementById('who').textContent = token.slice(0, 12) + '…'
        document.body.classList.add('open')
        var ui = SwaggerUIBundle({
          spec: res.body, dom_id: '#swagger', deepLinking: true, docExpansion: 'list', defaultModelsExpandDepth: 0,
          persistAuthorization: false, tryItOutEnabled: true,
          requestInterceptor: function (req) { if (!req.headers.Authorization) req.headers.Authorization = 'Bearer ' + token; return req },
        })
        try { ui.authActions.authorize({ token: { name: 'token', schema: { type: 'http', scheme: 'bearer' }, value: token } }) } catch (e) {}
      })
      .catch(function () { fail('No se pudo conectar. Inténtalo de nuevo.') })
  }
  form.addEventListener('submit', function (e) { e.preventDefault(); var t = input.value.trim(); if (t) open(t) })
  document.getElementById('logout').addEventListener('click', function () { store(''); location.reload() })
  var saved = stored(); if (saved) open(saved)
})()
</script>
</body>
</html>`

export function registerExternalApiDocs(app) {
  app.use('/api/external/docs/assets', express.static(SWAGGER_DIR, { index: false, maxAge: '7d' }))
  app.get(['/api/external/docs', '/api/external/docs/'], (_req, res) => {
    res.set('X-Robots-Tag', 'noindex, nofollow')
    res.set('Cache-Control', 'no-cache')
    res.type('html').send(PAGE)
  })
}
