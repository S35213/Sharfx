import { clearLoginFailures, loginGuard, recordLoginFailure, securityFingerprint, signupGuard } from './authSecurity.js'

const json = (res, status, body) => res.status(status).json(body)
const configured = () => Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY)
const supabase = (path, options = {}, service = false) => fetch(`${process.env.SUPABASE_URL}/auth/v1${path}`, {
  ...options,
  headers: {
    apikey: service ? process.env.SUPABASE_SERVICE_ROLE_KEY : process.env.SUPABASE_ANON_KEY,
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  },
})
const rest = (path, options = {}) => fetch(`${process.env.SUPABASE_URL}/rest/v1${path}`, {
  ...options,
  headers: {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  },
})
const setSessionCookie = (res, token) => res.setHeader('Set-Cookie', `shafx_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=3600`)
const clearSessionCookie = (res) => res.setHeader('Set-Cookie', 'shafx_session=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0')
const cookie = (req, name) => (req.headers.cookie || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) || null

async function currentUser(req) {
  const token = cookie(req, 'shafx_session')
  if (!token) return { token: null, user: null }
  const decoded = decodeURIComponent(token)
  const response = await supabase('/user', { headers: { Authorization: `Bearer ${decoded}` } })
  if (!response.ok) return { token: null, user: null }
  return { token: decoded, user: await response.json() }
}

async function profileFor(userId) {
  const response = await rest(`/shafx_profiles?id=eq.${encodeURIComponent(userId)}&select=id,display_name,status,simulator_account_id,created_at,risk_score,security_state,last_login_at,failed_login_count`)
  if (!response.ok) throw new Error('SHAFX profile database is not ready. Run supabase/schema.sql once in the Supabase SQL Editor.')
  const rows = await response.json()
  return rows[0] || null
}

async function securityEvent(event) {
  try {
    await rest('/shafx_security_events', { method: 'POST', body: JSON.stringify(event) })
  } catch {
    // Security telemetry must never make a legitimate login fail.
  }
}

