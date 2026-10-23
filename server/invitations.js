import crypto from 'node:crypto'
import { callProcedure } from './db.js'
import { hashPassword } from './auth.js'
import { authenticate } from './middleware/authenticate.js'
import { mapStoredProcedureError } from './errors.js'

// Usuarios por invitacion: se crean sin contrasena y la persona crea la
// suya con un enlace personal de un solo uso (/invitacion/<token>). No hay
// servicio de correo: el admin copia el enlace y lo comparte. En la base
// solo se guarda el sha256 del token.

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
  return { invitationUrl: `${req.protocol}://${req.get('host')}/invitacion/${token}`, expiresAt: result?.expires_at ?? null }
}

// Reglas minimas de contrasena (las mismas que muestra la pagina).
export function passwordProblem(password) {
  if (typeof password !== 'string' || password.length < 8) return 'password_too_short'
  if (password.length > 128) return 'password_too_long'
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) return 'password_needs_letters_and_numbers'
  return null
}

export function registerInvitationRoutes(app) {
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
