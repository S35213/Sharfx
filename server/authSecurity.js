import { createHash } from 'node:crypto'

const WINDOW_SECONDS = 15 * 60
const MAX_SIGNUPS = 5
const MAX_LOGIN_FAILURES = 8
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

async function consumeRateLimit(req, action, limit, reset = false) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { unavailable: true, blocked: false, count: 0, retryAfterSeconds: WINDOW_SECONDS }
  }

  try {
    const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/consume_shafx_auth_rate_limit`, {
      method: 'POST',
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_bucket_id: bucketId(req, action),
        p_limit: limit,
        p_window_seconds: WINDOW_SECONDS,
        p_reset: reset,
      }),
    })
    if (!response.ok) return { unavailable: true, blocked: false, count: 0, retryAfterSeconds: WINDOW_SECONDS }
    const rows = await response.json().catch(() => [])
    const row = Array.isArray(rows) ? rows[0] : null
    if (!row) return { unavailable: true, blocked: false, count: 0, retryAfterSeconds: WINDOW_SECONDS }
    return {
      unavailable: false,
      blocked: Boolean(row.blocked),
      count: Number.isFinite(Number(row.attempt_count)) ? Number(row.attempt_count) : 0,
      retryAfterSeconds: Math.max(1, Number.isFinite(Number(row.retry_after_seconds)) ? Number(row.retry_after_seconds) : WINDOW_SECONDS),
    }
  } catch {
    return { unavailable: true, blocked: false, count: 0, retryAfterSeconds: WINDOW_SECONDS }
  }
}

const limiterUnavailable = () => ({
  allowed: false,
  status: 503,
  error: 'Authentication protection is temporarily unavailable. Please try again later.',
})

export async function signupGuard(req, body) {
  const email = String(body?.email || '').trim().toLowerCase()
  const password = String(body?.password || '')
  const honeypot = String(body?.website || '').trim()
  const domain = email.split('@')[1] || ''
  const rate = await consumeRateLimit(req, 'signup', MAX_SIGNUPS)

  if (rate.unavailable) return limiterUnavailable()
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

export async function loginGuard(req) {
  const rate = await consumeRateLimit(req, 'login', MAX_LOGIN_FAILURES)
  if (rate.unavailable) return limiterUnavailable()
  return rate.blocked
    ? { allowed: false, status: 429, error: 'Too many login attempts. Please try again later.', retryAfterSeconds: rate.retryAfterSeconds }
    : { allowed: true }
}

export function recordLoginFailure(req) {
  return consumeRateLimit(req, 'login-failure', MAX_LOGIN_FAILURES)
}

export function clearLoginFailures(req) {
  return consumeRateLimit(req, 'login-failure', MAX_LOGIN_FAILURES, true)
}

export function securityFingerprint(req) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SHAFX_ADMIN_KEY || 'shafx'
  return hash(secret, `${clientIp(req)}:${req.headers?.['user-agent'] || 'unknown'}`)
}
