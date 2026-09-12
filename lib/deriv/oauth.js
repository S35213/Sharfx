import { createHmac, createHash, randomBytes, createCipheriv, createDecipheriv, timingSafeEqual } from 'node:crypto'

const STATE_COOKIE = 'shafx_deriv_oauth_state'
const SESSION_COOKIE = 'shafx_deriv_session'
const AUTH_URL = 'https://auth.deriv.com/oauth2/auth'
const TOKEN_URL = 'https://auth.deriv.com/oauth2/token'

const base64Url = (value) => Buffer.from(value).toString('base64url')
const fromBase64Url = (value) => Buffer.from(value, 'base64url')

export const getOrigin = (req) => {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim()
  const host = String(req.headers.host || '')
  if (!host) throw new Error('Missing request host')
  return `${forwardedProto}://${host}`
}

export const getSecret = () => {
  const secret = process.env.SHAFX_DERIV_SESSION_SECRET
  if (!secret || secret.length < 32) throw new Error('SHAFX_DERIV_SESSION_SECRET must be at least 32 characters')
  return secret
}

const sign = (value) => createHmac('sha256', getSecret()).update(value).digest('base64url')

export const serializeStateCookie = (state, verifier) => {
  const payload = base64Url(JSON.stringify({ state, verifier, createdAt: Date.now() }))
  return `${payload}.${sign(payload)}`
}

export const parseStateCookie = (cookieValue) => {
  const [payload, signature] = cookieValue.split('.')
  if (!payload || !signature) throw new Error('Invalid OAuth state cookie')
  const expected = sign(payload)
  if (expected.length !== signature.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) throw new Error('Invalid OAuth state signature')
  const data = JSON.parse(fromBase64Url(payload).toString('utf8'))
  if (typeof data.state !== 'string' || typeof data.verifier !== 'string' || Date.now() - data.createdAt > 10 * 60 * 1000) throw new Error('Expired OAuth state')
  return data
}

export const parseCookies = (header) => Object.fromEntries(String(header || '').split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
  const index = part.indexOf('=')
  return index < 0 ? [part, ''] : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))]
}))

export const setCookie = (name, value, maxAge) => `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`
export const clearCookie = (name) => `${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`

export const createAuthorizationUrl = (origin, clientId, scope, state, challenge) => {
  const url = new URL(AUTH_URL)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', `${origin}/api/deriv/callback`)
  url.searchParams.set('scope', scope)
  url.searchParams.set('state', state)
  url.searchParams.set('code_challenge', challenge)
  url.searchParams.set('code_challenge_method', 'S256')
  return url.toString()
}

export const createPkce = () => {
  const verifier = randomBytes(64).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  const state = randomBytes(32).toString('base64url')
  return { verifier, challenge, state }
}

export const encryptSession = (value) => {
  const key = createHash('sha256').update(getSecret()).digest()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), encrypted].map(base64Url).join('.')
}

export const decryptSession = (value) => {
  const [ivValue, tagValue, encryptedValue] = value.split('.')
  if (!ivValue || !tagValue || !encryptedValue) throw new Error('Invalid Deriv session')
  const key = createHash('sha256').update(getSecret()).digest()
  const decipher = createDecipheriv('aes-256-gcm', fromBase64Url(ivValue), key)
  decipher.setAuthTag(fromBase64Url(tagValue))
  return JSON.parse(Buffer.concat([decipher.update(fromBase64Url(encryptedValue)), decipher.final()]).toString('utf8'))
}

export const exchangeCode = async (code, verifier, redirectUri, clientId) => {
  const body = new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId, code, code_verifier: verifier, redirect_uri: redirectUri })
  const clientSecret = process.env.DERIV_CLIENT_SECRET
  if (clientSecret) body.set('client_secret', clientSecret)
  const response = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body })
  const data = await response.json()
  if (!response.ok || typeof data.access_token !== 'string') throw new Error(typeof data.error_description === 'string' ? data.error_description : 'Deriv token exchange failed')
  return data
}

export { STATE_COOKIE, SESSION_COOKIE }
