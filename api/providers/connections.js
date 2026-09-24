import { apiRequestGuard } from '../../server/authSecurity.js'
import {
  disconnectProviderConnection,
  getShafxUser,
  getProviderConnection,
  listProviderConnections,
  recordProviderAudit,
  syncProviderAccounts,
  touchProviderConnection,
  upsertProviderAccount,
} from '../../server/providerConnections.js'
import { connectProvider } from '../../server/providerConnectorRegistry.js'
import { loadOandaConnection, normalizeOandaAccounts, normalizeOandaSummary, normalizeOandaPositions, normalizeOandaOrders, normalizeOandaInstruments, normalizeOandaQuote, normalizeOandaCandles, oandaRequest, placeOandaDemoOrder, cancelOandaOrder, closeOandaPosition } from '../../server/oanda.js'
import { binanceRequest, loadBinanceConnection, normalizeBinanceAccount, normalizeBinanceOrders, normalizeBinanceInstruments, normalizeBinanceQuote, normalizeBinanceCandles } from '../../server/binance.js'

const json = (res, status, body) => res.status(status).json(body)
const timeframeMap = { M1: 'M1', M5: 'M5', M15: 'M15', M30: 'M30', H1: 'H1', H4: 'H4', D1: 'D' }
const instrumentOf = (value) => String(value || '').trim().replace('/', '_').toUpperCase()
const requestQuery = (req) => new URL(req.url || '/', 'http://shafx.local').searchParams

const handleOandaGet = async (req, res, user) => {
  const query = requestQuery(req)
  const action = String(query.action || '')
  const connectionId = typeof query.connectionId === 'string' ? query.connectionId : ''
  if (!connectionId) return json(res, 400, { ok: false, error: 'OANDA connectionId is required.' })
  const { connection, token } = await loadOandaConnection(req, connectionId)
  const environment = connection.environment
  if (connection.user_id !== user.id) return json(res, 403, { ok: false, error: 'Provider connection does not belong to this user.' })
  if (action === 'accounts') {
    const accounts = normalizeOandaAccounts(await oandaRequest({ environment, token, path: '/v3/accounts' }), environment)
    await syncProviderAccounts({ connectionId: connection.id, userId: user.id, providerId: 'oanda', accounts })
    return json(res, 200, { ok: true, accounts })
  }
  const accountId = typeof query.accountId === 'string' ? query.accountId : ''
  if (!accountId) return json(res, 400, { ok: false, error: 'OANDA accountId is required.' })
  if (action === 'account') {
    const account = normalizeOandaSummary(await oandaRequest({ environment, token, path: '/v3/accounts/' + encodeURIComponent(accountId) + '/summary' }), environment)
    await upsertProviderAccount({ connectionId: connection.id, userId: user.id, providerId: 'oanda', account })
    return json(res, 200, { ok: true, account })
  }
  if (action === 'positions') return json(res, 200, { ok: true, positions: normalizeOandaPositions(await oandaRequest({ environment, token, path: '/v3/accounts/' + encodeURIComponent(accountId) + '/positions' })) })
  if (action === 'orders') return json(res, 200, { ok: true, orders: normalizeOandaOrders(await oandaRequest({ environment, token, path: '/v3/accounts/' + encodeURIComponent(accountId) + '/pendingOrders' })) })
  if (action === 'instruments') return json(res, 200, { ok: true, instruments: normalizeOandaInstruments(await oandaRequest({ environment, token, path: '/v3/accounts/' + encodeURIComponent(accountId) + '/instruments' })) })
  if (action === 'quote') {
    const symbol = instrumentOf(query.symbol)
    if (!symbol) return json(res, 400, { ok: false, error: 'OANDA symbol is required.' })
    const payload = await oandaRequest({ environment, token, path: '/v3/accounts/' + encodeURIComponent(accountId) + '/pricing', query: { instruments: symbol } })
    return json(res, 200, { ok: true, quote: normalizeOandaQuote(payload, symbol.replace('_', '/')) })
  }
  if (action === 'candles') {
    const symbol = instrumentOf(query.symbol)
    const timeframe = String(query.timeframe || 'M5')
    const granularity = timeframeMap[timeframe]
    if (!symbol || !granularity) return json(res, 400, { ok: false, error: 'OANDA symbol/timeframe is invalid.' })
    const limit = Math.max(1, Math.min(5000, Math.trunc(Number(query.limit) || 200)))
    const payload = await oandaRequest({ environment, token, path: '/v3/instruments/' + encodeURIComponent(symbol) + '/candles', query: { granularity, count: limit, price: 'M' } })
    return json(res, 200, { ok: true, candles: normalizeOandaCandles(payload, symbol.replace('_', '/'), timeframe) })
  }
  return json(res, 400, { ok: false, error: 'Unsupported OANDA data action.' })
}

