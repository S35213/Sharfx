import { randomUUID } from 'node:crypto'
import {
  createProviderConnection,
  createProviderSecret,
  getProviderAccount,
  getProviderConnection,
  readProviderSecret,
  syncProviderAccounts,
  updateProviderCredentialRef,
  upsertProviderAccount,
} from './providerConnections.js'

const WS = globalThis.WebSocket
const DEMO_ENDPOINT = 'wss://demo.ctraderapi.com:5036'
const LIVE_ENDPOINT = 'wss://live.ctraderapi.com:5036'
const ctraderQuoteCache = new Map()
const ctraderQuoteInflight = new Map()
const CTRADER_QUOTE_CACHE_MS = 1200

export const cTraderConfigured = () => Boolean(
  process.env.CTRADER_CLIENT_ID &&
  process.env.CTRADER_CLIENT_SECRET &&
  process.env.CTRADER_REDIRECT_URI,
)

const requireConfigured = () => {
  if (!cTraderConfigured()) {
    throw new Error('cTrader Open API is not configured on the SHAFX server. Add CTRADER_CLIENT_ID, CTRADER_CLIENT_SECRET, and CTRADER_REDIRECT_URI before connecting.')
  }
  if (typeof WS !== 'function') throw new Error('This Render runtime does not expose the WebSocket API required by cTrader Open API.')
}

const safeEnvironment = (environment) => environment === 'live' ? 'live' : 'demo'
const endpointFor = (environment) => safeEnvironment(environment) === 'live' ? LIVE_ENDPOINT : DEMO_ENDPOINT

const asObject = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {}
const asNumber = (value, fallback = 0) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

const decodeMoney = (value, digits = 8) => asNumber(value) / (10 ** Number(digits || 8))
const decodePrice = (value) => asNumber(value) / 100000
const encodePrice = (value) => Math.round(asNumber(value) * 100000)

const normalizeSymbol = (value) => String(value || '').trim().replace(/[^A-Za-z0-9/_.-]/g, '').toUpperCase()
const symbolAliases = (value) => {
  const normalized = normalizeSymbol(value)
  return new Set([normalized, normalized.replace('/', ''), normalized.replace('_', ''), normalized.replace('-', '')])
}

const requirePositiveInt = (name, value) => {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`cTrader ${name} is missing or invalid. SHAFX did not send a usable broker identifier.`)
  }
  return parsed
}

const openSocket = async (endpoint) => {
  requireConfigured()
  const socket = new WS(endpoint)
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('cTrader Open API connection timed out.')), 12000)
    const onOpen = () => { clearTimeout(timer); resolve() }
    const onError = (event) => { clearTimeout(timer); reject(new Error(event?.message || 'Unable to connect to cTrader Open API.')) }
    socket.addEventListener('open', onOpen, { once: true })
    socket.addEventListener('error', onError, { once: true })
  })
  return socket
}

const closeSocket = async (socket) => {
  try { socket.close() } catch {}
}

const ctraderRequest = (socket, payloadType, payload, matcher = (message) => message.payloadType === payloadType, timeoutMs = 15000) => new Promise((resolve, reject) => {
  const clientMsgId = randomUUID()
  let settled = false
  const timer = setTimeout(() => finish(reject, new Error('cTrader Open API request timed out.')), timeoutMs)

  const cleanup = () => {
    clearTimeout(timer)
    socket.removeEventListener('message', onMessage)
    socket.removeEventListener('error', onError)
    socket.removeEventListener('close', onClose)
  }
  const finish = (fn, value) => {
    if (settled) return
    settled = true
    cleanup()
    fn(value)
  }
  const onError = (event) => finish(reject, new Error(event?.message || 'cTrader Open API socket error.'))
  const onClose = () => finish(reject, new Error('cTrader Open API socket closed before the response arrived.'))
  const onMessage = (event) => {
    try {
      const raw = typeof event.data === 'string' ? event.data : Buffer.from(event.data).toString('utf8')
      const message = JSON.parse(raw)
      if (message.payloadType === 2142) {
        const body = asObject(message.payload)
        finish(reject, Object.assign(new Error(body.description || body.errorCode || 'cTrader rejected the request.'), {
          code: body.errorCode || 'CTRADER_ERROR',
          providerCode: body.errorCode,
        }))
        return
      }
      if (matcher(message)) finish(resolve, message)
    } catch (error) {
      finish(reject, error instanceof Error ? error : new Error('Unable to parse cTrader Open API response.'))
    }
  }

  socket.addEventListener('message', onMessage)
  socket.addEventListener('error', onError)
  socket.addEventListener('close', onClose)
  socket.send(JSON.stringify({ clientMsgId, payloadType, payload }))
})

