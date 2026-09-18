import { getOrigin, createPkce, serializeStateCookie, setCookie, STATE_COOKIE, createAuthorizationUrl } from '../../lib/deriv/oauth.js'
import { getShafxUser } from '../../server/providerConnections.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  if (!await getShafxUser(req)) return res.status(401).json({ error: 'Sign in to SHAFX before connecting a broker.' })
  const clientId = process.env.DERIV_CLIENT_ID
  if (!clientId) return res.status(500).json({ error: 'DERIV_CLIENT_ID is not configured' })
  try {
    const origin = getOrigin(req)
    const { verifier, challenge, state } = createPkce()
    const cookie = serializeStateCookie(state, verifier)
    const location = createAuthorizationUrl(origin, clientId, 'trade', state, challenge)
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Set-Cookie', setCookie(STATE_COOKIE, cookie, 600))
    return res.redirect(302, location)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to start Deriv OAuth'
    return res.status(500).json({ error: message })
  }
}
