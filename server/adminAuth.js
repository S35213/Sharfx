import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const COOKIE_NAME = 'shafx_owner_session'
const SESSION_SECONDS = 60 * 60 * 12

function secret() {
  return process.env.SHAFX_ADMIN_KEY || ''
}

function sign(payload) {
  return createHmac('sha256', secret()).update(payload).digest('base64url')
}

export function isAdminConfigured() {
  return Boolean(secret())
}

export function createSession() {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_SECONDS
  const payload = `${expiresAt}.${randomBytes(18).toString('base64url')}`
  return `${payload}.${sign(payload)}`
}

export function setSessionCookie(res, value) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${value}; Path=/api/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_SECONDS}`)
}

export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/api/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=0`)
}

function cookieValue(req) {
  const cookies = req.headers?.cookie || ''
  const match = cookies.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`))
  return match ? decodeURIComponent(match[1]) : ''
}

export function isValidSession(req) {
  if (!isAdminConfigured()) return false
  const value = cookieValue(req)
  const parts = value.split('.')
  if (parts.length !== 3) return false
  const [expiresAt, nonce, providedSignature] = parts
  if (!/^\d+$/.test(expiresAt) || Number(expiresAt) < Math.floor(Date.now() / 1000) || !nonce || !providedSignature) return false
  const expectedSignature = sign(`${expiresAt}.${nonce}`)
  const provided = Buffer.from(providedSignature)
  const expected = Buffer.from(expectedSignature)
  return provided.length === expected.length && timingSafeEqual(provided, expected)
}

export function keyMatches(value) {
  const configured = secret()
  if (!configured || typeof value !== 'string') return false
  const supplied = Buffer.from(value)
  const expected = Buffer.from(configured)
  return supplied.length === expected.length && timingSafeEqual(supplied, expected)
}
