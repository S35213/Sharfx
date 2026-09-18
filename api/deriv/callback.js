import { clearCookie, encryptSession, exchangeCode, getOrigin, parseCookies, parseStateCookie, setCookie, STATE_COOKIE, SESSION_COOKIE } from '../../lib/deriv/oauth.js'
import {
  createProviderConnection,
  createProviderSecret,
  deleteProviderSecret,
  getShafxUser,
  recordProviderAudit,
  syncProviderAccounts,
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
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error('Deriv account request failed')
  return Array.isArray(data?.data) ? data.data : data?.data ? [data.data] : []
}

const environmentOf = (accounts) => {
  const kinds = [...new Set(accounts.map((account) => account?.account_type === 'demo' ? 'demo' : 'live'))]
  if (kinds.length === 1) return kinds[0]
  return 'mixed'
}

const html = (title, message) => '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + title + '</title></head><body style="font-family:system-ui,sans-serif;background:#0B0E11;color:#fff;display:grid;place-items:center;min-height:100vh;padding:24px"><main style="max-width:520px;text-align:center"><h1>' + title + '</h1><p style="color:#a7b0bd">' + message + '</p><a href="/" style="color:#7da2ff">Return to SHAFX</a></main></body></html>'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).send('Method not allowed')
  const origin = getOrigin(req)
  const params = new URL(req.url, origin).searchParams
  const error = params.get('error')
  const code = params.get('code')
  const returnedState = params.get('state')
  const cookies = parseCookies(req.headers.cookie)
  let credentialRef = null

  try {
    const user = await getShafxUser(req)
    if (!user) throw new Error('Sign in to SHAFX before completing a broker connection.')
    if (error) throw new Error(params.get('error_description') || 'Deriv authorization was denied')
    if (!code || !returnedState) throw new Error('Deriv did not return the required authorization data')

    const stateCookie = cookies[STATE_COOKIE]
    if (!stateCookie) throw new Error('OAuth session expired. Start the connection again.')
    const { state, verifier } = parseStateCookie(stateCookie)
    if (state !== returnedState) throw new Error('OAuth state mismatch')

    const clientId = process.env.DERIV_CLIENT_ID
    if (!clientId) throw new Error('DERIV_CLIENT_ID is not configured')

    const token = await exchangeCode(code, verifier, origin + '/api/deriv/callback', clientId)
    const accessToken = token.access_token
    const rawAccounts = await fetchAccounts(accessToken)
    const accounts = normalize(rawAccounts)
    if (!accounts.length) throw new Error('Deriv returned no usable trading accounts for this connection.')

    credentialRef = await createProviderSecret({
      secret: accessToken,
      name: 'shafx-' + user.id + '-deriv-' + Date.now(),
      description: 'Encrypted SHAFX Deriv OAuth access token. Server-side only.',
    })

    const connection = await createProviderConnection({
      userId: user.id,
      providerId: 'deriv',
      label: 'Deriv connection ' + new Date().toISOString().slice(0, 19).replace('T', ' '),
      environment: environmentOf(accounts),
      state: 'connected',
      authMethod: 'oauth2',
      credentialRef,
      expiresAt: Number(token.expires_in) > 0 ? new Date(Date.now() + Number(token.expires_in) * 1000).toISOString() : null,
      metadata: { accountCount: accounts.length },
    })

    await syncProviderAccounts({ connectionId: connection.id, userId: user.id, providerId: 'deriv', accounts })
    await recordProviderAudit({
      userId: user.id,
      connectionId: connection.id,
      eventType: 'connection_connected',
      metadata: { provider: 'deriv', accountCount: accounts.length },
    })

    const session = encryptSession({ accessToken, expiresAt: Date.now() + Number(token.expires_in || 3600) * 1000 })
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Set-Cookie', [clearCookie(STATE_COOKIE), setCookie(SESSION_COOKIE, session, Math.max(60, Number(token.expires_in || 3600)))])
    return res.redirect(302, '/?deriv=connected')
  } catch (errorValue) {
    if (credentialRef) await deleteProviderSecret(credentialRef).catch(() => undefined)
    const message = errorValue instanceof Error ? errorValue.message : 'Deriv authorization failed'
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Set-Cookie', clearCookie(STATE_COOKIE))
    return res.status(400).send(html('Deriv connection failed', message))
  }
}
