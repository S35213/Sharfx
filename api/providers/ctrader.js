import { randomUUID } from 'node:crypto'
import { apiRequestGuard } from '../../server/authSecurity.js'
import {
  buildCtraderAuthUrl,
  buildCtraderPositionPnlMap,
  cTraderConfigured,
  exchangeCtraderCode,
  getCtraderAssets,
  getCtraderMargin,
  getCtraderQuote,
  getCtraderSymbols,
  getCtraderTrader,
  loadCtraderConnection,
  normalizeCtraderInstrument,
  normalizeCtraderOrder,
  normalizeCtraderPosition,
  placeCtraderOrder,
  amendCtraderPosition,
  closeCtraderPosition,
  reconcileCtrader,
  syncCtraderAccountsForConnection,
  ctraderLotsToProtocolVolume,
  resolveCtraderSymbol,
} from '../../server/ctrader.js'
import {
  createProviderConnection,
  createProviderSecret,
  getProviderAccount,
  getShafxUser,
  recordProviderAudit,
  upsertProviderAccount,
} from '../../server/providerConnections.js'

const json = (res, status, body) => res.status(status).json(body)
const cookie = (req, name) => (req.headers?.cookie || '')
  .split(';')
  .map((part) => part.trim())
  .find((part) => part.startsWith(name + '='))
  ?.slice(name.length + 1) || null
const setCookie = (res, value) => res.setHeader('Set-Cookie', value)
const oauthStateCookie = 'shafx_ctrader_oauth_state'
const accountEnvironment = (account) => account?.environment === 'live' ? 'live' : 'demo'
const assetNamesById = (assets) => Object.fromEntries((Array.isArray(assets) ? assets : []).map((asset) => [String(asset.assetId), String(asset.name || asset.displayName || asset.assetId)]))
const symbolNameById = (symbols) => Object.fromEntries((Array.isArray(symbols) ? symbols : []).map((symbol) => [String(symbol.symbolId), String(symbol.name || symbol.symbolName || symbol.symbolId)]))

const normalizePositionForApi = (position, symbolNames, pnlMap) => {
  const normalized = normalizeCtraderPosition(position, pnlMap)
  const symbolId = String(normalized.metadata?.symbolId || normalized.symbolId || '')
  return { ...normalized, symbol: symbolNames[symbolId] || symbolId }
}

const authorizeUser = async (req, res) => {
  const user = await getShafxUser(req)
  if (!user) { json(res, 401, { ok: false, error: 'SHAFX sign-in is required.' }); return null }
  return user
}

const handleLogin = async (req, res) => {
  if (!cTraderConfigured()) return json(res, 503, { ok: false, error: 'cTrader Open API is not configured on this SHAFX Render service yet.' })
  const state = randomUUID()
  setCookie(res, [oauthStateCookie + '=' + encodeURIComponent(state), 'Path=/', 'HttpOnly', 'Secure', 'SameSite=Lax', 'Max-Age=600'].join('; '))
  res.redirect(302, buildCtraderAuthUrl(state))
}

const handleCallback = async (req, res, user, query) => {
  const expectedState = cookie(req, oauthStateCookie)
  const state = String(query.get('state') || '')
  if (!expectedState || !state || expectedState !== state) return json(res, 400, { ok: false, error: 'cTrader OAuth state mismatch. Start the connection again.' })
  const providerError = String(query.get('error') || '')
  if (providerError) return json(res, 400, { ok: false, error: 'cTrader authorization was denied: ' + providerError })
  const code = String(query.get('code') || '')
  if (!code) return json(res, 400, { ok: false, error: 'cTrader authorization code was not returned.' })
  const token = await exchangeCtraderCode(code)
  const secretRef = await createProviderSecret({
    secret: JSON.stringify({ accessToken: token.accessToken, refreshToken: token.refreshToken, expiresAt: Date.now() + Number(token.expiresIn || 0) * 1000, tokenType: token.tokenType || 'bearer' }),
    name: 'SHAFX cTrader OAuth token',
    description: 'cTrader Open API account authorization for this SHAFX user.',
  })
  const connection = await createProviderConnection({
    userId: user.id, providerId: 'ctrader', label: 'Deriv cTrader', environment: 'mixed', state: 'connected', authMethod: 'oauth2', credentialRef: secretRef,
    expiresAt: new Date(Date.now() + Number(token.expiresIn || 0) * 1000).toISOString(), metadata: { scope: 'trading', selectedAccountId: null },
  })
  const accounts = await syncCtraderAccountsForConnection({ userId: user.id, connectionId: connection.id, environment: 'demo', accessToken: token.accessToken })
  if (!accounts.length) {
    setCookie(res, [oauthStateCookie + '=', 'Path=/', 'HttpOnly', 'Secure', 'SameSite=Lax', 'Max-Age=0'].join('; '))
    return res.redirect(302, '/?ctrader=activate-required')
  }
  setCookie(res, [oauthStateCookie + '=', 'Path=/', 'HttpOnly', 'Secure', 'SameSite=Lax', 'Max-Age=0'].join('; '))
  res.redirect(302, '/?ctrader=connected&account=' + encodeURIComponent(String(accounts[0].providerAccountId || accounts[0].accountId)))
}

