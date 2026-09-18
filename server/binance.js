import { createHash, createHmac } from 'node:crypto'
import {
  createProviderConnection,
  createProviderSecret,
  deleteProviderSecret,
  getProviderConnection,
  getShafxUser,
  readProviderSecret,
  recordProviderAudit,
  syncProviderAccounts,
  upsertProviderAccount,
} from './providerConnections.js'

export const BINANCE_REST_URLS = {
  demo: 'https://testnet.binance.vision',
  live: 'https://api.binance.com',
}

const decodeJson = async (response, fallback) => {
  try { return await response.json() } catch { return fallback }
}

const baseUrl = (environment) => BINANCE_REST_URLS[environment] || null

const signedQuery = (query, apiSecret) => {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(query || {})) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value))
  }
  const queryString = search.toString()
  const signature = createHmac('sha256', apiSecret).update(queryString).digest('hex')
  search.set('signature', signature)
  return search.toString()
}

export const binanceRequest = async ({ environment, apiKey, apiSecret, path, query = {}, signed = false }) => {
  const base = baseUrl(environment)
  if (!base) throw new Error('Binance environment is invalid.')
  const effectiveQuery = signed ? { ...query, timestamp: Date.now(), recvWindow: 5000 } : query
  const search = signed ? signedQuery(effectiveQuery, apiSecret) : new URLSearchParams(
    Object.entries(effectiveQuery).filter(([, value]) => value !== undefined && value !== null && value !== ''),
  ).toString()
  const url = new URL(base + path)
  if (search) url.search = search

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12000)
  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        ...(apiKey ? { 'X-MBX-APIKEY': apiKey } : {}),
      },
      signal: controller.signal,
    })
    const payload = await decodeJson(response, {})
    if (!response.ok) {
      const message = payload?.msg || payload?.message || ('Binance request failed with HTTP ' + response.status)
      throw Object.assign(new Error(message), { status: response.status, providerCode: payload?.code })
    }
    return payload
  } finally {
    clearTimeout(timer)
  }
}

const environmentOf = (environment) => environment === 'demo' ? 'demo' : 'live'

export const normalizeBinanceAccount = (payload, environment) => {
  const balances = Array.isArray(payload?.balances) ? payload.balances : []
  const nonZero = balances
    .map((row) => ({ asset: String(row?.asset || '').toUpperCase(), total: Number(row?.free || 0) + Number(row?.locked || 0) }))
    .filter((row) => row.asset && Number.isFinite(row.total) && row.total > 0)
  const usdLike = nonZero.find((row) => row.asset === 'USDT' || row.asset === 'USDC' || row.asset === 'USD')
  const primary = usdLike || nonZero[0]
  const balance = primary ? primary.total : 0
  const currency = primary?.asset || 'USDT'
  const providerAccountId = payload?.uid != null ? String(payload.uid) : 'spot-' + createHash('sha256').update(String(payload?.accountType || 'SPOT')).digest('hex').slice(0, 12)
  return {
    accountId: providerAccountId,
    accountLabel: providerAccountId + ' • SPOT',
    environment: environmentOf(environment),
    currency,
    balance,
    equity: balance,
    metadata: {
      accountType: String(payload?.accountType || 'SPOT'),
      canTrade: Boolean(payload?.canTrade),
      permissions: Array.isArray(payload?.permissions) ? payload.permissions : [],
      trackedAssets: nonZero.length,
    },
  }
}

