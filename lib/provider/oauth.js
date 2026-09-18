import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

const base64Url = (value) => Buffer.from(value).toString('base64url')
const fromBase64Url = (value) => Buffer.from(value, 'base64url')

export const createPkce = () => {
  const verifier = randomBytes(64).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  const state = randomBytes(32).toString('base64url')
  return { verifier, challenge, state }
}

export const serializeSignedState = ({ state, verifier, secret, createdAt = Date.now(), maxAgeMs = 10 * 60 * 1000 }) => {
  if (!secret || secret.length < 32) throw new Error('OAuth state secret must be at least 32 characters.')
  if (Date.now() - createdAt > maxAgeMs) throw new Error('OAuth state is expired.')
  const payload = base64Url(JSON.stringify({ state, verifier, createdAt }))
  const { createHmac } = await import('node:crypto')
  const signature = createHmac('sha256', secret).update(payload).digest('base64url')
  return payload + '.' + signature
}

export const parseSignedState = async (value, { secret, maxAgeMs = 10 * 60 * 1000 }) => {
  if (!secret || secret.length < 32) throw new Error('OAuth state secret must be at least 32 characters.')
  const [payload, signature] = String(value || '').split('.')
  if (!payload || !signature) throw new Error('Invalid OAuth state.')
  const { createHmac } = await import('node:crypto')
  const expected = createHmac('sha256', secret).update(payload).digest('base64url')
  if (expected.length !== signature.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) throw new Error('Invalid OAuth state signature.')
  const data = JSON.parse(fromBase64Url(payload).toString('utf8'))
  if (typeof data.state !== 'string' || typeof data.verifier !== 'string' || Date.now() - Number(data.createdAt) > maxAgeMs) throw new Error('Expired OAuth state.')
  return data
}

export const createAuthorizationUrl = ({ authorizationUrl, clientId, redirectUri, scope, state, challenge, extraParams = {} }) => {
  const url = new URL(authorizationUrl)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('state', state)
  url.searchParams.set('code_challenge', challenge)
  url.searchParams.set('code_challenge_method', 'S256')
  if (scope) url.searchParams.set('scope', scope)
  for (const [key, value] of Object.entries(extraParams)) url.searchParams.set(key, String(value))
  return url.toString()
}

export const exchangeAuthorizationCode = async ({ tokenUrl, code, verifier, clientId, clientSecret, redirectUri, extraFields = {} }) => {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    code,
    code_verifier: verifier,
    redirect_uri: redirectUri,
    ...extraFields,
  })
  if (clientSecret) body.set('client_secret', clientSecret)
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || typeof data.access_token !== 'string') {
    throw new Error(typeof data.error_description === 'string' ? data.error_description : 'OAuth token exchange failed.')
  }
  return data
}
