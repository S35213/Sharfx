import { decryptSession, parseCookies, SESSION_COOKIE } from '../../lib/deriv/oauth.js'
import {
  getProviderConnection,
  getShafxUser,
  readProviderSecret,
  syncProviderAccounts,
  touchProviderConnection,
} from '../../server/providerConnections.js'

const DERIV_API = 'https://api.derivws.com/trading/v1/options'

const getAccounts = async (accessToken) => {
  const response = await fetch(DERIV_API + '/accounts', { headers: { Authorization: 'Bearer ' + accessToken } })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error('Deriv account request failed')
  return Array.isArray(data?.data) ? data.data : data?.data ? [data.data] : []
}

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

const legacySession = (req) => {
  const cookies = parseCookies(req.headers.cookie)
  const sessionValue = cookies[SESSION_COOKIE]
  if (!sessionValue) return null
  const session = decryptSession(sessionValue)
  if (!session || typeof session.accessToken !== 'string' || typeof session.expiresAt !== 'number' || session.expiresAt <= Date.now()) return null
  return session
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' })
  res.setHeader('Cache-Control', 'no-store')

  try {
    const connectionId = typeof req.query.connectionId === 'string' ? req.query.connectionId : ''
    const user = connectionId ? await getShafxUser(req) : null
    const requestedType = String(req.query.accountType || 'real').toLowerCase() === 'demo' ? 'demo' : 'real'
    const requestedAccountId = typeof req.query.accountId === 'string' ? req.query.accountId : ''

    let accessToken
    let selected
    if (connectionId) {
      if (!user) return res.status(401).json({ ok: false, connected: false, error: 'SHAFX sign-in is required' })
      const connection = await getProviderConnection(user.id, connectionId, true)
      if (!connection || connection.provider_id !== 'deriv') return res.status(404).json({ ok: false, connected: false, error: 'Deriv connection not found' })
      if (connection.state !== 'connected') return res.status(409).json({ ok: false, connected: false, error: 'Deriv connection is ' + connection.state })
      if (connection.expires_at && new Date(connection.expires_at).getTime() <= Date.now()) {
        await touchProviderConnection({ userId: user.id, connectionId, state: 'expired' })
        return res.status(401).json({ ok: false, connected: false, error: 'Deriv connection has expired' })
      }
      accessToken = await readProviderSecret(connection.credential_ref)
      const rows = await getAccounts(accessToken)
      selected = requestedAccountId
        ? rows.find((account) => String(account.account_id) === requestedAccountId)
        : rows.find((account) => String(account.account_type || '').toLowerCase() === requestedType && String(account.status || 'active').toLowerCase() === 'active') ||
          rows.find((account) => String(account.account_type || '').toLowerCase() === requestedType)
      if (!selected?.account_id) return res.status(404).json({ ok: false, connected: true, error: requestedAccountId ? 'Requested Deriv account is not available' : 'No ' + requestedType + ' Deriv account is available' })
      await syncProviderAccounts({ connectionId, userId: user.id, providerId: 'deriv', accounts: normalize(rows) })
      await touchProviderConnection({ userId: user.id, connectionId, state: 'connected' })
    } else {
      const session = legacySession(req)
      if (!session) return res.status(401).json({ ok: false, connected: false, error: 'Deriv is not connected' })
      accessToken = session.accessToken
      const rows = await getAccounts(accessToken)
      selected = requestedAccountId
        ? rows.find((account) => String(account.account_id) === requestedAccountId)
        : rows.find((account) => String(account.account_type || '').toLowerCase() === requestedType && String(account.status || 'active').toLowerCase() === 'active') ||
          rows.find((account) => String(account.account_type || '').toLowerCase() === requestedType)
      if (!selected?.account_id) return res.status(404).json({ ok: false, connected: true, error: requestedAccountId ? 'Requested Deriv account is not available' : 'No active Deriv ' + requestedType + ' account is available' })
    }

    const otpResponse = await fetch(DERIV_API + '/accounts/' + encodeURIComponent(selected.account_id) + '/otp', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + accessToken },
    })
    const otpData = await otpResponse.json().catch(() => ({}))
    const wsUrl = otpData?.data?.url
    if (!otpResponse.ok || typeof wsUrl !== 'string') return res.status(502).json({ ok: false, connected: true, error: 'Deriv did not provide an authenticated account stream' })
    return res.status(200).json({
      ok: true,
      connected: true,
      account: { id: selected.account_id, type: selected.account_type, currency: selected.currency },
      wsUrl,
    })
  } catch (error) {
    return res.status(401).json({ ok: false, connected: false, error: error instanceof Error ? error.message : 'Deriv account stream unavailable' })
  }
}