export const normalizeBinanceOrders = (payload) => {
  const rows = Array.isArray(payload) ? payload : []
  return rows.flatMap((row) => {
    const providerOrderId = row?.orderId == null ? '' : String(row.orderId)
    if (!providerOrderId) return []
    const statusMap = {
      NEW: 'pending',
      PARTIALLY_FILLED: 'pending',
      FILLED: 'filled',
      CANCELED: 'cancelled',
      REJECTED: 'rejected',
      EXPIRED: 'cancelled',
      EXPIRED_IN_MATCH: 'cancelled',
    }
    const side = row?.side === 'SELL' ? 'SELL' : 'BUY'
    const quantity = Number(row?.origQty ?? row?.executedQty ?? 0)
    return [{
      providerOrderId,
      status: statusMap[String(row?.status || 'NEW')] || 'pending',
      clientOrderId: typeof row?.clientOrderId === 'string' ? row.clientOrderId : undefined,
      symbol: typeof row?.symbol === 'string' ? row.symbol.replace(/([A-Z0-9]+)(USDT|USDC|BTC|ETH)$/, '$1/$2') : undefined,
      side,
      quantity: Number.isFinite(quantity) ? quantity : 0,
      timestamp: Number.isFinite(Number(row?.time)) ? new Date(Number(row.time)).toISOString() : undefined,
      message: typeof row?.type === 'string' ? row.type : undefined,
      raw: row,
    }]
  })
}

export const normalizeBinanceInstruments = (payload) => {
  const rows = Array.isArray(payload?.symbols) ? payload.symbols : []
  return rows.flatMap((row) => {
    if (!row?.symbol) return []
    const filters = Array.isArray(row?.filters) ? row.filters : []
    const price = filters.find((f) => f?.filterType === 'PRICE_FILTER') || {}
    const quantity = filters.find((f) => f?.filterType === 'LOT_SIZE') || filters.find((f) => f?.filterType === 'MARKET_LOT_SIZE') || {}
    const [baseCurrency, quoteCurrency] = String(row.symbol).match(/^[A-Z0-9]+?(USDT|USDC|BTC|ETH)$/)?.slice(1) || [undefined, undefined]
    const normalized = String(row.symbol).replace(/(USDT|USDC|BTC|ETH)$/, '/$1')
    return [{
      symbol: normalized,
      providerSymbol: String(row.symbol),
      displayName: String(row.baseAsset || normalized),
      assetClass: 'crypto',
      baseCurrency: typeof row.baseAsset === 'string' ? row.baseAsset : baseCurrency,
      quoteCurrency: typeof row.quoteAsset === 'string' ? row.quoteAsset : quoteCurrency,
      priceIncrement: Number(price?.tickSize) > 0 ? Number(price.tickSize) : undefined,
      quantityMin: Number(quantity?.minQty) > 0 ? Number(quantity.minQty) : undefined,
      quantityMax: Number(quantity?.maxQty) > 0 ? Number(quantity.maxQty) : undefined,
      quantityStep: Number(quantity?.stepSize) > 0 ? Number(quantity.stepSize) : undefined,
      supportedOrderTypes: ['MARKET', 'LIMIT'],
      supportedTimeInForce: ['GTC', 'IOC', 'FOK'],
      tradable: String(row.status || '') === 'TRADING',
      metadata: { permissions: JSON.stringify(row.permissions || []) },
    }]
  })
}

export const normalizeBinanceQuote = (payload, symbol) => {
  const bid = Number(payload?.bidPrice)
  const ask = Number(payload?.askPrice)
  const last = Number(payload?.lastPrice)
  if (![bid, ask, last].some(Number.isFinite)) throw new Error('Binance returned no usable price for ' + symbol)
  return {
    symbol,
    bid: Number.isFinite(bid) ? bid : undefined,
    ask: Number.isFinite(ask) ? ask : undefined,
    last: Number.isFinite(last) ? last : (Number.isFinite(bid) && Number.isFinite(ask) ? (bid + ask) / 2 : undefined),
    timestamp: new Date().toISOString(),
  }
}

export const normalizeBinanceCandles = (payload, symbol, timeframe) => {
  const candles = Array.isArray(payload) ? payload : []
  return candles.flatMap((row) => {
    if (!Array.isArray(row) || row.length < 6) return []
    const openTime = Number(row[0])
    const open = Number(row[1]); const high = Number(row[2]); const low = Number(row[3]); const close = Number(row[4]); const volume = Number(row[5])
    if (![openTime, open, high, low, close].every(Number.isFinite)) return []
    return [{
      symbol,
      timeframe,
      openTime: new Date(openTime).toISOString(),
      closeTime: Number.isFinite(Number(row[6])) ? new Date(Number(row[6])).toISOString() : undefined,
      open,
      high,
      low,
      close,
      volume: Number.isFinite(volume) ? volume : undefined,
    }]
  })
}

