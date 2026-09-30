import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

const SALT_ROUNDS = 12

function getJwtSecret() {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET is not configured')
  return secret
}

export async function hashPassword(plainPassword) {
  return bcrypt.hash(plainPassword, SALT_ROUNDS)
}

export async function verifyPassword(plainPassword, passwordHash) {
  return bcrypt.compare(plainPassword, passwordHash)
}

export function signSessionToken({ userId, tenantId, roleCode, fullName }) {
  return jwt.sign(
    { sub: String(userId), tenantId, roleCode, fullName },
    getJwtSecret(),
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' },
  )
}

export function verifySessionToken(token) {
  return jwt.verify(token, getJwtSecret())
}

// Los archivos del material se cargan en un iframe/pestaña, que no puede
// mandar el header Authorization: el permiso viaja en la URL como un token
// de corta vida. Se firma con un secreto derivado para que un token de
// material nunca sirva como sesion (ni al reves).
function getMaterialSecret() {
  return crypto.createHmac('sha256', getJwtSecret()).update('component-material').digest()
}

export function signMaterialToken({ componentId, folder, withSolutions }) {
  return jwt.sign(
    { c: componentId, f: folder, s: Boolean(withSolutions) },
    getMaterialSecret(),
    { expiresIn: '6h' },
  )
}

export function verifyMaterialToken(token) {
  const claims = jwt.verify(token, getMaterialSecret())
  return { componentId: claims.c, folder: claims.f, withSolutions: claims.s === true }
}
