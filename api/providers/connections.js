import {
  disconnectProviderConnection,
  getShafxUser,
  listProviderConnections,
  recordProviderAudit,
  syncProviderAccounts,
  touchProviderConnection,
} from '../../server/providerConnections.js'
import { connectOandaProvider, loadOandaConnection, normalizeOandaAccounts, normalizeOandaSummary, normalizeOandaPositions, normalizeOandaOrders, normalizeOandaInstruments, normalizeOandaQuote, normalizeOandaCandles, oandaRequest } from '../../server/oanda.js'

const json = (res, status, body) => res.status(status).json(body)

const timeframeMap = { M1: 'M1', M5: 'M5', M15: 'M15', M30: 'M30', H1: 'H1', H4: 'H4', D1: 'D' }
const instrumentOf = (value) => String(value || '').trim().replace('/', '_').toUpperCase()

const handleOandaGet = async (req, res, user) => {
  const action = String(req.query.action || '')
  const connectionId = typeof req.query.connectionId === 'string' ? req.query.connectionId : ''
  if (!connectionId) return json(res, 400, { ok: false, error: 'OANDA connectionId is required.' })
  const loaded = await loadOandaConnection(req, connectionId)
  const { connection, token } = loaded
  const environment = connection.environment
  if (connection.user_id !== user.id) return json(res, 403, { ok: false, error: 'Provider connection does not belong to this user.' })

  if (action === 'accounts') {
    const payload = await oandaRequest({ environment, token, path: '/v3/accounts' })
    const accounts = normalizeOandaAccounts(payload, environment)
    await syncProviderAccounts({ connectionId: connection.id, userId: user.id, providerId: 'oanda', accounts })
    return json(res, 200, { ok: true, accounts })
  }

  const accountId = typeof req.query.accountId === 'string' ? req.query.accountId : ''
  if (!accountId) return json(res, 400, { ok: false, error: 'OANDA accountId is required.' })

  if (action === 'account') {
    const payload = await oandaRequest({ environment, token, path: '/v3/accounts/' + encodeURIComponent(accountId) + '/summary' })
    const account = normalizeOandaSummary(payload, environment)
    const { syncProviderAccounts } = await import('../../server/providerConnections.js')
    await syncProviderAccounts({ connectionId: connection.id, userId: user.id, providerId: 'oanda', accounts: [account] })
    return json(res, 200, { ok: true, account })
  }
  if (action === 'positions') {
    const payload = await oandaRequest({ environment, token, path: '/v3/accounts/' + encodeURIComponent(accountId) + '/positions' })
    return json(res, 200, { ok: true, positions: normalizeOandaPositions(payload) })
  }
  if (action === 'orders') {
    const payload = await oandaRequest({ environment, token, path: '/v3/accounts/' + encodeURIComponent(accountId) + '/pendingOrders' })
    return json(res, 200, { ok: true, orders: normalizeOandaOrders(payload) })
  }
  if (action === 'instruments') {
    const payload = await oandaRequest({ environment, token, path: '/v3/accounts/' + encodeURIComponent(accountId) + '/instruments' })
    return json(res, 200, { ok: true, instruments: normalizeOandaInstruments(payload) })
  }
  if (action === 'quote') {
    const symbol = instrumentOf(req.query.symbol)
    if (!symbol) return json(res, 400, { ok: false, error: 'OANDA symbol is required.' })
    const payload = await oandaRequest({ environment, token, path: '/v3/accounts/' + encodeURIComponent(accountId) + '/pricing', query: { instruments: symbol } })
    return json(res, 200, { ok: true, quote: normalizeOandaQuote(payload, symbol.replace('_', '/')) })
  }
  if (action === 'candles') {
    const symbol = instrumentOf(req.query.symbol)
    const timeframe = String(req.query.timeframe || 'M5')
    const granularity = timeframeMap[timeframe]
    if (!symbol || !granularity) return json(res, 400, { ok: false, error: 'OANDA symbol/timeframe is invalid.' })
    const limit = Math.max(1, Math.min(5000, Math.trunc(Number(req.query.limit) || 200)))
    const payload = await oandaRequest({ environment, token, path: '/v3/instruments/' + encodeURIComponent(symbol) + '/candles', query: { granularity, count: limit, price: 'M' } })
    return json(res, 200, { ok: true, candles: normalizeOandaCandles(payload, symbol.replace('_', '/'), timeframe) })
  }
  return json(res, 400, { ok: false, error: 'Unsupported OANDA data action.' })
}


export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  try {
    const user = await getShafxUser(req)
    if (!user) return json(res, 401, { ok: false, error: 'SHAFX sign-in is required.' })

    if (req.method === 'GET') {
      if (req.query.providerId === 'oanda' && req.query.action) return await handleOandaGet(req, res, user)
      return json(res, 200, { ok: true, connections: await listProviderConnections(user.id) })
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'object' && req.body ? req.body : {}
      const action = String(body.action || '')
      if (action === 'connect' && String(body.providerId || '') === 'oanda') {
        const result = await connectOandaProvider({ req, token: body.token, environment: body.environment, label: body.label })
        return json(res, 200, { ok: true, providerId: 'oanda', connectionId: result.connectionId, accounts: result.accounts.map((account) => ({ accountId: account.accountId, label: account.accountLabel, environment: account.environment, currency: account.currency })) })
      }
      const connectionId = String(body.connectionId || '')
      if (!connectionId) return json(res, 400, { ok: false, error: 'Provider connection id is required.' })

      if (action === 'disconnect') {
        await disconnectProviderConnection({ userId: user.id, connectionId })
        await recordProviderAudit({
          userId: user.id,
          connectionId,
          eventType: 'connection_disconnected',
          metadata: { source: 'user' },
        })
        return json(res, 200, { ok: true })
      }

      if (action === 'touch') {
        await touchProviderConnection({ userId: user.id, connectionId })
        return json(res, 200, { ok: true })
      }

      return json(res, 400, { ok: false, error: 'Unsupported provider connection action.' })
    }

    return json(res, 405, { ok: false, error: 'Method not allowed' })
  } catch (error) {
    return json(res, 500, { ok: false, error: error instanceof Error ? error.message : 'Provider connection service failed.' })
  }
}
