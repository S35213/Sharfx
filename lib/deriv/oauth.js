import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { createAuthorizationUrl as createProviderAuthorizationUrl, createPkce as createProviderPkce, exchangeAuthorizationCode, parseSignedState, serializeSignedState } from '../provider/oauth.js'

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

export const serializeStateCookie = (state, verifier) => serializeSignedState({ state, verifier, secret: getSecret() })

export const parseStateCookie = (cookieValue) => parseSignedState(cookieValue, { secret: getSecret() })

export const parseCookies = (header) => Object.fromEntries(String(header || '').split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
  const index = part.indexOf('=')
  return index < 0 ? [part, ''] : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))]
}))

export const setCookie = (name, value, maxAge) => `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`
export const clearCookie = (name) => `${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`

export const createAuthorizationUrl = (origin, clientId, scope, state, challenge) => createProviderAuthorizationUrl({
  authorizationUrl: AUTH_URL,
  clientId,
  redirectUri: origin + '/api/deriv/callback',
  scope,
  state,
  challenge,
})

export const createPkce = createProviderPkce

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

export const exchangeCode = async (code, verifier, redirectUri, clientId) => exchangeAuthorizationCode({
  tokenUrl: TOKEN_URL,
  code,
  verifier,
  clientId,
  redirectUri,
})

export { STATE_COOKIE, SESSION_COOKIE }