const authenticateApplication = async (socket) => {
  await ctraderRequest(socket, 2100, {
    clientId: process.env.CTRADER_CLIENT_ID,
    clientSecret: process.env.CTRADER_CLIENT_SECRET,
  }, (message) => message.payloadType === 2101)
}

const authenticateAccount = async (socket, accountId, accessToken) => {
  await ctraderRequest(socket, 2102, {
    ctidTraderAccountId: Number(accountId),
    accessToken,
  }, (message) => message.payloadType === 2103)
}

const authenticatedRequest = async ({ environment, accessToken, accountId, payloadType, payload, matcher, timeoutMs }) => {
  const socket = await openSocket(endpointFor(environment))
  try {
    await authenticateApplication(socket)
    if (accountId) await authenticateAccount(socket, accountId, accessToken)
    return await ctraderRequest(socket, payloadType, payload, matcher, timeoutMs)
  } finally {
    await closeSocket(socket)
  }
}

export const buildCtraderAuthUrl = (state) => {
  requireConfigured()
  const url = new URL('https://id.ctrader.com/my/settings/openapi/grantingaccess/')
  url.searchParams.set('client_id', process.env.CTRADER_CLIENT_ID)
  url.searchParams.set('redirect_uri', process.env.CTRADER_REDIRECT_URI)
  url.searchParams.set('scope', 'trading')
  url.searchParams.set('product', 'web')
  if (state) url.searchParams.set('state', state)
  return url.toString()
}

export const exchangeCtraderCode = async (code) => {
  requireConfigured()
  const url = new URL('https://openapi.ctrader.com/apps/token')
  url.searchParams.set('grant_type', 'authorization_code')
  url.searchParams.set('code', code)
  url.searchParams.set('redirect_uri', process.env.CTRADER_REDIRECT_URI)
  url.searchParams.set('client_id', process.env.CTRADER_CLIENT_ID)
  url.searchParams.set('client_secret', process.env.CTRADER_CLIENT_SECRET)
  const response = await fetch(url, { headers: { Accept: 'application/json' } })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || !payload.accessToken) throw new Error(payload.description || 'cTrader authorization-code exchange failed.')
  return payload
}

export const refreshCtraderToken = async (refreshToken) => {
  requireConfigured()
  const url = new URL('https://openapi.ctrader.com/apps/token')
  url.searchParams.set('grant_type', 'refresh_token')
  url.searchParams.set('refresh_token', refreshToken)
  url.searchParams.set('client_id', process.env.CTRADER_CLIENT_ID)
  url.searchParams.set('client_secret', process.env.CTRADER_CLIENT_SECRET)
  const response = await fetch(url, { method: 'POST', headers: { Accept: 'application/json' } })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || !payload.accessToken) throw new Error(payload.description || 'cTrader token refresh failed.')
  return payload
}

const tokenSecret = (tokenPayload) => JSON.stringify({
  accessToken: String(tokenPayload.accessToken || ''),
  refreshToken: String(tokenPayload.refreshToken || ''),
  expiresAt: Date.now() + (Number(tokenPayload.expiresIn || 0) * 1000),
  tokenType: tokenPayload.tokenType || 'bearer',
})

