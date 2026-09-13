import { createHash } from 'node:crypto'

const WINDOW_MS = 15 * 60 * 1000
const MAX_SIGNUPS = 5
const MAX_LOGIN_FAILURES = 8
const attempts = new Map()
const DISPOSABLE_DOMAINS = new Set(['mailinator.com','guerrillamail.com','10minutemail.com','tempmail.com','temp-mail.org','yopmail.com','sharklasers.com','guerrillamail.net','getnada.com','throwawaymail.com','dispostable.com'])

function hash(secret, value) {
  return createHash('sha256').update(`${secret}:${value}`).digest('hex')
}

function clientIp(req) {
  return String(req.headers?.['x-forwarded-for'] || req.headers?.['x-real-ip'] || 'unknown').split(',')[0].trim()
}

function bucketId(req, action) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SHAFX_ADMIN_KEY || 'shafx'
  return hash(secret, `${action}:${clientIp(req)}:${req.headers?.['user-agent'] || 'unknown'}`)
}

function hit(bucket, limit) {
  const now = Date.now()
  const current = attempts.get(bucket)
  const next = !current || now - current.startedAt > WINDOW_MS
    ? { startedAt: now, count: 1 }
    : { ...current, count: current.count + 1 }
  attempts.set(bucket, next)
  if (attempts.size > 5000) {
    for (const [id, item] of attempts) if (now - item.startedAt > WINDOW_MS) attempts.delete(id)
  }
  return {
    blocked: next.count > limit,
    count: next.count,
    retryAfterSeconds: Math.max(1, Math.ceil((next.startedAt + WINDOW_MS - now) / 1000)),
  }
}

export function signupGuard(req, body) {
  const email = String(body?.email || '').trim().toLowerCase()
  const password = String(body?.password || '')
  const honeypot = String(body?.website || '').trim()
  const domain = email.split('@')[1] || ''
  const rate = hit(bucketId(req, 'signup'), MAX_SIGNUPS)

  if (honeypot) return { allowed: false, status: 400, error: 'Unable to create this account.' }
  if (rate.blocked) return { allowed: false, status: 429, error: 'Too many account attempts. Please try again later.', retryAfterSeconds: rate.retryAfterSeconds }
  if (DISPOSABLE_DOMAINS.has(domain)) return { allowed: false, status: 400, error: 'Please use a permanent email address.' }

  let risk = 0
  if (!req.headers?.['user-agent']) risk += 10
  if (email.length > 160) risk += 20
  if (password.length < 10) risk += 10
  if (!/[a-z]/.test(password)) risk += 8
  if (!/[A-Z]/.test(password)) risk += 8
  if (!/\d/.test(password)) risk += 8
  if (!/[^A-Za-z0-9]/.test(password)) risk += 8
  const localPart = email.split('@')[0] || ''
  if (localPart && password.toLowerCase().includes(localPart.toLowerCase())) risk += 20

  return {
    allowed: risk < 70,
    risk,
    fingerprint: securityFingerprint(req),
    reason: risk >= 50 ? 'elevated_sign_up_risk' : 'normal',
  }
}

export function loginGuard(req) {
  const rate = hit(bucketId(req, 'login'), MAX_LOGIN_FAILURES)
  return rate.blocked
    ? { allowed: false, status: 429, error: 'Too many login attempts. Please try again later.', retryAfterSeconds: rate.retryAfterSeconds }
    : { allowed: true }
}

export function recordLoginFailure(req) {
  return hit(bucketId(req, 'login-failure'), MAX_LOGIN_FAILURES)
}

export function clearLoginFailures(req) {
  attempts.delete(bucketId(req, 'login-failure'))
}

export function securityFingerprint(req) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SHAFX_ADMIN_KEY || 'shafx'
  return hash(secret, `${clientIp(req)}:${req.headers?.['user-agent'] || 'unknown'}`)
}
