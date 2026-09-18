import {
  createProviderConnection,
  createProviderSecret,
  deleteProviderSecret,
  getProviderConnection,
  getShafxUser,
  readProviderSecret,
  recordProviderAudit,
  syncProviderAccounts,
} from './providerConnections.js'

export const OANDA_REST_URLS = {
  demo: 'https://api-fxpractice.oanda.com',
  live: 'https://api-fxtrade.oanda.com',
}

export const oandaBaseUrl = (environment) => OANDA_REST_URLS[environment] || null

const decodeJson = async (response, fallback) => {
  try { return await response.json() } catch { return fallback }
}

export const oandaRequest = async ({ environment, token, path, query, method = 'GET', body }) => {
  const base = oandaBaseUrl(environment)
  if (!base) throw new Error('OANDA environment is invalid.')
  const url = new URL(base + path)
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value))
    }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12000)
  try {
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: 'Bearer ' + token,
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    })
    const payload = await decodeJson(response, {})
    if (!response.ok) {
      const message = payload?.errorMessage || payload?.errorCode || ('OANDA request failed with HTTP ' + response.status)
      const error = new Error(message)
      error.status = response.status
      throw error
    }
    return payload
  } finally {
    clearTimeout(timer)
  }
}

const environmentOf = (environment) => environment === 'demo' ? 'demo' : 'live'

export const normalizeOandaAccounts = (payload, environment) => {
  const rows = Array.isArray(payload?.accounts) ? payload.accounts : []
  return rows.flatMap((row) => {
    const accountId = typeof row?.id === 'string' ? row.id.trim() : ''
    const currency = typeof row?.currency === 'string' ? row.currency.trim() : ''
    if (!accountId || !currency) return []
    const balance = Number(row?.balance)
    const nav = Number(row?.NAV)
    const marginUsed = Number(row?.marginUsed)
    const marginAvailable = Number(row?.marginAvailable)
    const unrealizedPL = Number(row?.unrealizedPL)
    return [{
      accountId,
      accountLabel: [typeof row?.alias === 'string' ? row.alias.trim() : '', accountId].filter(Boolean).join(' • '),
      environment: environmentOf(environment),
      currency,
      balance: Number.isFinite(balance) ? balance : 0,
      equity: Number.isFinite(nav) ? nav : undefined,
      usedMargin: Number.isFinite(marginUsed) ? marginUsed : undefined,
      freeMargin: Number.isFinite(marginAvailable) ? marginAvailable : undefined,
      floatingPL: Number.isFinite(unrealizedPL) ? unrealizedPL : undefined,
      metadata: {
        homeCurrency: currency,
        openTradeCount: Number.isFinite(Number(row?.openTradeCount)) ? Number(row.openTradeCount) : undefined,
      },
    }]
  })
}

export const normalizeOandaSummary = (payload, environment) => {
  const row = payload?.account || {}
  const accountId = typeof row?.id === 'string' ? row.id : ''
  const currency = typeof row?.currency === 'string' ? row.currency : ''
  const balance = Number(row?.balance)
  const nav = Number(row?.NAV)
  const marginUsed = Number(row?.marginUsed)
  const marginAvailable = Number(row?.marginAvailable)
  const unrealizedPL = Number(row?.unrealizedPL)
  return {
    accountId,
    accountLabel: [typeof row?.alias === 'string' ? row.alias.trim() : '', accountId].filter(Boolean).join(' • '),
    environment: environmentOf(environment),
    currency,
    balance: Number.isFinite(balance) ? balance : 0,
    equity: Number.isFinite(nav) ? nav : undefined,
    usedMargin: Number.isFinite(marginUsed) ? marginUsed : undefined,
    freeMargin: Number.isFinite(marginAvailable) ? marginAvailable : undefined,
    floatingPL: Number.isFinite(unrealizedPL) ? unrealizedPL : undefined,
  }
}