const parseCredential = (secret) => {
  try {
    const value = JSON.parse(secret)
    return value && typeof value === 'object' ? value : null
  } catch {
    return null
  }
}

export const connectBinanceProvider = async ({ req, apiKey, apiSecret, environment, label }) => {
  const user = await getShafxUser(req)
  if (!user) throw Object.assign(new Error('Sign in to SHAFX before connecting Binance.'), { status: 401 })
  if (typeof apiKey !== 'string' || apiKey.trim().length < 8) throw Object.assign(new Error('Binance API key is required.'), { status: 400 })
  if (typeof apiSecret !== 'string' || apiSecret.trim().length < 16) throw Object.assign(new Error('Binance API secret is required.'), { status: 400 })
  const env = environment === 'demo' ? 'demo' : environment === 'live' ? 'live' : null
  if (!env) throw Object.assign(new Error('Binance environment must be demo or live.'), { status: 400 })

  const rawAccount = await binanceRequest({ environment: env, apiKey: apiKey.trim(), apiSecret: apiSecret.trim(), path: '/api/v3/account', signed: true })
  const account = normalizeBinanceAccount(rawAccount, env)
  let credentialRef = null
  try {
    credentialRef = await createProviderSecret({
      secret: JSON.stringify({ apiKey: apiKey.trim(), apiSecret: apiSecret.trim() }),
      name: 'shafx-' + user.id + '-binance-' + env + '-' + Date.now(),
      description: 'Encrypted SHAFX Binance API credentials. Server-side only.',
    })
    const connection = await createProviderConnection({
      userId: user.id,
      providerId: 'binance',
      label: typeof label === 'string' && label.trim() ? label.trim() : 'Binance ' + env,
      environment: env,
      state: 'connected',
      authMethod: 'api_key',
      credentialRef,
      expiresAt: null,
      providerSubject: account.accountId,
      metadata: { accountType: 'SPOT', providerEnvironment: env },
    })
    await syncProviderAccounts({ connectionId: connection.id, userId: user.id, providerId: 'binance', accounts: [account] })
    await recordProviderAudit({ userId: user.id, connectionId: connection.id, eventType: 'connection_connected', metadata: { provider: 'binance', environment: env } })
    return { connectionId: connection.id, accounts: [account] }
  } catch (error) {
    if (credentialRef) await deleteProviderSecret(credentialRef).catch(() => undefined)
    throw error
  }
}

export const loadBinanceConnection = async (req, connectionId) => {
  const user = await getShafxUser(req)
  if (!user) throw Object.assign(new Error('SHAFX sign-in is required.'), { status: 401 })
  const connection = await getProviderConnection(user.id, connectionId, true)
  if (!connection || connection.provider_id !== 'binance') throw Object.assign(new Error('Binance connection not found.'), { status: 404 })
  if (connection.state !== 'connected') throw Object.assign(new Error('Binance connection is ' + connection.state + '.'), { status: 409 })
  const credentials = parseCredential(await readProviderSecret(connection.credential_ref))
  if (!credentials?.apiKey || !credentials?.apiSecret) throw new Error('Binance connection credentials are invalid.')
  await upsertProviderAccount({
    connectionId: connection.id,
    userId: user.id,
    providerId: 'binance',
    account: normalizeBinanceAccount(await binanceRequest({
      environment: connection.environment,
      apiKey: credentials.apiKey,
      apiSecret: credentials.apiSecret,
      path: '/api/v3/account',
      signed: true,
    }), connection.environment),
  }).catch(() => undefined)
  return { user, connection, credentials }
}