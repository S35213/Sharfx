import { getShafxUser, readProviderSecret, getProviderConnection, syncProviderAccounts, recordProviderAudit } from '../../server/providerConnections.js'
import {
  loadOandaConnection,
  normalizeOandaAccounts,
  normalizeOandaSummary,
  normalizeOandaPositions,
  normalizeOandaOrders,
  normalizeOandaInstruments,
  normalizeOandaQuote,
  normalizeOandaCandles,
  oandaRequest,
} from '../../server/oanda.js'

const json = (res, status, body) => res.status(status).json(body)

const timeframeMap = {
  M1: 'M1',
  M5: 'M5',
  M15: 'M15',
  M30: 'M30',
  H1: 'H1',
  H4: 'H4',
  D1: 'D',
}

const instrumentOf = (value) => String(value || '').trim().replace('/', '_').toUpperCase()

const resolveConnection = async (req) => {
  const connectionId = typeof req.query.connectionId === 'string' ? req.query.connectionId : ''
  if (!connectionId) throw Object.assign(new Error('OANDA connectionId is required.'), { status: 400 })
  return loadOandaConnection(req, connectionId)
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'Method not allowed' })

  try {
    const { user, connection, token } = await resolveConnection(req)
    const action = String(req.query.action || '')
    const accountId = typeof req.query.accountId === 'string' ? req.query.accountId : ''
    const requestedAccountId = accountId || (typeof connection.provider_subject === 'string' ? connection.provider_subject : '')
    const environment = connection.environment

    if (action === 'accounts') {
      const payload = await oandaRequest({ environment, token, path: '/v3/accounts' })
      const accounts = normalizeOandaAccounts(payload, environment)
      await syncProviderAccounts({ connectionId: connection.id, userId: user.id, providerId: 'oanda', accounts })
      return json(res, 200, { ok: true, accounts })
    }

    if (!requestedAccountId) return json(res, 400, { ok: false, error: 'OANDA accountId is required.' })

    if (action === 'account') {
      const payload = await oandaRequest({ environment, token, path: '/v3/accounts/' + encodeURIComponent(requestedAccountId) + '/summary' })
      const account = normalizeOandaSummary(payload, environment)
      await syncProviderAccounts({ connectionId: connection.id, userId: user.id, providerId: 'oanda', accounts: [account] })
      return json(res, 200, { ok: true, account })
    }

    if (action === 'positions') {
      const payload = await oandaRequest({ environment, token, path: '/v3/accounts/' + encodeURIComponent(requestedAccountId) + '/positions' })
      return json(res, 200, { ok: true, positions: normalizeOandaPositions(payload) })
    }

    if (action === 'orders') {
      const payload = await oandaRequest({ environment, token, path: '/v3/accounts/' + encodeURIComponent(requestedAccountId) + '/pendingOrders' })
      return json(res, 200, { ok: true, orders: normalizeOandaOrders(payload) })
    }

    if (action === 'instruments') {
      const payload = await oandaRequest({ environment, token, path: '/v3/accounts/' + encodeURIComponent(requestedAccountId) + '/instruments' })
      return json(res, 200, { ok: true, instruments: normalizeOandaInstruments(payload) })
    }

    if (action === 'quote') {
      const symbol = instrumentOf(req.query.symbol)
      if (!symbol) return json(res, 400, { ok: false, error: 'OANDA symbol is required.' })
      const payload = await oandaRequest({ environment, token, path: '/v3/accounts/' + encodeURIComponent(requestedAccountId) + '/pricing', query: { instruments: symbol } })
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
  } catch (error) {
    const status = Number(error?.status) || 401
    await recordProviderAudit({ userId: undefined, eventType: 'oanda_data_error', severity: 'warning', metadata: { status, message: error instanceof Error ? error.message : 'Unknown OANDA data error' } })
    return json(res, status, { ok: false, error: error instanceof Error ? error.message : 'OANDA data request failed.' })
  }
}