const parseTokenSecret = (value) => {
  try {
    const parsed = JSON.parse(value)
    if (!parsed.accessToken || !parsed.refreshToken) throw new Error('cTrader token payload is incomplete.')
    return parsed
  } catch {
    throw new Error('Stored cTrader authorization data is invalid.')
  }
}

export const loadCtraderConnection = async ({ userId, connectionId, accountId, environment }) => {
  const connection = await getProviderConnection(userId, connectionId, true)
  if (!connection || connection.provider_id !== 'ctrader') throw new Error('cTrader provider connection was not found.')
  if (connection.state !== 'connected') throw new Error('The cTrader connection is ' + connection.state + '.')
  if (!connection.credential_ref) throw new Error('The cTrader authorization token reference is missing.')

  let tokens = parseTokenSecret(await readProviderSecret(connection.credential_ref))
  if (Number(tokens.expiresAt || 0) - Date.now() < 120000) {
    const refreshed = await refreshCtraderToken(tokens.refreshToken)
    const newSecretRef = await createProviderSecret({
      secret: tokenSecret(refreshed),
      name: 'SHAFX cTrader OAuth token',
      description: 'Rotated cTrader Open API access/refresh token.',
    })
    await updateProviderCredentialRef({
      userId,
      connectionId,
      credentialRef: newSecretRef,
      expiresAt: new Date(Date.now() + Number(refreshed.expiresIn || 0) * 1000).toISOString(),
    })
    tokens = parseTokenSecret(tokenSecret(refreshed))
  }

  const account = await getProviderAccount(userId, connectionId, String(accountId || connection.metadata?.selectedAccountId || ''))
  const selectedAccountId = account?.provider_account_id || accountId || connection.metadata?.selectedAccountId
  if (!selectedAccountId) throw new Error('No cTrader account is selected for this connection.')

  const selectedEnvironment = safeEnvironment(environment || account?.environment || (connection.metadata?.selectedIsLive ? 'live' : 'demo'))
  return { connection, tokens, accountId: String(selectedAccountId), environment: selectedEnvironment }
}

const listCtraderAccountsOnEnvironment = async (environment, token) => {
  const response = await authenticatedRequest({
    environment,
    accessToken: token,
    payloadType: 2149,
    payload: { accessToken: token },
    matcher: (message) => message.payloadType === 2150,
  })
  const body = asObject(response.payload)
  return Array.isArray(body.ctidTraderAccount) ? body.ctidTraderAccount : []
}

export const listCtraderAccounts = async (token) => {
  const results = await Promise.allSettled([
    listCtraderAccountsOnEnvironment('demo', token),
    listCtraderAccountsOnEnvironment('live', token),
  ])
  const rows = []
  for (const result of results) {
    if (result.status === 'fulfilled') rows.push(...result.value)
  }
  const seen = new Set()
  return rows.filter((account) => {
    const id = String(account.ctidTraderAccountId || '')
    if (!id || seen.has(id)) return false
    seen.add(id)
    return true
  })
}

export const getCtraderTrader = async ({ environment, accountId, accessToken }) => {
  const response = await authenticatedRequest({
    environment,
    accessToken,
    accountId,
    payloadType: 2121,
    payload: { ctidTraderAccountId: Number(accountId) },
    matcher: (message) => message.payloadType === 2122,
  })
  return asObject(response.payload).trader || asObject(response.payload)
}

export const getCtraderAssets = async ({ environment, accountId, accessToken }) => {
  const response = await authenticatedRequest({
    environment,
    accessToken,
    accountId,
    payloadType: 2112,
    payload: { ctidTraderAccountId: Number(accountId) },
    matcher: (message) => message.payloadType === 2113,
  })
  const body = asObject(response.payload)
  return Array.isArray(body.asset) ? body.asset : []
}