export const normalizeOandaPositions = (payload) => {
  const positions = Array.isArray(payload?.positions) ? payload.positions : []
  return positions.flatMap((position) => {
    const instrument = typeof position?.instrument === 'string' ? position.instrument : ''
    if (!instrument) return []
    const sides = [
      ['long', position?.long],
      ['short', position?.short],
    ]
    return sides.flatMap(([side, row]) => {
      const units = Number(row?.units)
      if (!Number.isFinite(units) || units === 0) return []
      const averagePrice = Number(row?.averagePrice)
      const unrealizedPL = Number(row?.unrealizedPL)
      return [{
        id: instrument + ':' + side,
        symbol: instrument.replace('_', '/'),
        side: side === 'long' ? 'BUY' : 'SELL',
        quantity: Math.abs(units),
        entryPrice: Number.isFinite(averagePrice) ? averagePrice : 0,
        stopLoss: null,
        takeProfit: null,
        unrealizedPL: Number.isFinite(unrealizedPL) ? unrealizedPL : undefined,
        currency: undefined,
      }]
    })
  })
}

export const normalizeOandaOrders = (payload) => {
  const orders = Array.isArray(payload?.orders) ? payload.orders : []
  return orders.flatMap((order) => {
    const providerOrderId = typeof order?.id === 'string' ? order.id : ''
    const symbol = typeof order?.instrument === 'string' ? order.instrument.replace('_', '/') : undefined
    if (!providerOrderId) return []
    const sideUnits = Number(order?.units)
    return [{
      providerOrderId,
      status: 'pending',
      clientOrderId: typeof order?.clientExtensions?.id === 'string' ? order.clientExtensions.id : undefined,
      symbol,
      side: Number.isFinite(sideUnits) && sideUnits < 0 ? 'SELL' : 'BUY',
      quantity: Number.isFinite(sideUnits) ? Math.abs(sideUnits) : 0,
      timestamp: typeof order?.createTime === 'string' ? order.createTime : undefined,
      message: typeof order?.type === 'string' ? order.type : undefined,
    }]
  })
}

export const normalizeOandaInstruments = (payload) => {
  const rows = Array.isArray(payload?.instruments) ? payload.instruments : []
  return rows.flatMap((instrument) => {
    const providerSymbol = typeof instrument?.name === 'string' ? instrument.name : ''
    if (!providerSymbol) return []
    const symbol = providerSymbol.replace('_', '/')
    const contractSize = Number(instrument?.contractUnits)
    const pipLocation = Number(instrument?.pipLocation)
    const displayPrecision = Number(instrument?.displayPrecision)
    const minimumTradeSize = Number(instrument?.minimumTradeSize)
    return [{
      symbol,
      providerSymbol,
      displayName: typeof instrument?.displayName === 'string' ? instrument.displayName : symbol,
      assetClass: 'forex',
      baseCurrency: typeof instrument?.baseCurrency === 'string' ? instrument.baseCurrency : undefined,
      quoteCurrency: typeof instrument?.quoteCurrency === 'string' ? instrument.quoteCurrency : undefined,
      contractSize: Number.isFinite(contractSize) ? contractSize : undefined,
      pipSize: Number.isFinite(pipLocation) ? 10 ** pipLocation : undefined,
      priceIncrement: Number.isFinite(displayPrecision) ? 10 ** (-displayPrecision) : undefined,
      quantityMin: Number.isFinite(minimumTradeSize) ? minimumTradeSize : undefined,
      tradable: true,
    }]
  })
}

export const normalizeOandaQuote = (payload, symbol) => {
  const prices = Array.isArray(payload?.prices) ? payload.prices : []
  const price = prices[0]
  if (!price) throw new Error('OANDA returned no price for ' + symbol)
  const bid = Number(price?.bids?.[0]?.price)
  const ask = Number(price?.asks?.[0]?.price)
  return {
    symbol,
    bid: Number.isFinite(bid) ? bid : undefined,
    ask: Number.isFinite(ask) ? ask : undefined,
    last: Number.isFinite(bid) && Number.isFinite(ask) ? (bid + ask) / 2 : Number.isFinite(ask) ? ask : bid,
    timestamp: typeof price?.time === 'string' ? price.time : new Date().toISOString(),
  }
}

