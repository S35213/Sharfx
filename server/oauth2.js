import { createHash, randomBytes } from 'node:crypto'

const base64url = (value) => Buffer.from(value).toString('base64url')

export const createPkcePair = () => {
  const verifier = base64url(randomBytes(32))
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge, method: 'S256' }
}

export const createOAuthState = (bytes = 24) => base64url(randomBytes(bytes))

export const buildOAuthAuthorizationUrl = ({ authorizationEndpoint, clientId, redirectUri, scope, state, codeChallenge, extraParams = {} }) => {
  const url = new URL(authorizationEndpoint)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  if (scope) url.searchParams.set('scope', scope)
  if (state) url.searchParams.set('state', state)
  if (codeChallenge) {
    url.searchParams.set('code_challenge', codeChallenge)
    url.searchParams.set('code_challenge_method', 'S256')
  }
  for (const [key, value] of Object.entries(extraParams)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value))
  }
  return url.toString()
}

export const exchangeOAuthCode = async ({ tokenEndpoint, code, clientId, clientSecret, redirectUri, codeVerifier, fetchImpl = fetch }) => {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: clientId,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  })
  if (clientSecret) body.set('client_secret', clientSecret)
  const response = await fetchImpl(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString(),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw Object.assign(new Error(payload?.error_description || payload?.error || 'OAuth token exchange failed.'), { status: response.status })
  }
  return payload
}