const handleBinanceGet = async (req, res, user) => {
  const query = requestQuery(req)
  const action = String(query.action || '')
  const connectionId = typeof query.connectionId === 'string' ? query.connectionId : ''
  const connectionActions = new Set(['accounts', 'account', 'orders'])
  if (connectionActions.has(action)) {
    if (!connectionId) return json(res, 400, { ok: false, error: 'Binance connectionId is required.' })
    const { connection, credentials } = await loadBinanceConnection(req, connectionId)
    const environment = connection.environment
    if (action === 'accounts') {
      const account = normalizeBinanceAccount(await binanceRequest({ environment, apiKey: credentials.apiKey, apiSecret: credentials.apiSecret, path: '/api/v3/account', signed: true }), environment)
      await syncProviderAccounts({ connectionId: connection.id, userId: user.id, providerId: 'binance', accounts: [account] })
      return json(res, 200, { ok: true, accounts: [account] })
    }
    const accountId = typeof query.accountId === 'string' ? query.accountId : ''
    if (!accountId) return json(res, 400, { ok: false, error: 'Binance accountId is required.' })
    if (action === 'account') {
      const account = normalizeBinanceAccount(await binanceRequest({ environment, apiKey: credentials.apiKey, apiSecret: credentials.apiSecret, path: '/api/v3/account', signed: true }), environment)
      await upsertProviderAccount({ connectionId: connection.id, userId: user.id, providerId: 'binance', account })
      return json(res, 200, { ok: true, account })
    }
    if (action === 'orders') {
      const symbol = String(query.symbol || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase()
      const payload = await binanceRequest({ environment, apiKey: credentials.apiKey, apiSecret: credentials.apiSecret, path: '/api/v3/openOrders', query: symbol ? { symbol } : {}, signed: true })
      return json(res, 200, { ok: true, orders: normalizeBinanceOrders(payload) })
    }
  }

  const symbol = String(query.symbol || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  const connectionIdForMarket = typeof query.connectionId === 'string' ? query.connectionId : ''
  if (!connectionIdForMarket) return json(res, 400, { ok: false, error: 'Binance connectionId is required for market data.' })
  const marketConnection = await getProviderConnection(user.id, connectionIdForMarket, false)
  if (!marketConnection || marketConnection.provider_id !== 'binance') return json(res, 404, { ok: false, error: 'Binance connection not found.' })
  if (marketConnection.state !== 'connected') return json(res, 409, { ok: false, error: 'Binance connection is ' + marketConnection.state + '.' })
  const environment = marketConnection.environment
  if (action === 'instruments') {
    const payload = await binanceRequest({ environment, path: '/api/v3/exchangeInfo' })
    return json(res, 200, { ok: true, instruments: normalizeBinanceInstruments(payload) })
  }
  if (action === 'quote') {
    if (!symbol) return json(res, 400, { ok: false, error: 'Binance symbol is required.' })
    const payload = await binanceRequest({ environment, path: '/api/v3/ticker/bookTicker', query: { symbol } })
    const ticker = await binanceRequest({ environment, path: '/api/v3/ticker/price', query: { symbol } })
    return json(res, 200, { ok: true, quote: normalizeBinanceQuote({ ...payload, lastPrice: ticker?.price }, String(query.displaySymbol || symbol)) })
  }
  if (action === 'candles') {
    if (!symbol) return json(res, 400, { ok: false, error: 'Binance symbol is required.' })
    const interval = String(query.interval || '5m')
    const limit = Math.max(1, Math.min(1500, Math.trunc(Number(query.limit) || 200)))
    const payload = await binanceRequest({ environment, path: '/api/v3/klines', query: { symbol, interval, limit } })
    return json(res, 200, { ok: true, candles: normalizeBinanceCandles(payload, String(query.displaySymbol || symbol), String(query.timeframe || 'M5')) })
  }
  return json(res, 400, { ok: false, error: 'Unsupported Binance data action.' })
}

export default async function handler(req, res) {
  const guard = await apiRequestGuard(req, 'api:provider-connections', 600)
  if (!guard.allowed) return res.status(guard.status).json({ ok: false, error: guard.error, retryAfterSeconds: guard.retryAfterSeconds })
  const query = requestQuery(req)
  res.setHeader('Cache-Control', 'no-store')
  try {
    const user = await getShafxUser(req)
    if (!user) return json(res, 401, { ok: false, error: 'SHAFX sign-in is required.' })

    if (req.method === 'GET') {
      if (query.providerId === 'oanda' && query.action) return await handleOandaGet(req, res, user)
      if (query.providerId === 'binance' && query.action) return await handleBinanceGet(req, res, user)
      return json(res, 200, { ok: true, connections: await listProviderConnections(user.id) })
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'object' && req.body ? req.body : {}
      const action = String(body.action || '')
      if (action === 'connect') {
        const providerId = String(body.providerId || '')
        const credentials = body.credentials && typeof body.credentials === 'object' ? body.credentials : body
        if (!providerId) return json(res, 400, { ok: false, error: 'Provider id is required.' })
        const result = await connectProvider({ providerId, req, credentials })
        return json(res, 200, { ok: true, providerId, connectionId: result.connectionId, accounts: result.accounts.map((account) => ({ accountId: account.accountId, label: account.accountLabel, environment: account.environment, currency: account.currency })) })
      }

      const connectionId = String(body.connectionId || '')
      if (!connectionId) return json(res, 400, { ok: false, error: 'Provider connection id is required.' })

      if (body.providerId === 'oanda' && ['placeOrder', 'cancelOrder', 'closePosition'].includes(action)) {
        const providerConnection = await getProviderConnection(user.id, connectionId, true)
        if (!providerConnection || providerConnection.provider_id !== 'oanda') return json(res, 404, { ok: false, error: 'OANDA connection not found.' })
        if (providerConnection.environment !== 'demo') return json(res, 403, { ok: false, error: 'SHAFX live external execution is still disabled. Use an OANDA practice account.' })
        const { token } = await loadOandaConnection(req, connectionId)
        const accountId = String(body.accountId || '')
        if (!accountId) return json(res, 400, { ok: false, error: 'OANDA accountId is required.' })
        if (action === 'placeOrder') {
          const order = await placeOandaDemoOrder({ environment: providerConnection.environment, token, accountId, order: body.order || {} })
          await recordProviderAudit({ userId: user.id, connectionId, eventType: 'demo_order_placed', metadata: { provider: 'oanda', accountId, providerOrderId: order.providerOrderId, symbol: order.symbol, side: order.side, quantity: order.quantity } })
          return json(res, 200, { ok: true, order })
        }
        if (action === 'cancelOrder') {
          const order = await cancelOandaOrder({ environment: providerConnection.environment, token, accountId, providerOrderId: String(body.providerOrderId || '') })
          await recordProviderAudit({ userId: user.id, connectionId, eventType: 'demo_order_cancelled', metadata: { provider: 'oanda', accountId, providerOrderId: order.providerOrderId } })
          return json(res, 200, { ok: true, order })
        }
        const order = await closeOandaPosition({ environment: providerConnection.environment, token, accountId, positionId: String(body.positionId || '') })
        await recordProviderAudit({ userId: user.id, connectionId, eventType: 'demo_position_closed', metadata: { provider: 'oanda', accountId, positionId: body.positionId } })
        return json(res, 200, { ok: true, order })
      }

      if (action === 'disconnect') {
        await disconnectProviderConnection({ userId: user.id, connectionId })
        await recordProviderAudit({ userId: user.id, connectionId, eventType: 'connection_disconnected', metadata: { source: 'user' } })
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