export const getCtraderSymbols = async ({ environment, accountId, accessToken }) => {
  const response = await authenticatedRequest({
    environment,
    accessToken,
    accountId,
    payloadType: 2114,
    payload: { ctidTraderAccountId: Number(accountId), includeArchivedSymbols: false },
    matcher: (message) => message.payloadType === 2115,
  })
  const body = asObject(response.payload)
  return Array.isArray(body.symbol) ? body.symbol : []
}

export const getCtraderSymbol = async ({ environment, accountId, accessToken, symbolId }) => {
  const response = await authenticatedRequest({
    environment,
    accessToken,
    accountId,
    payloadType: 2116,
    payload: { ctidTraderAccountId: Number(accountId), symbolId: [Number(symbolId)] },
    matcher: (message) => message.payloadType === 2117,
  })
  const body = asObject(response.payload)
  return Array.isArray(body.symbol) ? body.symbol[0] || null : null
}

const findSymbol = (symbols, requested) => {
  const aliases = symbolAliases(requested)
  return symbols.find((item) => {
    const name = item.name || item.symbolName
    if (!name) return false
    return [...symbolAliases(name)].some((alias) => aliases.has(alias))
  }) || null
}

const ctraderFullSymbolCache = new Map()
const CTRADER_FULL_SYMBOL_CACHE_MS = 300000

export const getCtraderFullSymbolById = async ({ environment, accountId, accessToken, symbolId }) => {
  const account = requirePositiveInt('account ID', accountId)
  const id = requirePositiveInt('symbol ID', symbolId)
  const key = [safeEnvironment(environment), String(account), String(id)].join(':')
  const cached = ctraderFullSymbolCache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.symbol
  const full = await getCtraderSymbol({ environment, accountId: String(account), accessToken, symbolId: id })
  if (!full) throw new Error('cTrader returned no full specification for symbol ID ' + id + '.')
  ctraderFullSymbolCache.set(key, { symbol: full, expiresAt: Date.now() + CTRADER_FULL_SYMBOL_CACHE_MS })
  return full
}

export const resolveCtraderSymbol = async ({ environment, accountId, accessToken, symbol, symbolId }) => {
  const account = requirePositiveInt('account ID', accountId)
  if (symbolId !== undefined && symbolId !== null && String(symbolId) !== '') {
    return getCtraderFullSymbolById({ environment, accountId: String(account), accessToken, symbolId })
  }
  const requested = String(symbol || '').trim()
  if (!requested) throw new Error('cTrader symbol is missing. SHAFX did not send a symbol.')
  const symbols = await getCtraderSymbols({ environment, accountId: String(account), accessToken })
  const match = findSymbol(symbols, requested)
  if (!match) throw new Error('cTrader does not expose the selected symbol: ' + requested)
  const matchedId = requirePositiveInt('symbol ID', match.symbolId)
  return getCtraderFullSymbolById({ environment, accountId: String(account), accessToken, symbolId: matchedId })
}

export const normalizeCtraderInstrument = (symbol) => {
  const item = asObject(symbol)
  const lotSizeCents = asNumber(item.lotSize)
  const minVolumeCents = asNumber(item.minVolume)
  const maxVolumeCents = asNumber(item.maxVolume)
  const stepVolumeCents = asNumber(item.stepVolume)
  const digits = asNumber(item.digits, 5)
  return {
    symbol: String(item.name || item.symbolName || ''),
    providerSymbol: String(item.symbolId || ''),
    displayName: String(item.description || item.name || item.symbolName || ''),
    assetClass: item.symbolCategoryId == null ? 'CFD' : 'CFD',
    contractSize: lotSizeCents > 0 ? lotSizeCents / 100 : undefined,
    pipSize: item.pipPosition != null ? 10 ** -Number(item.pipPosition) : 10 ** -(digits >= 4 ? 4 : digits),
    priceIncrement: 10 ** -digits,
    quantityMin: minVolumeCents > 0 ? minVolumeCents / Math.max(1, lotSizeCents / 100) : undefined,
    quantityMax: maxVolumeCents > 0 ? maxVolumeCents / Math.max(1, lotSizeCents / 100) : undefined,
    quantityStep: stepVolumeCents > 0 ? stepVolumeCents / Math.max(1, lotSizeCents / 100) : undefined,
    tradable: Number(item.tradingMode || 0) === 0,
    metadata: {
      symbolId: String(item.symbolId || ''),
      lotSizeProtocol: String(lotSizeCents || ''),
      minVolumeProtocol: String(minVolumeCents || ''),
      maxVolumeProtocol: String(maxVolumeCents || ''),
      stepVolumeProtocol: String(stepVolumeCents || ''),
      baseAssetId: String(item.baseAssetId || ''),
      quoteAssetId: String(item.quoteAssetId || ''),
      digits: String(digits),
      pipPosition: String(item.pipPosition ?? ''),
    },
  }
}