export const normalizeOandaCandles = (payload, symbol, timeframe) => {
  const candles = Array.isArray(payload?.candles) ? payload.candles : []
  return candles.flatMap((candle) => {
    const open = Number(candle?.mid?.o)
    const high = Number(candle?.mid?.h)
    const low = Number(candle?.mid?.l)
    const close = Number(candle?.mid?.c)
    if (![open, high, low, close].every(Number.isFinite) || typeof candle?.time !== 'string') return []
    return [{
      symbol,
      timeframe,
      openTime: candle.time,
      open,
      high,
      low,
      close,
      volume: Number.isFinite(Number(candle?.volume)) ? Number(candle.volume) : undefined,
    }]
  })
}

const oandaExecutionResult = (payload, fallbackSymbol) => {
  const create = payload?.orderCreateTransaction || {}
  const fill = payload?.orderFillTransaction || {}
  const cancel = payload?.orderCancelTransaction || {}
  const providerOrderId = String(create.id || cancel.orderID || payload?.lastTransactionID || '')
  const units = Number(fill.units ?? create.units)
  const symbol = typeof (fill.instrument || create.instrument || fallbackSymbol) === 'string'
    ? String(fill.instrument || create.instrument || fallbackSymbol).replace('_', '/')
    : fallbackSymbol
  const side = Number.isFinite(units) && units < 0 ? 'SELL' : 'BUY'
  const status = cancel.id ? 'cancelled' : fill.id ? 'filled' : create.id ? 'accepted' : 'pending'
  return {
    providerOrderId,
    status,
    clientOrderId: typeof create.clientExtensions?.id === 'string' ? create.clientExtensions.id : undefined,
    symbol,
    side,
    quantity: Number.isFinite(units) ? Math.abs(units) : undefined,
    timestamp: typeof (fill.time || create.time || cancel.time) === 'string' ? (fill.time || create.time || cancel.time) : new Date().toISOString(),
    message: typeof payload?.errorMessage === 'string' ? payload.errorMessage : undefined,
    raw: payload,
  }
}

export const placeOandaDemoOrder = async ({ environment, token, accountId, order }) => {
  if (environment !== 'demo') throw Object.assign(new Error('SHAFX demo execution gate only permits OANDA practice accounts.'), { status: 403 })
  if (order.quantityUnit !== 'units') throw Object.assign(new Error('OANDA order quantityUnit must be units.'), { status: 400 })
  if (!Number.isFinite(Number(order.quantity)) || Number(order.quantity) <= 0) throw Object.assign(new Error('OANDA order quantity must be greater than zero.'), { status: 400 })
  const instrument = String(order.symbol || '').trim().replace('/', '_').toUpperCase()
  if (!instrument) throw Object.assign(new Error('OANDA order symbol is required.'), { status: 400 })
  const units = order.side === 'SELL' ? -Math.abs(Number(order.quantity)) : Math.abs(Number(order.quantity))
  const typeMap = { MARKET: 'MARKET', LIMIT: 'LIMIT', STOP: 'STOP' }
  const type = typeMap[order.type]
  if (!type) throw Object.assign(new Error('OANDA does not support this normalized order type.'), { status: 400 })
  const body = { order: { type, instrument, units: String(units), positionFill: 'DEFAULT' } }
  if (order.timeInForce) body.order.timeInForce = order.timeInForce
  if (order.limitPrice !== undefined) body.order.price = String(order.limitPrice)
  if (order.stopPrice !== undefined) body.order.price = String(order.stopPrice)
  if (order.clientOrderId) body.order.clientExtensions = { id: order.clientOrderId, tag: 'SHAFX' }
  if (order.stopLoss !== undefined) body.order.stopLossOnFill = { price: String(order.stopLoss), timeInForce: 'GTC' }
  if (order.takeProfit !== undefined) body.order.takeProfitOnFill = { price: String(order.takeProfit), timeInForce: 'GTC' }
  const payload = await oandaRequest({ environment, token, path: '/v3/accounts/' + encodeURIComponent(accountId) + '/orders', method: 'POST', body })
  return oandaExecutionResult(payload, instrument)
}

