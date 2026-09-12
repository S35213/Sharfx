import { decryptSession, parseCookies, SESSION_COOKIE } from '../../lib/deriv/oauth.js'

const DERIV_ACCOUNTS_URL = 'https://api.derivws.com/trading/v1/options/accounts'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  res.setHeader('Cache-Control', 'no-store')
  try {
    const cookies = parseCookies(req.headers.cookie)
    const sessionValue = cookies[SESSION_COOKIE]
    if (!sessionValue) return res.status(401).json({ connected: false, error: 'Deriv is not connected' })
    const session = decryptSession(sessionValue)
    if (!session || typeof session.accessToken !== 'string' || typeof session.expiresAt !== 'number' || session.expiresAt <= Date.now()) {
      return res.status(401).json({ connected: false, error: 'Deriv session has expired' })
    }
    const response = await fetch(DERIV_ACCOUNTS_URL, { headers: { Authorization: `Bearer ${session.accessToken}` } })
    const data = await response.json()
    if (!response.ok) return res.status(response.status).json({ connected: false, error: 'Deriv account request failed' })
    return res.status(200).json({ connected: true, data })
  } catch {
    return res.status(401).json({ connected: false, error: 'Invalid or unavailable Deriv session' })
  }
}