export const ctraderLotsToProtocolVolume = (lots, fullSymbol) => {
  const lotSizeCents = asNumber(fullSymbol?.lotSize)
  if (!Number.isFinite(lots) || lots <= 0 || lotSizeCents <= 0) throw new Error('cTrader symbol lot size is unavailable.')
  return Math.round(Number(lots) * lotSizeCents)
}

export const ctraderProtocolVolumeToLots = (volume, fullSymbol) => {
  const lotSizeCents = asNumber(fullSymbol?.lotSize)
  if (!Number.isFinite(volume) || volume <= 0 || lotSizeCents <= 0) return 0
  return Number(volume) / lotSizeCents
}

export const getCtraderQuote = async ({ environment, accountId, accessToken, symbolId }) => {
  const account = requirePositiveInt('account ID', accountId)
  const id = requirePositiveInt('symbol ID', symbolId)
  const cacheKey = [safeEnvironment(environment), String(account), String(id)].join(':')
  const cached = ctraderQuoteCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.quote

  // Desktop and mobile SHAFX views can request the same broker quote at the
  // same time. Reuse one in-flight cTrader request for the same account/symbol
  // instead of opening several concurrent WebSocket sessions.
  const inflight = ctraderQuoteInflight.get(cacheKey)
  if (inflight) return inflight

  const request = (async () => {
    const socket = await openSocket(endpointFor(environment))
    try {
      await authenticateApplication(socket)
      await authenticateAccount(socket, account, accessToken)
      await ctraderRequest(socket, 2127, {
        ctidTraderAccountId: account,
        symbolId: [id],
        subscribeToSpotTimestamp: true,
      }, (message) => message.payloadType === 2128)
      const spot = await ctraderRequest(socket, 2131, {}, (message) => message.payloadType === 2131 && Number(message.payload?.symbolId) === id, 10000)
      const body = asObject(spot.payload)
      const quote = {
        symbolId: Number(body.symbolId),
        bid: body.bid == null ? undefined : decodePrice(body.bid),
        ask: body.ask == null ? undefined : decodePrice(body.ask),
        timestamp: body.timestamp ? new Date(Number(body.timestamp)).toISOString() : new Date().toISOString(),
      }
      ctraderQuoteCache.set(cacheKey, { quote, expiresAt: Date.now() + CTRADER_QUOTE_CACHE_MS })
      return quote
    } finally {
      await closeSocket(socket)
    }
  })()

  ctraderQuoteInflight.set(cacheKey, request)
  try {
    return await request
  } finally {
    if (ctraderQuoteInflight.get(cacheKey) === request) ctraderQuoteInflight.delete(cacheKey)
  }
}