export const cancelOandaOrder = async ({ environment, token, accountId, providerOrderId }) => {
  if (environment !== 'demo') throw Object.assign(new Error('SHAFX demo execution gate only permits OANDA practice accounts.'), { status: 403 })
  if (!providerOrderId) throw Object.assign(new Error('OANDA provider order id is required.'), { status: 400 })
  const payload = await oandaRequest({ environment, token, path: '/v3/accounts/' + encodeURIComponent(accountId) + '/orders/' + encodeURIComponent(providerOrderId), method: 'DELETE' })
  return oandaExecutionResult(payload, undefined)
}

export const closeOandaPosition = async ({ environment, token, accountId, positionId }) => {
  if (environment !== 'demo') throw Object.assign(new Error('SHAFX demo execution gate only permits OANDA practice accounts.'), { status: 403 })
  const [instrument, side] = String(positionId || '').split(':')
  if (!instrument || !['long', 'short'].includes(side)) throw Object.assign(new Error('OANDA position id must be instrument:long or instrument:short.'), { status: 400 })
  const body = { [side === 'long' ? 'longUnits' : 'shortUnits']: 'ALL' }
  const payload = await oandaRequest({ environment, token, path: '/v3/accounts/' + encodeURIComponent(accountId) + '/positions/' + encodeURIComponent(instrument.replace('/', '_')) + '/close', method: 'PUT', body })
  return oandaExecutionResult(payload, instrument)
}

export const connectOandaProvider = async ({ req, token, environment, label }) => {
  const user = await getShafxUser(req)
  if (!user) throw Object.assign(new Error('Sign in to SHAFX before connecting OANDA.'), { status: 401 })
  if (typeof token !== 'string' || token.trim().length < 20) throw Object.assign(new Error('OANDA API token is required.'), { status: 400 })
  const env = environment === 'demo' ? 'demo' : environment === 'live' ? 'live' : null
  if (!env) throw Object.assign(new Error('OANDA environment must be demo or live.'), { status: 400 })

  const rawAccounts = await oandaRequest({ environment: env, token: token.trim(), path: '/v3/accounts' })
  const accounts = normalizeOandaAccounts(rawAccounts, env)
  if (!accounts.length) throw Object.assign(new Error('OANDA returned no authorized accounts for this token.'), { status: 400 })

  let credentialRef = null
  try {
    credentialRef = await createProviderSecret({
      secret: token.trim(),
      name: 'shafx-' + user.id + '-oanda-' + env + '-' + Date.now(),
      description: 'Encrypted SHAFX OANDA personal access token. Server-side only.',
    })
    const connection = await createProviderConnection({
      userId: user.id,
      providerId: 'oanda',
      label: typeof label === 'string' && label.trim() ? label.trim() : 'OANDA ' + env,
      environment: env,
      state: 'connected',
      authMethod: 'api_key',
      credentialRef,
      expiresAt: null,
      metadata: { accountCount: accounts.length, providerEnvironment: env },
    })
    await syncProviderAccounts({ connectionId: connection.id, userId: user.id, providerId: 'oanda', accounts })
    await recordProviderAudit({ userId: user.id, connectionId: connection.id, eventType: 'connection_connected', metadata: { provider: 'oanda', accountCount: accounts.length, environment: env } })
    return { connectionId: connection.id, accounts }
  } catch (error) {
    if (credentialRef) await deleteProviderSecret(credentialRef).catch(() => undefined)
    throw error
  }
}

export const loadOandaConnection = async (req, connectionId) => {
  const user = await getShafxUser(req)
  if (!user) throw Object.assign(new Error('SHAFX sign-in is required.'), { status: 401 })
  const connection = await getProviderConnection(user.id, connectionId, true)
  if (!connection || connection.provider_id !== 'oanda') throw Object.assign(new Error('OANDA connection not found.'), { status: 404 })
  if (connection.state !== 'connected') throw Object.assign(new Error('OANDA connection is ' + connection.state + '.'), { status: 409 })
  const token = await readProviderSecret(connection.credential_ref)
  return { user, connection, token }
}
