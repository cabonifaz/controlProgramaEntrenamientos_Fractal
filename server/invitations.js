import crypto from 'node:crypto'
import { callProcedure } from './db.js'
import { hashPassword } from './auth.js'
import { authenticate } from './middleware/authenticate.js'
import { mapStoredProcedureError } from './errors.js'
import { invitationEmail, mailEnabled, sendMail } from './mailer.js'

// Usuarios por invitacion: se crean sin contrasena y la persona crea la
// suya con un enlace personal de un solo uso (/invitacion/<token>). Con el
// correo activo (server/mailer.js) el enlace tambien se envia a la persona;
// el admin igual lo ve para copiarlo. En la base solo se guarda el sha256.

export const INVITATION_VALID_DAYS = 7
// Marca de "sin contrasena todavia" en users.password_hash.
export const NO_PASSWORD = ''

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex')

function sendError(res, err) {
  const { status, message } = mapStoredProcedureError(err)
  res.status(status).json({ message })
}

// Genera (o regenera: anula los anteriores) el enlace de un usuario. El
// SP decide si el actor puede invitar a ese usuario.
export async function createInvitation(req, userId) {
  const token = crypto.randomBytes(32).toString('base64url')
  const [result] = await callProcedure('sp_user_invitations_create', {
    p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId,
    p_user_id: userId, p_token_hash: hashToken(token), p_valid_days: INVITATION_VALID_DAYS,
  })
  const invitationUrl = `${req.protocol}://${req.get('host')}/invitacion/${token}`
  const mail = await emailInvitation(token, invitationUrl)
  return { invitationUrl, expiresAt: result?.expires_at ?? null, emailSent: mail.sent, emailTo: mail.to ?? null }
}

// Envia el enlace por correo a la persona (si el correo esta activo).
async function emailInvitation(token, url) {
  if (!mailEnabled()) return { sent: false }
  try {
    const [info] = await callProcedure('sp_user_invitations_get', { p_token_hash: hashToken(token) })
    if (!info?.email) return { sent: false }
    const mail = invitationEmail({
      fullName: info.full_name, tenantName: info.tenant_name, url, isReset: Boolean(info.has_password),
      expiresAt: info.expires_at, brandColor: info.tenant_brand_color,
    })
    const result = await sendMail({ to: info.email, tenantId: info.tenant_id, ...mail })
    return { sent: result.sent, to: info.email }
  } catch (err) {
    console.error('[mail] invitación sin enviar:', err.message)
    return { sent: false }
  }
}

// Reglas minimas de contrasena (las mismas que muestra la pagina).
export function passwordProblem(password) {
  if (typeof password !== 'string' || password.length < 8) return 'password_too_short'
  if (password.length > 128) return 'password_too_long'
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) return 'password_needs_letters_and_numbers'
  return null
}

export function registerInvitationRoutes(app) {
  // "Olvide mi clave": siempre responde lo mismo, exista o no el correo.
  app.post('/api/public/password-reset', async (req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : ''
    if (!email || email.length > 190 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: 'Invalid request format' })
    try {
      const rows = await callProcedure('sp_password_reset_request', { p_email: email, p_ip_address: req.ip || null })
      // Versiones previas del SP no devuelven fila: entonces no hay envio directo.
      const request = Array.isArray(rows) ? rows[0] : null
      // Con correo activo, el enlace le llega directo a la persona y la
      // solicitud queda atendida (sin correo, la atiende un administrador).
      if (mailEnabled() && request?.user_id) {
        const system = { user: { id: request.user_id, roleCode: 'super_admin', tenantId: null }, protocol: req.protocol, get: (h) => req.get(h) }
        const sent = await createInvitation(system, request.user_id).catch((err) => { console.error('[mail] reset:', err.message); return null })
        if (sent?.emailSent) {
          await callProcedure('sp_password_reset_requests_resolve', {
            p_actor_user_id: request.user_id, p_actor_role: 'super_admin', p_actor_tenant_id: null, p_request_id: request.request_id, p_status: 'resolved',
          }).catch(() => {})
        }
      }
      res.json({ ok: true, emailEnabled: mailEnabled() })
    } catch (err) {
      sendError(res, err)
    }
  })

  app.get('/api/password-reset-requests', authenticate, async (req, res) => {
    try {
      res.json({ data: await callProcedure('sp_password_reset_requests_list', {
        p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId,
      }) })
    } catch (err) {
      sendError(res, err)
    }
  })

  // Genera el enlace de nueva clave y cierra la solicitud.
  app.post('/api/password-reset-requests/:id/:action', authenticate, async (req, res) => {
    const requestId = Number(req.params.id)
    const action = req.params.action
    if (!Number.isInteger(requestId) || !['link', 'dismiss'].includes(action)) return res.status(400).json({ message: 'Invalid request format' })
    const actor = { p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId }
    try {
      if (action === 'dismiss') {
        await callProcedure('sp_password_reset_requests_resolve', { ...actor, p_request_id: requestId, p_status: 'dismissed' })
        return res.json({ ok: true })
      }
      const [{ user_id: userId }] = await callProcedure('sp_password_reset_requests_resolve', { ...actor, p_request_id: requestId, p_status: 'resolved' })
      res.json({ data: await createInvitation(req, userId) })
    } catch (err) {
      sendError(res, err)
    }
  })

  // Enlace nuevo para un usuario: invitacion pendiente/vencida, o para que
  // alguien que perdio el acceso cree una contrasena nueva (reemplaza a las
  // contrasenas temporales).
  app.post('/api/users/:id/invitation', authenticate, async (req, res) => {
    const userId = Number(req.params.id)
    if (!Number.isInteger(userId)) return res.status(400).json({ message: 'Invalid request format' })
    try {
      res.json({ data: await createInvitation(req, userId) })
    } catch (err) {
      sendError(res, err)
    }
  })

  app.get('/api/public/invitations/:token', async (req, res) => {
    try {
      const [row] = await callProcedure('sp_user_invitations_get', { p_token_hash: hashToken(req.params.token) })
      res.json({
        data: {
          fullName: row.full_name, email: row.email, roleLabel: row.role_label, expiresAt: row.expires_at,
          isReset: Boolean(row.has_password),
          tenant: row.tenant_name
            ? { name: row.tenant_name, slug: row.tenant_slug, logoUrl: row.tenant_logo_path ? `/uploads/${row.tenant_logo_path}` : null, brandColor: row.tenant_brand_color }
            : null,
        },
      })
    } catch (err) {
      sendError(res, err)
    }
  })

  app.post('/api/public/invitations/:token/accept', async (req, res) => {
    const { password } = req.body || {}
    const problem = passwordProblem(password)
    if (problem) return res.status(400).json({ message: problem })
    try {
      const [row] = await callProcedure('sp_user_invitations_accept', {
        p_token_hash: hashToken(req.params.token), p_password_hash: await hashPassword(password),
      })
      res.json({ data: { email: row.email } })
    } catch (err) {
      sendError(res, err)
    }
  })
}