export const getCtraderMargin = async ({ environment, accountId, accessToken, symbolId, volume }) => {
  const account = requirePositiveInt('account ID', accountId)
  const id = requirePositiveInt('symbol ID', symbolId)
  const requestedVolume = requirePositiveInt('volume', volume)
  const response = await authenticatedRequest({
    environment,
    accessToken,
    accountId: String(account),
    payloadType: 2139,
    payload: { ctidTraderAccountId: account, symbolId: id, volume: [requestedVolume] },
    matcher: (message) => message.payloadType === 2140,
  })
  const body = asObject(response.payload)
  const margin = Array.isArray(body.margin) ? body.margin[0] : null
  const moneyDigits = asNumber(body.moneyDigits, 8)
  return {
    buyMargin: margin ? decodeMoney(margin.buyMargin, moneyDigits) : null,
    sellMargin: margin ? decodeMoney(margin.sellMargin, moneyDigits) : null,
    moneyDigits,
  }
}

export const placeCtraderOrder = async ({ environment, accountId, accessToken, fullSymbol, order }) => {
  const account = requirePositiveInt('account ID', accountId)
  const symbolId = requirePositiveInt('symbol ID', fullSymbol?.symbolId)
  const volume = ctraderLotsToProtocolVolume(order.quantity, fullSymbol)
  const payload = {
    ctidTraderAccountId: account,
    symbolId,
    orderType: order.type === 'LIMIT' ? 2 : order.type === 'STOP' ? 3 : order.type === 'STOP_LIMIT' ? 6 : 1,
    tradeSide: order.side === 'SELL' ? 2 : 1,
    volume,
    ...(order.limitPrice !== undefined ? { limitPrice: Number(order.limitPrice) } : {}),
    ...(order.stopPrice !== undefined ? { stopPrice: Number(order.stopPrice) } : {}),
    ...(order.stopLoss !== undefined ? { stopLoss: Number(order.stopLoss) } : {}),
    ...(order.takeProfit !== undefined ? { takeProfit: Number(order.takeProfit) } : {}),
    ...(order.clientOrderId ? { clientOrderId: order.clientOrderId } : {}),
    label: 'SHAFX',
    comment: 'SHAFX manual CFD',
  }
  const response = await authenticatedRequest({
    environment,
    accessToken,
    accountId,
    payloadType: 2106,
    payload,
    matcher: (message) => message.payloadType === 2126,
    timeoutMs: 20000,
  })
  return asObject(response.payload)
}

export const amendCtraderPosition = async ({ environment, accountId, accessToken, positionId, stopLoss, takeProfit }) => {
  const payload = {
    ctidTraderAccountId: Number(accountId),
    positionId: Number(positionId),
    ...(stopLoss == null ? {} : { stopLoss: Number(stopLoss) }),
    ...(takeProfit == null ? {} : { takeProfit: Number(takeProfit) }),
  }
  const response = await authenticatedRequest({
    environment,
    accessToken,
    accountId,
    payloadType: 2110,
    payload,
    matcher: (message) => message.payloadType === 2126,
    timeoutMs: 15000,
  })
  return asObject(response.payload)
}

export const closeCtraderPosition = async ({ environment, accountId, accessToken, positionId, volume }) => {
  const account = requirePositiveInt('account ID', accountId)
  const position = requirePositiveInt('position ID', positionId)
  const closeVolume = requirePositiveInt('volume', volume)
  const payload = {
    ctidTraderAccountId: account,
    positionId: position,
    volume: closeVolume,
  }
  const response = await authenticatedRequest({
    environment,
    accessToken,
    accountId,
    payloadType: 2111,
    payload,
    matcher: (message) => message.payloadType === 2126,
    timeoutMs: 15000,
  })
  return asObject(response.payload)
}

export const reconcileCtrader = async ({ environment, accountId, accessToken }) => {
  const account = requirePositiveInt('account ID', accountId)
  const response = await authenticatedRequest({
    environment,
    accessToken,
    accountId: String(account),
    payloadType: 2124,
    payload: { ctidTraderAccountId: account, returnProtectionOrders: false },
    matcher: (message) => message.payloadType === 2125,
  })
  return asObject(response.payload)
}