async function updateSecurityProfile(userId, patch) {
  try {
    await rest(`/shafx_profiles?id=eq.${encodeURIComponent(userId)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(patch) })
  } catch {
    // The identity path remains usable if the optional security columns are not migrated yet.
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (!configured()) return json(res, 503, { ok: false, error: 'SHAFX identity is not configured on this deployment.' })
  const action = typeof req.query.action === 'string' ? req.query.action : ''

  try {
    if (action === 'logout') {
      const { user } = await currentUser(req)
      if (user) await securityEvent({ user_id: user.id, event_type: 'logout', decision: 'allow', risk_score: 0, fingerprint: securityFingerprint(req), metadata: {} })
      clearSessionCookie(res)
      return json(res, 200, { ok: true })
    }

    if (action === 'me') {
      const { user } = await currentUser(req)
      if (!user) return json(res, 401, { ok: false, error: 'Not signed in' })
      const profile = await profileFor(user.id)
      if (!profile) return json(res, 403, { ok: false, error: 'SHAFX account profile is missing.' })
      if (profile.status !== 'active') {
        clearSessionCookie(res)
        return json(res, 403, { ok: false, error: profile.status === 'banned' ? 'This SHAFX account has been banned.' : 'This SHAFX account is suspended.', status: profile.status })
      }
      return json(res, 200, { ok: true, user: { id: user.id, email: user.email, displayName: profile.display_name, status: profile.status, simulatorAccountId: profile.simulator_account_id, createdAt: profile.created_at } })
    }

    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Method not allowed' })
    const body = typeof req.body === 'object' && req.body ? req.body : {}

    if (action === 'signup') {
      const email = String(body.email || '').trim().toLowerCase()
      const password = String(body.password || '')
      const displayName = String(body.displayName || '').trim().slice(0, 60)
      const guard = signupGuard(req, body)
      if (!guard.allowed) {
        await securityEvent({ event_type: 'signup_blocked', decision: 'block', risk_score: guard.risk || 100, fingerprint: guard.fingerprint || securityFingerprint(req), metadata: { reason: guard.reason || 'automatic_guard' } })
        return json(res, guard.status || 400, { ok: false, error: guard.error, ...(guard.retryAfterSeconds ? { retryAfterSeconds: guard.retryAfterSeconds } : {}) })
      }
      if (!/^\S+@\S+\.\S+$/.test(email)) return json(res, 400, { ok: false, error: 'Enter a valid email address.' })
      if (password.length < 10) return json(res, 400, { ok: false, error: 'Password must be at least 10 characters.' })

      const response = await supabase('/signup', { method: 'POST', body: JSON.stringify({ email, password, data: { display_name: displayName || email.split('@')[0] } }) })
      const data = await response.json()
      if (!response.ok) return json(res, response.status, { ok: false, error: data.msg || data.message || 'Unable to create SHAFX account.' })
      if (!data.user) return json(res, 400, { ok: false, error: 'Unable to create SHAFX account.' })

      await securityEvent({ user_id: data.user.id, event_type: 'signup', decision: 'allow', risk_score: guard.risk || 0, fingerprint: guard.fingerprint, metadata: { security_state: guard.reason === 'elevated_sign_up_risk' ? 'elevated' : 'normal' } })
      await updateSecurityProfile(data.user.id, { risk_score: guard.risk || 0, security_state: guard.reason === 'elevated_sign_up_risk' ? 'elevated' : 'normal' })

      if (!data.session) return json(res, 202, { ok: true, needsEmailConfirmation: true, message: 'Account created. Confirm your email, then sign in. No owner approval is required.' })
      const profile = await profileFor(data.user.id)
      if (!profile || profile.status !== 'active') return json(res, 403, { ok: false, error: 'This SHAFX account is not active.' })
      setSessionCookie(res, data.session.access_token)
      return json(res, 201, { ok: true, user: { id: data.user.id, email: data.user.email, displayName: profile.display_name, status: profile.status, simulatorAccountId: profile.simulator_account_id, createdAt: profile.created_at } })
    }

    if (action === 'login') {
      const email = String(body.email || '').trim().toLowerCase()
      const password = String(body.password || '')
      const guard = loginGuard(req)
      if (!guard.allowed) {
        await securityEvent({ event_type: 'login_rate_limited', decision: 'block', risk_score: 100, fingerprint: securityFingerprint(req), metadata: { reason: 'automatic_rate_limit' } })
        return json(res, guard.status, { ok: false, error: guard.error, retryAfterSeconds: guard.retryAfterSeconds })
      }
      const response = await supabase('/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email, password }) })
      const data = await response.json()
      if (!response.ok || !data.access_token || !data.user) {
        recordLoginFailure(req)
        await securityEvent({ event_type: 'login_failed', decision: 'deny', risk_score: 30, fingerprint: securityFingerprint(req), metadata: { reason: 'invalid_credentials' } })
        return json(res, 401, { ok: false, error: 'Invalid email or password.' })
      }

      const profile = await profileFor(data.user.id)
      if (!profile) return json(res, 403, { ok: false, error: 'SHAFX account profile is not ready.' })
      if (profile.status !== 'active') {
        await securityEvent({ user_id: data.user.id, event_type: 'login_blocked_account_status', decision: 'block', risk_score: profile.risk_score || 0, fingerprint: securityFingerprint(req), metadata: { status: profile.status } })
        return json(res, 403, { ok: false, error: profile.status === 'banned' ? 'This SHAFX account has been banned.' : 'This SHAFX account is suspended.', status: profile.status })
      }

      clearLoginFailures(req)
      await updateSecurityProfile(data.user.id, { last_login_at: new Date().toISOString(), failed_login_count: 0 })
      await securityEvent({ user_id: data.user.id, event_type: 'login_success', decision: 'allow', risk_score: profile.risk_score || 0, fingerprint: securityFingerprint(req), metadata: {} })
      setSessionCookie(res, data.access_token)
      return json(res, 200, { ok: true, user: { id: data.user.id, email: data.user.email, displayName: profile.display_name, status: profile.status, simulatorAccountId: profile.simulator_account_id, createdAt: profile.created_at } })
    }

    return json(res, 400, { ok: false, error: 'Unknown action.' })
  } catch (error) {
    return json(res, 500, { ok: false, error: error instanceof Error ? error.message : 'SHAFX identity service failed.' })
  }
}
