import { decryptSession, parseCookies, SESSION_COOKIE } from '../../lib/deriv/oauth.js'

const DERIV_API = 'https://api.derivws.com/trading/v1/options'

const getAccounts = async (accessToken) => {
  const response = await fetch(`${DERIV_API}/accounts`, { headers: { Authorization: `Bearer ${accessToken}` } })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error('Deriv account request failed')
  return Array.isArray(data?.data) ? data.data : data?.data ? [data.data] : []
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' })
  res.setHeader('Cache-Control', 'no-store')
  try {
    const cookies = parseCookies(req.headers.cookie)
    const sessionValue = cookies[SESSION_COOKIE]
    if (!sessionValue) return res.status(401).json({ ok: false, connected: false, error: 'Deriv is not connected' })
    const session = decryptSession(sessionValue)
    if (!session || typeof session.accessToken !== 'string' || typeof session.expiresAt !== 'number' || session.expiresAt <= Date.now()) return res.status(401).json({ ok: false, connected: false, error: 'Deriv session has expired' })

    const requestedType = String(req.query.accountType || 'real').toLowerCase() === 'demo' ? 'demo' : 'real'
    const accounts = await getAccounts(session.accessToken)
    const selected = accounts.find((account) => String(account.account_type || '').toLowerCase() === requestedType && String(account.status || 'active').toLowerCase() === 'active') || accounts.find((account) => String(account.account_type || '').toLowerCase() === requestedType)
    if (!selected?.account_id) return res.status(404).json({ ok: false, connected: true, error: `No active Deriv ${requestedType} account is available` })

    const otpResponse = await fetch(`${DERIV_API}/accounts/${encodeURIComponent(selected.account_id)}/otp`, { method: 'POST', headers: { Authorization: `Bearer ${session.accessToken}` } })
    const otpData = await otpResponse.json().catch(() => ({}))
    const wsUrl = otpData?.data?.url
    if (!otpResponse.ok || typeof wsUrl !== 'string') return res.status(502).json({ ok: false, connected: true, error: 'Deriv did not provide an authenticated account stream' })
    return res.status(200).json({ ok: true, connected: true, account: { id: selected.account_id, type: selected.account_type, currency: selected.currency }, wsUrl })
  } catch (error) {
    return res.status(401).json({ ok: false, connected: false, error: error instanceof Error ? error.message : 'Deriv account stream unavailable' })
  }
}