export const normalizeCtraderPosition = (position, pnlById = {}, instrument = {}) => {
  const item = asObject(position)
  const tradeData = asObject(item.tradeData)
  const moneyDigits = asNumber(item.moneyDigits, 8)
  const volumeProtocol = asNumber(tradeData.volume)
  const lotSizeProtocol = asNumber(instrument?.lotSize)
  const lots = lotSizeProtocol > 0 ? volumeProtocol / lotSizeProtocol : 0
  const pnl = pnlById[String(item.positionId)]
  return {
    id: String(item.positionId || ''),
    symbolId: String(tradeData.symbolId || ''),
    side: Number(tradeData.tradeSide) === 2 ? 'SELL' : 'BUY',
    volumeProtocol,
    lots,
    entryPrice: asNumber(item.price),
    currentPrice: undefined,
    stopLoss: item.stopLoss == null ? null : asNumber(item.stopLoss),
    takeProfit: item.takeProfit == null ? null : asNumber(item.takeProfit),
    unrealizedPL: pnl == null ? undefined : asNumber(pnl),
    usedMargin: item.usedMargin == null ? undefined : decodeMoney(item.usedMargin, moneyDigits),
    currency: undefined,
    metadata: {
      provider: 'ctrader',
      positionStatus: String(item.positionStatus || ''),
      commission: item.commission == null ? undefined : decodeMoney(item.commission, moneyDigits),
      volumeProtocol: String(volumeProtocol || ''),
      lotSizeProtocol: String(lotSizeProtocol || ''),
      openTimestamp: tradeData.openTimestamp == null ? undefined : String(tradeData.openTimestamp),
      label: tradeData.label || '',
      comment: tradeData.comment || '',
      symbolId: String(tradeData.symbolId || ''),
      positionId: String(item.positionId || ''),
    },
  }
}

export const normalizeCtraderOrder = (event) => {
  const payload = asObject(event)
  const item = asObject(payload.order && typeof payload.order === 'object' ? payload.order : payload)
  const position = asObject(payload.position)
  const deal = asObject(payload.deal)
  const tradeData = asObject(item.tradeData)
  const positionTradeData = asObject(position.tradeData)
  const statusMap = { 1: 'accepted', 2: 'accepted', 3: 'filled', 4: 'rejected', 5: 'cancelled', 6: 'cancelled', 7: 'rejected', 8: 'rejected', 11: 'accepted' }
  const executionType = Number(payload.executionType)
  const status = item.orderStatus != null
    ? (statusMap[Number(item.orderStatus)] || 'pending')
    : (statusMap[executionType] || 'pending')
  const providerOrderId = String(item.orderId || deal.orderId || '')
  const positionId = String(
    position.positionId ??
    item.positionId ??
    deal.positionId ??
    '',
  )
  const clientOrderId = item.clientOrderId == null ? undefined : String(item.clientOrderId)
  const symbolId = String(
    tradeData.symbolId ??
    positionTradeData.symbolId ??
    deal.symbolId ??
    '',
  )
  const executionPrice = Number(
    item.executionPrice ??
    deal.executionPrice ??
    position.price ??
    0,
  )
  const protocolVolume = asNumber(
    item.executedVolume ??
    deal.filledVolume ??
    tradeData.volume ??
    positionTradeData.volume ??
    deal.volume ??
    0,
  )
  return {
    providerOrderId,
    positionId: positionId || undefined,
    status,
    clientOrderId,
    symbol: symbolId,
    side: Number(tradeData.tradeSide ?? positionTradeData.tradeSide ?? deal.tradeSide) === 2 ? 'SELL' : 'BUY',
    quantity: protocolVolume,
    executionPrice: executionPrice > 0 ? executionPrice : undefined,
    timestamp: item.utcLastUpdateTimestamp || deal.utcLastUpdateTimestamp
      ? new Date(Number(item.utcLastUpdateTimestamp || deal.utcLastUpdateTimestamp)).toISOString()
      : new Date().toISOString(),
    message: String(payload.errorCode || payload.description || ''),
    raw: payload,
  }
}

