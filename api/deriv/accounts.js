import { decryptSession, parseCookies, SESSION_COOKIE } from '../../lib/deriv/oauth.js'
import {
  getProviderConnection,
  getShafxUser,
  readProviderSecret,
  syncProviderAccounts,
  touchProviderConnection,
} from '../../server/providerConnections.js'

const DERIV_ACCOUNTS_URL = 'https://api.derivws.com/trading/v1/options/accounts'

const normalize = (rows) => rows.flatMap((row) => {
  const accountId = typeof row?.account_id === 'string' ? row.account_id.trim() : ''
  const currency = typeof row?.currency === 'string' ? row.currency.trim() : ''
  const balance = Number(row?.balance)
  if (!accountId || !currency || !Number.isFinite(balance)) return []
  return [{
    accountId,
    accountLabel: [row?.account_type === 'demo' ? 'Demo' : 'Live', typeof row?.group === 'string' ? row.group : undefined, typeof row?.status === 'string' ? row.status : undefined].filter(Boolean).join(' • '),
    environment: row?.account_type === 'demo' ? 'demo' : 'live',
    currency,
    balance,
  }]
})

const fetchAccounts = async (accessToken) => {
  const response = await fetch(DERIV_ACCOUNTS_URL, { headers: { Authorization: 'Bearer ' + accessToken } })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error('Deriv account request failed')
  return Array.isArray(payload?.data) ? payload.data : payload?.data ? [payload.data] : []
}

const legacySession = (req) => {
  const cookies = parseCookies(req.headers.cookie)
  const sessionValue = cookies[SESSION_COOKIE]
  if (!sessionValue) return null
  const session = decryptSession(sessionValue)
  if (!session || typeof session.accessToken !== 'string' || typeof session.expiresAt !== 'number' || session.expiresAt <= Date.now()) return null
  return session
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  res.setHeader('Cache-Control', 'no-store')
  try {
    const connectionId = typeof req.query.connectionId === 'string' ? req.query.connectionId : ''
    const user = connectionId ? await getShafxUser(req) : null

    if (connectionId) {
      if (!user) return res.status(401).json({ connected: false, error: 'SHAFX sign-in is required' })
      const connection = await getProviderConnection(user.id, connectionId, true)
      if (!connection || connection.provider_id !== 'deriv') return res.status(404).json({ connected: false, error: 'Deriv connection not found' })
      if (connection.state !== 'connected') return res.status(409).json({ connected: false, error: 'Deriv connection is ' + connection.state })
      if (connection.expires_at && new Date(connection.expires_at).getTime() <= Date.now()) {
        await touchProviderConnection({ userId: user.id, connectionId, state: 'expired' })
        return res.status(401).json({ connected: false, error: 'Deriv connection has expired' })
      }
      const accessToken = await readProviderSecret(connection.credential_ref)
      const rows = await fetchAccounts(accessToken)
      const accounts = normalize(rows)
      await syncProviderAccounts({ connectionId, userId: user.id, providerId: 'deriv', accounts })
      await touchProviderConnection({ userId: user.id, connectionId, state: 'connected' })
      return res.status(200).json({ connected: true, connectionId, data: rows })
    }

    const session = legacySession(req)
    if (!session) return res.status(401).json({ connected: false, error: 'Deriv is not connected' })
    const rows = await fetchAccounts(session.accessToken)
    return res.status(200).json({ connected: true, data: rows })
  } catch (error) {
    return res.status(401).json({ connected: false, error: error instanceof Error ? error.message : 'Invalid or unavailable Deriv session' })
  }
}
