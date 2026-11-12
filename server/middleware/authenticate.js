import { verifySessionToken } from '../auth.js'

export function authenticate(req, res, next) {
  const header = req.headers.authorization || ''
  const [scheme, token] = header.split(' ')
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ message: 'Missing session token' })
  }
  try {
    const payload = verifySessionToken(token)
    req.user = {
      id: Number(payload.sub),
      tenantId: payload.tenantId ?? null,
      roleCode: payload.roleCode,
      fullName: payload.fullName,
      // Rol real cuando la sesion esta en modo alumno (si no, null).
      baseRoleCode: payload.baseRole ?? null,
      baseTenantId: payload.baseRole ? (payload.baseTenantId ?? null) : null,
    }
    next()
  } catch {
    res.status(401).json({ message: 'Invalid or expired session' })
  }
}
