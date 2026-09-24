import { createHash } from 'node:crypto'

const WINDOW_SECONDS = 15 * 60
const MAX_SIGNUPS = 5
const MAX_SIGNUP_EMAILS = 1
const MAX_LOGIN_FAILURES = 8
const API_WINDOW_SECONDS = 60
const API_DEFAULT_LIMIT = 120
const OTP_REQUEST_IP_LIMIT = 5
const OTP_REQUEST_EMAIL_LIMIT = 1
const OTP_VERIFY_IP_LIMIT = 12
const OTP_VERIFY_EMAIL_LIMIT = 8
const DISPOSABLE_DOMAINS = new Set(['mailinator.com','guerrillamail.com','10minutemail.com','tempmail.com','temp-mail.org','yopmail.com','sharklasers.com','guerrillamail.net','getnada.com','throwawaymail.com','dispostable.com'])

function hash(secret, value) {
  return createHash('sha256').update(`${secret}:${value}`).digest('hex')
}

function clientIp(req) {
  return String(req.headers?.['x-forwarded-for'] || req.headers?.['x-real-ip'] || 'unknown').split(',')[0].trim()
}

function bucketId(req, action, identity = null) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SHAFX_ADMIN_KEY || 'shafx'
  const subject = identity === null ? `${action}:${clientIp(req)}:${req.headers?.['user-agent'] || 'unknown'}` : `${action}:${identity}`
  return hash(secret, subject)
}

async function consumeRateLimit(req, action, limit, reset = false, identity = null, windowSeconds = WINDOW_SECONDS) {
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
        p_bucket_id: bucketId(req, action, identity),
        p_limit: limit,
        p_window_seconds: windowSeconds,
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

  const emailRate = await consumeRateLimit(req, 'signup-email', MAX_SIGNUP_EMAILS, false, email)
  if (emailRate.unavailable) return limiterUnavailable()
  if (emailRate.blocked) return {
    allowed: false,
    status: 429,
    error: 'A verification email was recently requested for this address. Please wait before trying again.',
    retryAfterSeconds: emailRate.retryAfterSeconds,
  }

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


function sessionIdentity(req) {
  const token = String(cookie(req, 'shafx_session') || '').trim()
  if (!token) return null
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SHAFX_ADMIN_KEY || 'shafx'
  return hash(secret, `session:${token}`)
}

export async function apiRequestGuard(req, action, limit = API_DEFAULT_LIMIT) {
  const identity = sessionIdentity(req)
  const bucket = identity
    ? `api-user:${identity}:${clientIp(req)}`
    : `api-ip:${clientIp(req)}:${req.headers?.['user-agent'] || 'unknown'}`

  const rate = await consumeRateLimit(req, action, limit, false, bucket, API_WINDOW_SECONDS)
  if (rate.unavailable) {
    return {
      allowed: false,
      status: 503,
      error: 'Traffic protection is temporarily unavailable. Please try again later.',
      retryAfterSeconds: API_WINDOW_SECONDS,
    }
  }

  if (rate.blocked) {
    return {
      allowed: false,
      status: 429,
      error: 'Too many requests. Please slow down and try again.',
      retryAfterSeconds: rate.retryAfterSeconds,
    }
  }

  return { allowed: true, remaining: Math.max(0, limit - rate.count), retryAfterSeconds: 0 }
}

export async function otpRequestGuard(req, email) {
  const normalized = String(email || '').trim().toLowerCase()
  const ipRate = await consumeRateLimit(req, 'otp-request-ip', OTP_REQUEST_IP_LIMIT)
  if (ipRate.unavailable) return limiterUnavailable()
  if (ipRate.blocked) return { allowed: false, status: 429, error: 'Too many verification-code requests. Please try again later.', retryAfterSeconds: ipRate.retryAfterSeconds }

  const emailRate = await consumeRateLimit(req, 'otp-request-email', OTP_REQUEST_EMAIL_LIMIT, false, normalized, 60)
  if (emailRate.unavailable) return limiterUnavailable()
  if (emailRate.blocked) return { allowed: false, status: 429, error: 'A verification code was recently sent to this email. Please wait before requesting another.', retryAfterSeconds: emailRate.retryAfterSeconds }

  return { allowed: true }
}

export async function otpVerifyGuard(req, email) {
  const normalized = String(email || '').trim().toLowerCase()
  const ipRate = await consumeRateLimit(req, 'otp-verify-ip', OTP_VERIFY_IP_LIMIT)
  if (ipRate.unavailable) return limiterUnavailable()
  if (ipRate.blocked) return { allowed: false, status: 429, error: 'Too many code attempts. Please wait before trying again.', retryAfterSeconds: ipRate.retryAfterSeconds }

  const emailRate = await consumeRateLimit(req, 'otp-verify-email', OTP_VERIFY_EMAIL_LIMIT, false, normalized)
  if (emailRate.unavailable) return limiterUnavailable()
  if (emailRate.blocked) return { allowed: false, status: 429, error: 'Too many code attempts for this email. Please request a new code later.', retryAfterSeconds: emailRate.retryAfterSeconds }

  return { allowed: true }
}