export const refreshAndStoreCtraderAccounts = async ({ userId, connectionId, environment, accessToken }) => {
  const accounts = await listCtraderAccounts(accessToken)
  const assetRows = []
  for (const env of ['demo', 'live']) {
    try { assetRows.push(...await getCtraderAssets({ environment: env, accountId: String(accounts[0]?.ctidTraderAccountId || ''), accessToken })) } catch {}
  }
  const assetNames = Object.fromEntries(assetRows.map((asset) => [String(asset.assetId), String(asset.name || asset.displayName || asset.assetId)]))
  const rows = []
  for (const account of accounts) {
    const accountId = String(account.ctidTraderAccountId || '')
    if (!accountId) continue
    const isLive = Boolean(account.isLive)
    const env = isLive ? 'live' : 'demo'
    try {
      const trader = await getCtraderTrader({ environment: env, accountId, accessToken })
      const moneyDigits = asNumber(trader.moneyDigits, 8)
      const balance = decodeMoney(trader.balance, moneyDigits)
      let accountCurrency = assetNames[String(trader.depositAssetId || '')] || 'USD'
      try {
        const accountAssets = await getCtraderAssets({ environment: env, accountId, accessToken })
        const names = Object.fromEntries(accountAssets.map((asset) => [String(asset.assetId), String(asset.name || asset.displayName || asset.assetId)]))
        accountCurrency = names[String(trader.depositAssetId || '')] || accountCurrency
      } catch {}
      rows.push({
        accountId,
        accountLabel: [account.brokerTitleShort || 'cTrader', account.traderLogin ? '#' + account.traderLogin : '', env === 'live' ? 'Live' : 'Demo'].filter(Boolean).join(' • '),
        environment: env,
        currency: accountCurrency,
        balance,
        equity: undefined,
        usedMargin: undefined,
        freeMargin: undefined,
        floatingPL: undefined,
        metadata: {
          ctidTraderAccountId: accountId,
          traderLogin: account.traderLogin == null ? '' : String(account.traderLogin),
          brokerTitleShort: account.brokerTitleShort || '',
          isLive: isLive ? 'true' : 'false',
          accessScope: 'trading',
          moneyDigits: String(moneyDigits),
        },
      })
    } catch {
      rows.push({
        accountId,
        accountLabel: [account.brokerTitleShort || 'cTrader', env === 'live' ? 'Live' : 'Demo'].join(' • '),
        environment: env,
        currency: 'USD',
        balance: 0,
        metadata: { ctidTraderAccountId: accountId, brokerTitleShort: account.brokerTitleShort || '', isLive: isLive ? 'true' : 'false', accessScope: 'trading' },
      })
    }
  }
  return rows
}

export const syncCtraderAccountsForConnection = async ({ userId, connectionId, environment, accessToken }) => {
  const accounts = await refreshAndStoreCtraderAccounts({ userId, connectionId, environment, accessToken })
  return syncProviderAccounts({ connectionId, userId, providerId: 'ctrader', accounts })
}

export const getStoredCtraderAccountState = async ({ userId, connectionId, accountId }) => {
  const account = await getProviderAccount(userId, connectionId, String(accountId))
  if (!account) throw new Error('Selected cTrader account was not found.')
  return account
}

export const buildCtraderPositionPnlMap = async ({ environment, accountId, accessToken }) => {
  const response = await authenticatedRequest({
    environment,
    accessToken,
    accountId,
    payloadType: 2187,
    payload: { ctidTraderAccountId: Number(accountId) },
    matcher: (message) => message.payloadType === 2188,
  })
  const body = asObject(response.payload)
  const moneyDigits = asNumber(body.moneyDigits, 8)
  const rows = Array.isArray(body.positionUnrealizedPnL) ? body.positionUnrealizedPnL : []
  return Object.fromEntries(rows.map((row) => [String(row.positionId), decodeMoney(row.netUnrealizedPnL, moneyDigits)]))
}
