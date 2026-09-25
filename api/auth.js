import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { apiRequestGuard } from '../server/authSecurity.js'
import { clearLoginFailures, loginGuard, otpRequestGuard, otpVerifyGuard, recordLoginFailure, securityFingerprint, signupGuard } from '../server/authSecurity.js'

const json = (res, status, body) => res.status(status).json(body)
const configured = () => Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY)
const supabase = (path, options = {}, service = false) => fetch(`${process.env.SUPABASE_URL}/auth/v1${path}`, {
  ...options,
  headers: { apikey: service ? process.env.SUPABASE_SERVICE_ROLE_KEY : process.env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json', ...(options.headers || {}) },
})
const rest = (path, options = {}) => fetch(`${process.env.SUPABASE_URL}/rest/v1${path}`, {
  ...options,
  headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json', ...(options.headers || {}) },
})
const sessionCookie = 'shafx_session'
const refreshCookie = 'shafx_refresh'
const setSessionCookies = (res, session) => res.setHeader('Set-Cookie', [`${sessionCookie}=${encodeURIComponent(session.access_token)}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=3600`, `${refreshCookie}=${encodeURIComponent(session.refresh_token)}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=2592000`])
const clearSessionCookie = (res) => res.setHeader('Set-Cookie', [`${sessionCookie}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`, `${refreshCookie}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`])
const loginChallengeCookie = 'shafx_login_challenge'
const challengeSecret = () => process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SHAFX_ADMIN_KEY || 'shafx-challenge'
const encodeChallenge = (payload) => {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = createHmac('sha256', challengeSecret()).update(body).digest('base64url')
  return body + '.' + signature
}
const decodeChallenge = (value) => {
  try {
    const parts = String(value || '').split('.')
    if (parts.length !== 2) return null
    const expected = createHmac('sha256', challengeSecret()).update(parts[0]).digest('base64url')
    const a = Buffer.from(parts[1])
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
    const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'))
    if (!payload?.email || !payload?.userId || !payload?.purpose || !payload?.expiresAt || Number(payload.expiresAt) <= Date.now()) return null
    return payload
  } catch { return null }
}
const setLoginChallenge = (res, payload) => {
  const value = encodeChallenge({ ...payload, nonce: randomBytes(12).toString('hex'), expiresAt: Date.now() + 10 * 60 * 1000 })
  res.setHeader('Set-Cookie', [
    sessionCookie + '=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0',
    refreshCookie + '=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0',
    loginChallengeCookie + '=' + encodeURIComponent(value) + '; Path=/api/auth; HttpOnly; SameSite=Lax; Secure; Max-Age=600',
  ])
}
const clearLoginChallenge = (res) => res.setHeader('Set-Cookie', [loginChallengeCookie + '=; Path=/api/auth; HttpOnly; SameSite=Lax; Secure; Max-Age=0'])

const cookie = (req, name) => (req.headers.cookie || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) || null
const authError = (data, fallback) => { const code = String(data?.code || '').toLowerCase(); const message = String(data?.msg || data?.message || data?.error_description || data?.error || '').trim(); if (code === 'email_exists' || code === 'user_already_exists') return 'A SHAFX account with that email already exists. Sign in instead.'; if (code === 'email_not_confirmed') return 'Please confirm your email address before signing in.'; if (code === 'weak_password') return 'That password is too weak. Use a stronger password.'; if (code === 'email_provider_disabled') return 'Email sign-up is temporarily unavailable. Please try again later.'; if (code === 'over_email_send_rate_limit') return 'No new verification code was sent because SHAFX email delivery has reached its sending limit. The verification step was not started.'; if (code === 'validation_failed') return message || 'Please check the account details and try again.'; return message || fallback }
async function refreshSession(req, res) { const refresh = cookie(req, refreshCookie); if (!refresh) return null; const response = await supabase('/token?grant_type=refresh_token', { method: 'POST', body: JSON.stringify({ refresh_token: decodeURIComponent(refresh) }) }); if (!response.ok) return null; const session = await response.json(); if (!session.access_token || !session.refresh_token || !session.user) return null; setSessionCookies(res, session); return { token: session.access_token, user: session.user } }
async function currentUser(req, res) { const token = cookie(req, sessionCookie); if (token) { const decoded = decodeURIComponent(token); const response = await supabase('/user', { headers: { Authorization: `Bearer ${decoded}` } }); if (response.ok) return { token: decoded, user: await response.json() } } return (await refreshSession(req, res)) || { token: null, user: null } }
async function profileFor(userId) { const response = await rest(`/shafx_profiles?id=eq.${encodeURIComponent(userId)}&select=id,display_name,status,simulator_account_id,created_at,risk_score,security_state,last_login_at,failed_login_count`); if (!response.ok) throw new Error('SHAFX profile database is not ready. Run supabase/schema.sql once in the Supabase SQL Editor.'); const rows = await response.json(); return rows[0] || null }
async function botEntitlementFor(userId) { const response = await rest(`/shafx_bot_entitlements?user_id=eq.${encodeURIComponent(userId)}&select=plan,subscription_status,subscription_ends_at`); if (!response.ok) throw new Error('SHAFX bot entitlement service is not ready.'); const row = (await response.json())[0]; const requested = row?.plan === 'PRO' || row?.plan === 'REGULAR' ? row.plan : 'FREE'; if (requested === 'FREE') return 'FREE'; const status = String(row?.subscription_status || '').toLowerCase(); const endsAt = row?.subscription_ends_at ? new Date(row.subscription_ends_at).getTime() : null; return (status === 'active' || status === 'trialing') && (endsAt === null || Number.isFinite(endsAt) && endsAt > Date.now()) ? requested : 'FREE' }
const publicUser = async (user) => {
  const [profile, botPlan] = await Promise.all([profileFor(user.id), botEntitlementFor(user.id)])
  if (!profile) return null
  return { id: user.id, email: user.email, displayName: profile.display_name, status: profile.status, simulatorAccountId: profile.simulator_account_id, createdAt: profile.created_at, botPlan }
}
async function securityEvent(event) { try { await rest('/shafx_security_events', { method: 'POST', body: JSON.stringify(event) }) } catch {} }
async function updateSecurityProfile(userId, patch) { try { await rest(`/shafx_profiles?id=eq.${encodeURIComponent(userId)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(patch) }) } catch {} }
export default async function handler(req, res) {
  const action = new URL(req.url || '/', 'http://shafx.local').searchParams.get('action') || ''
  const guardedBySpecificFlow = new Set(['me', 'logout', 'login', 'signup', 'request-login-code', 'verify-login-code', 'verify-email-code'])
  if (!guardedBySpecificFlow.has(action)) {
    const guard = await apiRequestGuard(req, 'api:auth', 120)
    if (!guard.allowed) return res.status(guard.status).json({ ok: false, error: guard.error, retryAfterSeconds: guard.retryAfterSeconds })
  }
  res.setHeader('Cache-Control', 'no-store')
  if (!configured()) return json(res, 503, { ok: false, error: 'SHAFX identity is not configured on this deployment.' })
  try {
    if (action === 'logout') { const { user } = await currentUser(req, res); if (user) await securityEvent({ user_id: user.id, event_type: 'logout', decision: 'allow', risk_score: 0, fingerprint: securityFingerprint(req), metadata: {} }); res.setHeader('Set-Cookie', [sessionCookie + '=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0', refreshCookie + '=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0', loginChallengeCookie + '=; Path=/api/auth; HttpOnly; SameSite=Lax; Secure; Max-Age=0']); return json(res, 200, { ok: true }) }
    if (action === 'me') { const { user } = await currentUser(req, res); if (!user) return json(res, 401, { ok: false, error: 'Not signed in' }); const result = await publicUser(user); if (!result) return json(res, 403, { ok: false, error: 'SHAFX account profile is missing.' }); if (result.status !== 'active') { clearSessionCookie(res); return json(res, 403, { ok: false, error: result.status === 'banned' ? 'This SHAFX account has been banned.' : 'This SHAFX account is suspended.', status: result.status }) } return json(res, 200, { ok: true, user: result }) }
    if (action === 'request-login-code') {
      if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Method not allowed' })
      const body = typeof req.body === 'object' && req.body ? req.body : {}
      const challenge = decodeChallenge(cookie(req, loginChallengeCookie))
      if (!challenge) return json(res, 409, { ok: false, error: 'Your login verification step has expired. Enter your email and password again.' })
      const email = String(body.email || '').trim().toLowerCase()
      if (!email || email !== challenge.email) return json(res, 400, { ok: false, error: 'The verification email does not match the login request.' })
      const guard = await otpRequestGuard(req, email)
      if (!guard.allowed) return json(res, guard.status || 429, { ok: false, error: guard.error, retryAfterSeconds: guard.retryAfterSeconds })
      const response = await supabase('/otp', { method: 'POST', body: JSON.stringify({ email, create_user: false }) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) return json(res, response.status, { ok: false, error: authError(data, 'Unable to send the verification code.') })
      return json(res, 200, { ok: true, message: challenge.purpose === 'signup' ? 'A verification code has been sent to your email. Check Gmail and enter it below.' : 'A verification code has been sent to your email. Check Gmail and enter it below.', retryAfterSeconds: 0 })
    }
    if (action === 'verify-email-code' || action === 'verify-login-code') {
      if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Method not allowed' })
      const body = typeof req.body === 'object' && req.body ? req.body : {}
      const email = String(body.email || '').trim().toLowerCase()
      const token = String(body.code || '').trim()
      if (!/^\S+@\S+\.\S+$/.test(email)) return json(res, 400, { ok: false, error: 'Enter a valid email address.' })
      if (!/^\d{6}$/.test(token)) return json(res, 400, { ok: false, error: 'Enter the 6-digit verification code from your email.' })
      const challenge = decodeChallenge(cookie(req, loginChallengeCookie))
      if (!challenge || challenge.email !== email || challenge.purpose !== (action === 'verify-login-code' ? 'login' : 'signup')) return json(res, 409, { ok: false, error: 'This verification step has expired. Start again from the login or account-creation screen.' })
      const guard = await otpVerifyGuard(req, email)
      if (!guard.allowed) return json(res, guard.status || 429, { ok: false, error: guard.error, retryAfterSeconds: guard.retryAfterSeconds })
      const response = await supabase('/verify', { method: 'POST', body: JSON.stringify({ email, token, type: 'email' }) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.user) {
        await securityEvent({ event_type: 'otp_verification_failed', decision: 'deny', risk_score: 35, fingerprint: securityFingerprint(req), metadata: { purpose: challenge.purpose } })
        return json(res, 401, { ok: false, error: authError(data, 'That verification code is invalid or has expired. Request a new code and try again.') })
      }
      const result = await publicUser(data.user)
      if (!result || result.status !== 'active') return json(res, 403, { ok: false, error: 'This SHAFX account is not active.' })
      if (!data.access_token || !data.refresh_token) return json(res, 500, { ok: false, error: 'Verification succeeded but SHAFX did not receive a session. Please try again.' })
      setSessionCookies(res, data)
      await updateSecurityProfile(data.user.id, { last_login_at: new Date().toISOString(), failed_login_count: 0 })
      await clearLoginFailures(req)
      await securityEvent({ user_id: data.user.id, event_type: action === 'verify-login-code' ? 'login_code_verified' : 'signup_email_verified', decision: 'allow', risk_score: 0, fingerprint: securityFingerprint(req), metadata: {} })
      res.setHeader('Set-Cookie', [
        sessionCookie + '=' + encodeURIComponent(data.access_token) + '; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=3600',
        refreshCookie + '=' + encodeURIComponent(data.refresh_token) + '; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=2592000',
        loginChallengeCookie + '=; Path=/api/auth; HttpOnly; SameSite=Lax; Secure; Max-Age=0',
      ])
      return json(res, 200, { ok: true, user: result })
    }
    if (action === 'reset-request') { if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Method not allowed' }); const body = typeof req.body === 'object' && req.body ? req.body : {}; const email = String(body.email || '').trim().toLowerCase(); if (!/^\S+@\S+\.\S+$/.test(email)) return json(res, 400, { ok: false, error: 'Enter a valid email address.' }); const redirectTo = `${process.env.SHAfx_SITE_URL || 'https://shafx.vercel.app'}/?auth=reset`; const response = await supabase('/recover', { method: 'POST', body: JSON.stringify({ email, redirect_to: redirectTo }) }); const data = await response.json().catch(() => ({})); if (!response.ok) return json(res, response.status, { ok: false, error: authError(data, 'Unable to send the password reset email.') }); await securityEvent({ event_type: 'password_reset_requested', decision: 'allow', risk_score: 0, fingerprint: securityFingerprint(req), metadata: {} }); return json(res, 200, { ok: true, message: 'If that email belongs to a SHAFX account, a password reset email has been sent.' }) }
    if (action === 'update-password') { if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Method not allowed' }); const body = typeof req.body === 'object' && req.body ? req.body : {}; const token = String(body.token || ''); const password = String(body.password || ''); if (!token) return json(res, 401, { ok: false, error: 'Password reset session is missing or expired. Request a new reset email.' }); if (password.length < 10) return json(res, 400, { ok: false, error: 'Password must be at least 10 characters.' }); const response = await supabase('/user', { method: 'PUT', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ password }) }); const data = await response.json().catch(() => ({})); if (!response.ok) return json(res, response.status, { ok: false, error: authError(data, 'Unable to change your password.') }); await securityEvent({ user_id: data.id, event_type: 'password_reset_completed', decision: 'allow', risk_score: 0, fingerprint: securityFingerprint(req), metadata: {} }); return json(res, 200, { ok: true, message: 'Password changed. You can now sign in to SHAFX.' }) }
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Method not allowed' })
    const body = typeof req.body === 'object' && req.body ? req.body : {}
    if (action === 'signup') { const email = String(body.email || '').trim().toLowerCase(); const password = String(body.password || ''); const displayName = String(body.displayName || '').trim().slice(0, 60); const guard = await signupGuard(req, body); if (!guard.allowed) { await securityEvent({ event_type: 'signup_blocked', decision: 'block', risk_score: guard.risk || 100, fingerprint: guard.fingerprint || securityFingerprint(req), metadata: { reason: guard.reason || 'automatic_guard' } }); return json(res, guard.status || 400, { ok: false, error: guard.error, ...(guard.retryAfterSeconds ? { retryAfterSeconds: guard.retryAfterSeconds } : {}) }) } if (!/^\S+@\S+\.\S+$/.test(email)) return json(res, 400, { ok: false, error: 'Enter a valid email address.' }); if (password.length < 10) return json(res, 400, { ok: false, error: 'Password must be at least 10 characters.' }); const response = await supabase('/signup', { method: 'POST', body: JSON.stringify({ email, password, data: { display_name: displayName || email.split('@')[0] } }) }); const data = await response.json().catch(() => ({})); if (!response.ok) return json(res, response.status, { ok: false, error: authError(data, 'Unable to create SHAFX account.') }); if (!data.user) return json(res, 500, { ok: false, error: 'SHAFX account service returned an incomplete signup response. Please try again.' }); if (Array.isArray(data.user.identities) && data.user.identities.length === 0) return json(res, 409, { ok: false, error: 'A SHAFX account with that email already exists. Sign in instead.' }); await securityEvent({ user_id: data.user.id, event_type: 'signup', decision: 'allow', risk_score: guard.risk || 0, fingerprint: guard.fingerprint, metadata: { security_state: guard.reason === 'elevated_sign_up_risk' ? 'elevated' : 'normal' } }); await updateSecurityProfile(data.user.id, { risk_score: guard.risk || 0, security_state: guard.reason === 'elevated_sign_up_risk' ? 'elevated' : 'normal' }); if (!data.session) { setLoginChallenge(res, { userId: data.user.id, email, purpose: 'signup' }); return json(res, 202, { ok: true, needsEmailConfirmation: true, message: 'Account created. Check your email for the verification code.' }) } const result = await publicUser(data.user); if (!result || result.status !== 'active') return json(res, 403, { ok: false, error: 'This SHAFX account is not active.' }); setSessionCookies(res, data.session); return json(res, 201, { ok: true, user: result }) }
    if (action === 'login') {
      const email = String(body.email || '').trim().toLowerCase()
      const password = String(body.password || '')
      const guard = await loginGuard(req)
      if (!guard.allowed) { await securityEvent({ event_type: 'login_rate_limited', decision: 'block', risk_score: 100, fingerprint: securityFingerprint(req), metadata: { reason: 'automatic_rate_limit' } }); return json(res, guard.status, { ok: false, error: guard.error, retryAfterSeconds: guard.retryAfterSeconds }) }
      if (!/^\S+@\S+\.\S+$/.test(email) || !password) return json(res, 400, { ok: false, error: 'Enter your email and password.' })
      const response = await supabase('/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email, password }) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.access_token || !data.user) {
        await recordLoginFailure(req)
        await securityEvent({ event_type: 'login_failed', decision: 'deny', risk_score: 30, fingerprint: securityFingerprint(req), metadata: { reason: String(data?.code || data?.error || 'invalid_credentials') } })
        if (String(data?.code || '').toLowerCase() === 'email_not_confirmed') return json(res, 401, { ok: false, error: 'Please verify your email address before signing in.' })
        return json(res, 401, { ok: false, error: 'Invalid email or password.' })
      }
      const result = await publicUser(data.user)
      if (!result) return json(res, 403, { ok: false, error: 'SHAFX account profile is not ready.' })
      if (result.status !== 'active') return json(res, 403, { ok: false, error: result.status === 'banned' ? 'This SHAFX account has been banned.' : 'This SHAFX account is suspended.', status: result.status })
      setLoginChallenge(res, { userId: data.user.id, email, purpose: 'login' })
      const otpResult = await (async () => {
        const guard = await otpRequestGuard(req, email)
        if (!guard.allowed) return { sent: false, retryAfterSeconds: guard.retryAfterSeconds || 60, message: guard.error }
        const response = await supabase('/otp', { method: 'POST', body: JSON.stringify({ email, create_user: false }) })
        const otpData = await response.json().catch(() => ({}))
        if (!response.ok) return { sent: false, retryAfterSeconds: 0, message: authError(otpData, 'Password verified, but SHAFX could not send the verification code right now.') }
        return { sent: true, retryAfterSeconds: 0, message: 'Password verified. We sent a 6-digit verification code to your email. Enter it below.' }
      })()
      await Promise.all([
        clearLoginFailures(req),
        securityEvent({ user_id: data.user.id, event_type: 'login_password_verified', decision: 'allow', risk_score: 0, fingerprint: securityFingerprint(req), metadata: { code_sent: otpResult.sent } }),
      ])
      if (!otpResult.sent) return json(res, 429, { ok: false, error: otpResult.message, retryAfterSeconds: otpResult.retryAfterSeconds || 0, codeSent: false, passwordVerified: true })
      return json(res, 200, {
        ok: true,
        requiresVerification: true,
        userId: data.user.id,
        email,
        codeSent: otpResult.sent,
        resendAfterSeconds: otpResult.retryAfterSeconds,
        message: otpResult.message,
      })
    }    return json(res, 400, { ok: false, error: 'Unknown action.' })
  } catch (error) { return json(res, 500, { ok: false, error: error instanceof Error ? error.message : 'SHAFX identity service failed.' }) }
}
