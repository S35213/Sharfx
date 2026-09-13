import { clearCookie, decryptSession, encryptSession, exchangeCode, getOrigin, parseCookies, parseStateCookie, setCookie, SESSION_COOKIE, STATE_COOKIE } from '../../lib/deriv/oauth.js'

const html = (title, message) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="font-family:system-ui,sans-serif;background:#0B0E11;color:#fff;display:grid;place-items:center;min-height:100vh;padding:24px"><main style="max-width:520px;text-align:center"><h1>${title}</h1><p style="color:#a7b0bd">${message}</p><a href="/" style="color:#7da2ff">Return to SHAFX</a></main></body></html>`

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).send('Method not allowed')
  const origin = getOrigin(req)
  const params = new URL(req.url, origin).searchParams
  const error = params.get('error')
  const code = params.get('code')
  const returnedState = params.get('state')
  const cookies = parseCookies(req.headers.cookie)
  try {
    if (error) throw new Error(params.get('error_description') || 'Deriv authorization was denied')
    if (!code || !returnedState) throw new Error('Deriv did not return the required authorization data')
    const stateCookie = cookies[STATE_COOKIE]
    if (!stateCookie) throw new Error('OAuth session expired. Start the connection again.')
    const { state, verifier } = parseStateCookie(stateCookie)
    if (state !== returnedState) throw new Error('OAuth state mismatch')
    const clientId = process.env.DERIV_CLIENT_ID
    if (!clientId) throw new Error('DERIV_CLIENT_ID is not configured')
    const token = await exchangeCode(code, verifier, `${origin}/api/deriv/callback`, clientId)
    const session = encryptSession({ accessToken: token.access_token, expiresAt: Date.now() + Number(token.expires_in || 3600) * 1000 })
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Set-Cookie', [clearCookie(STATE_COOKIE), setCookie(SESSION_COOKIE, session, Math.max(60, Number(token.expires_in || 3600)))])
    return res.redirect(302, '/?deriv=connected')
  } catch (errorValue) {
    const message = errorValue instanceof Error ? errorValue.message : 'Deriv authorization failed'
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Set-Cookie', clearCookie(STATE_COOKIE))
    return res.status(400).send(html('Deriv connection failed', message))
  }
}