const readContext = async (user, connectionId, accountId) => {
  const account = await getProviderAccount(user.id, connectionId, String(accountId || ''))
  if (!account) throw new Error('Selected cTrader account is not available.')
  return loadCtraderConnection({ userId: user.id, connectionId, accountId: String(accountId), environment: accountEnvironment(account) })
}

const handleGet = async (req, res, user) => {
  const query = new URL(req.url || '/', 'http://shafx.local').searchParams
  const op = String(query.get('op') || '')
  if (op === 'login') return handleLogin(req, res)
  if (op === 'callback') return handleCallback(req, res, user, query)
  return json(res, 400, { ok: false, error: 'Unsupported cTrader operation.' })
}

const handlePost = async (req, res, user, body) => {
  const connectionId = String(body.connectionId || '')
  const accountId = String(body.accountId || '')
  if (!connectionId || !accountId) return json(res, 400, { ok: false, error: 'cTrader connectionId and accountId are required.' })
  const context = await readContext(user, connectionId, accountId)
  const { tokens } = context
  const action = String(body.action || '')

  if (action === 'accounts') {
    const accounts = await syncCtraderAccountsForConnection({ userId: user.id, connectionId, environment: context.environment, accessToken: tokens.accessToken })
    return json(res, 200, { ok: true, accounts: accounts.map((account) => ({ accountId: account.providerAccountId || account.accountId, accountLabel: account.label || account.accountId, environment: account.environment, currency: account.currency || 'USD', balance: account.balance, equity: account.equity, usedMargin: account.usedMargin, freeMargin: account.freeMargin, floatingPL: account.floatingPL })) })
  }

  if (action === 'account') {
    const trader = await getCtraderTrader({ environment: context.environment, accountId, accessToken: tokens.accessToken })
    const assets = await getCtraderAssets({ environment: context.environment, accountId, accessToken: tokens.accessToken })
    const names = assetNamesById(assets)
    const moneyDigits = Number(trader.moneyDigits || 8)
    const accountCurrency = names[String(trader.depositAssetId || '')] || 'USD'
    const [pnlMap, reconcile, symbols] = await Promise.all([
      buildCtraderPositionPnlMap({ environment: context.environment, accountId, accessToken: tokens.accessToken }),
      reconcileCtrader({ environment: context.environment, accountId, accessToken: tokens.accessToken }),
      getCtraderSymbols({ environment: context.environment, accountId, accessToken: tokens.accessToken }),
    ])
    const symbolNames = symbolNameById(symbols)
    const positions = (Array.isArray(reconcile.position) ? reconcile.position : []).map((position) => normalizePositionForApi(position, symbolNames, pnlMap))
    const floatingPL = positions.reduce((sum, item) => sum + Number(item.unrealizedPL || 0), 0)
    const usedMargin = positions.reduce((sum, item) => sum + Number(item.usedMargin || 0), 0)
    const balance = Number(trader.balance || 0) / (10 ** moneyDigits)
    const account = { accountId, accountLabel: context.connection.label || 'Deriv cTrader', environment: context.environment, currency: accountCurrency, balance, equity: balance + floatingPL, usedMargin, freeMargin: balance + floatingPL - usedMargin, floatingPL }
    await upsertProviderAccount({ connectionId, userId: user.id, providerId: 'ctrader', account })
    return json(res, 200, { ok: true, account })
  }

  if (action === 'reconcile') {
    const [reconcile, pnlMap, symbols] = await Promise.all([
      reconcileCtrader({ environment: context.environment, accountId, accessToken: tokens.accessToken }),
      buildCtraderPositionPnlMap({ environment: context.environment, accountId, accessToken: tokens.accessToken }),
      getCtraderSymbols({ environment: context.environment, accountId, accessToken: tokens.accessToken }),
    ])
    const symbolNames = symbolNameById(symbols)
    const positions = (Array.isArray(reconcile.position) ? reconcile.position : []).map((position) => normalizePositionForApi(position, symbolNames, pnlMap))
    const orders = (Array.isArray(reconcile.order) ? reconcile.order : []).map(normalizeCtraderOrder)
    return json(res, 200, { ok: true, positions, orders })
  }

  if (action === 'instruments') {
    const requested = String(body.symbol || '').trim()
    const symbols = await getCtraderSymbols({ environment: context.environment, accountId, accessToken: tokens.accessToken })
    const selected = requested ? symbols.filter((item) => { const n = String(item.name || item.symbolName || '').toUpperCase(); return n === requested.toUpperCase() || n.replace('/', '') === requested.toUpperCase().replace('/', '') }) : symbols.slice(0, 25)
    const instruments = []
    for (const light of selected.slice(0, requested ? 2 : 25)) {
      try {
        const full = await resolveCtraderSymbol({ environment: context.environment, accountId, accessToken: tokens.accessToken, symbol: String(light.name || requested) })
        instruments.push(normalizeCtraderInstrument(full))
      } catch {}
    }
    return json(res, 200, { ok: true, instruments })
  }

  if (action === 'quote') {
    const full = await resolveCtraderSymbol({ environment: context.environment, accountId, accessToken: tokens.accessToken, symbol: String(body.symbol || '') })
    const quote = await getCtraderQuote({ environment: context.environment, accountId, accessToken: tokens.accessToken, symbolId: full.symbolId })
    return json(res, 200, { ok: true, quote: { symbol: String(full.name || body.symbol || ''), bid: quote.bid, ask: quote.ask, last: quote.ask ?? quote.bid, timestamp: quote.timestamp }, instrument: normalizeCtraderInstrument(full) })
  }

  if (action === 'margin') {
    const full = await resolveCtraderSymbol({ environment: context.environment, accountId, accessToken: tokens.accessToken, symbol: String(body.symbol || '') })
    const volume = ctraderLotsToProtocolVolume(Number(body.lots), full)
    const margin = await getCtraderMargin({ environment: context.environment, accountId, accessToken: tokens.accessToken, symbolId: full.symbolId, volume })
    return json(res, 200, { ok: true, margin, volumeProtocol: volume, instrument: normalizeCtraderInstrument(full) })
  }

  if (action === 'placeOrder') {
    if (context.environment !== 'demo') return json(res, 403, { ok: false, error: 'SHAFX live cTrader execution is still disabled. Use a cTrader practice account.' })
    const order = body.order && typeof body.order === 'object' ? body.order : {}
    const full = await resolveCtraderSymbol({ environment: context.environment, accountId, accessToken: tokens.accessToken, symbol: String(order.symbol || '') })
    const result = await placeCtraderOrder({ environment: context.environment, accountId, accessToken: tokens.accessToken, fullSymbol: full, order })
    const normalized = normalizeCtraderOrder(result.order || result)
    await recordProviderAudit({ userId: user.id, connectionId, accountId, eventType: 'demo_order_placed', metadata: { provider: 'ctrader', providerOrderId: normalized.providerOrderId, symbol: order.symbol, side: order.side, lots: order.quantity } })
    return json(res, 200, { ok: true, order: { ...normalized, symbol: String(full.name || order.symbol || ''), raw: result } })
  }

  if (action === 'modifyPosition') {
    if (context.environment !== 'demo') return json(res, 403, { ok: false, error: 'SHAFX live cTrader modification is still disabled. Use a cTrader practice account.' })
    const result = await amendCtraderPosition({ environment: context.environment, accountId, accessToken: tokens.accessToken, positionId: String(body.positionId), stopLoss: body.stopLoss == null ? null : Number(body.stopLoss), takeProfit: body.takeProfit == null ? null : Number(body.takeProfit) })
    return json(res, 200, { ok: true, order: normalizeCtraderOrder(result.order || result) })
  }

  if (action === 'closePosition') {
    if (context.environment !== 'demo') return json(res, 403, { ok: false, error: 'SHAFX live cTrader close is still disabled. Use a cTrader practice account.' })
    const reconcile = await reconcileCtrader({ environment: context.environment, accountId, accessToken: tokens.accessToken })
    const position = (Array.isArray(reconcile.position) ? reconcile.position : []).find((item) => String(item.positionId) === String(body.positionId))
    if (!position) return json(res, 404, { ok: false, error: 'cTrader position was not found.' })
    const result = await closeCtraderPosition({ environment: context.environment, accountId, accessToken: tokens.accessToken, positionId: String(body.positionId), volume: Number(position.tradeData?.volume || 0) })
    const normalized = normalizeCtraderOrder(result.order || result)
    await recordProviderAudit({ userId: user.id, connectionId, accountId, eventType: 'demo_position_closed', metadata: { provider: 'ctrader', positionId: String(body.positionId) } })
    return json(res, 200, { ok: true, order: normalized })
  }

  return json(res, 400, { ok: false, error: 'Unsupported cTrader provider action.' })
}

export default async function handler(req, res) {
  const guard = await apiRequestGuard(req, 'api:ctrader', 300)
  if (!guard.allowed) return res.status(guard.status).json({ ok: false, error: guard.error, retryAfterSeconds: guard.retryAfterSeconds })
  try {
    const user = await authorizeUser(req, res)
    if (!user) return
    if (req.method === 'GET') return handleGet(req, res, user)
    if (req.method === 'POST') {
      const body = typeof req.body === 'object' && req.body ? req.body : {}
      return handlePost(req, res, user, body)
    }
    return json(res, 405, { ok: false, error: 'Method not allowed.' })
  } catch (error) {
    return json(res, 500, { ok: false, error: error instanceof Error ? error.message : 'cTrader provider service failed.' })
  }
}