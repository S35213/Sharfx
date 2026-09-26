import { apiRequestGuard } from '../../server/authSecurity.js'
import {
  getProviderConnection,
  getShafxUser,
  readProviderSecret,
  recordProviderAudit,
} from '../../server/providerConnections.js'

const DERIV_API = 'https://api.derivws.com/trading/v1/options'
const toDerivSymbol = (symbol) => {
  const normalized = String(symbol || '').replace('/', '').toUpperCase()
  return normalized.length === 6 ? 'frx' + normalized : String(symbol || '')
}

const requestWebSocketUrl = async (token, accountId) => {
  const response = await fetch(DERIV_API + '/accounts/' + encodeURIComponent(accountId) + '/otp', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token },
  })
  const data = await response.json().catch(() => ({}))
  const url = data?.data?.url
  if (!response.ok || typeof url !== 'string' || !url) {
    throw new Error('Deriv did not provide an authenticated trading WebSocket.')
  }
  return url
}

const withSocket = async (url, fn) => {
  const socket = new WebSocket(url)
  let timeout
  try {
    await new Promise((resolve, reject) => {
      timeout = setTimeout(() => reject(new Error('Deriv trading connection timed out.')), 10000)
      socket.addEventListener('open', () => { clearTimeout(timeout); resolve() }, { once: true })
      socket.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('Deriv trading connection failed.')) }, { once: true })
    })
    return await fn(socket)
  } finally {
    clearTimeout(timeout)
    try { socket.close() } catch {}
  }
}

const sendAndWait = (socket, request, expectedReqId) => new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error('Deriv trading request timed out.')), 10000)
  const onMessage = (event) => {
    try {
      const payload = JSON.parse(String(event.data))
      if (Number(payload?.echo_req?.req_id) !== expectedReqId && Number(payload?.req_id) !== expectedReqId) return
      clearTimeout(timeout)
      socket.removeEventListener('message', onMessage)
      if (payload?.error?.message) reject(new Error(payload.error.message))
      else resolve(payload)
    } catch (error) {
      clearTimeout(timeout)
      socket.removeEventListener('message', onMessage)
      reject(error)
    }
  }
  socket.addEventListener('message', onMessage)
  socket.send(JSON.stringify(request))
})

const providerIdFor = (symbol) => toDerivSymbol(symbol)

const requireConnection = async (req) => {
  const user = await getShafxUser(req)
  if (!user) throw new Error('SHAFX sign-in is required.')
  const connectionId = typeof req.body?.connectionId === 'string' ? req.body.connectionId : ''
  const accountId = typeof req.body?.accountId === 'string' ? req.body.accountId : ''
  if (!connectionId || !accountId) throw new Error('A connected Deriv account is required.')
  const connection = await getProviderConnection(user.id, connectionId, true)
  if (!connection || connection.provider_id !== 'deriv') throw new Error('Deriv connection not found.')
  if (connection.state !== 'connected') throw new Error('Deriv connection is ' + connection.state + '.')
  if (connection.expires_at && new Date(connection.expires_at).getTime() <= Date.now()) throw new Error('Deriv authorization has expired. Reconnect Deriv.')
  if (String(connection.metadata?.accountCount || '') === '0') throw new Error('No Deriv trading accounts are available.')
  const token = await readProviderSecret(connection.credential_ref)
  return { user, connection, accountId, token }
}

const normalizeBuy = (payload, request) => {
  const buy = payload?.buy || {}
  const contractId = String(buy.contract_id ?? buy.contract_id || '')
  if (!contractId) throw new Error('Deriv did not return a contract ID.')
  const buyPrice = Number(buy.buy_price ?? buy.price ?? 0)
  const spot = Number(buy.start_spot ?? buy.start_spot_display_value ?? 0)
  return {
    providerOrderId: contractId,
    status: 'filled',
    clientOrderId: request.clientOrderId,
    symbol: request.symbol,
    side: request.side,
    quantity: Number(request.quantity),
    timestamp: new Date().toISOString(),
    message: 'Deriv contract purchased.',
    raw: { contractId, buyPrice, spot },
  }
}

const place = async (req) => {
  const { user, connection, accountId, token } = await requireConnection(req)
  const order = req.body?.order && typeof req.body.order === 'object' ? req.body.order : {}
  const symbol = String(order.symbol || '')
  const side = order.side === 'SELL' ? 'SELL' : 'BUY'
  const currency = String(order.currency || '')
  const stake = Number(order.stake ?? order.quantity)
  const durationSeconds = Math.max(5, Math.min(3600, Math.trunc(Number(order.durationSeconds) || 30)))
  if (!symbol || !currency || !Number.isFinite(stake) || stake <= 0) throw new Error('Deriv trade requires a valid symbol, currency and stake.')
  const wsUrl = await requestWebSocketUrl(token, accountId)

  const result = await withSocket(wsUrl, async (socket) => {
    const proposal = await sendAndWait(socket, {
      proposal: 1,
      amount: stake,
      basis: 'stake',
      contract_type: side === 'BUY' ? 'CALL' : 'PUT',
      currency,
      duration: durationSeconds,
      duration_unit: 's',
      underlying_symbol: toDerivSymbol(symbol),
      req_id: 1,
    }, 1)
    const proposalId = String(proposal?.proposal?.id || '')
    const askPrice = Number(proposal?.proposal?.ask_price)
    if (!proposalId || !Number.isFinite(askPrice) || askPrice <= 0) throw new Error('Deriv did not return a valid trade proposal.')
    const buy = await sendAndWait(socket, {
      buy: proposalId,
      price: askPrice,
      req_id: 2,
    }, 2)
    return normalizeBuy(buy, { ...order, symbol, side, quantity: stake })
  })

  await recordProviderAudit({
    userId: user.id,
    connectionId: connection.id,
    accountId,
    eventType: 'deriv_order_placed',
    metadata: {
      provider: 'deriv',
      accountId,
      contractId: result.providerOrderId,
      symbol,
      side,
      stake,
      durationSeconds,
      environment: connection.environment,
    },
  })
  return result
}

const sell = async (req) => {
  const { user, connection, accountId, token } = await requireConnection(req)
  const contractId = String(req.body?.providerOrderId || req.body?.positionId || '')
  if (!contractId) throw new Error('Deriv contract ID is required to close the trade.')
  const wsUrl = await requestWebSocketUrl(token, accountId)
  const result = await withSocket(wsUrl, async (socket) => {
    const response = await sendAndWait(socket, {
      sell: Number(contractId),
      price: 0,
      req_id: 3,
    }, 3)
    const soldFor = Number(response?.sell?.sold_for ?? response?.sell?.sell_price ?? 0)
    const buyPrice = Number(response?.sell?.buy_price ?? 0)
    const profit = Number.isFinite(soldFor) && Number.isFinite(buyPrice) ? Number((soldFor - buyPrice).toFixed(2)) : undefined
    return {
      providerOrderId: contractId,
      status: 'filled',
      timestamp: new Date().toISOString(),
      message: 'Deriv contract closed.',
      raw: { soldFor, buyPrice, profit },
    }
  })
  await recordProviderAudit({
    userId: user.id,
    connectionId: connection.id,
    accountId,
    eventType: 'deriv_order_closed',
    metadata: { provider: 'deriv', accountId, contractId },
  })
  return result
}

export default async function handler(req, res) {
  const guard = await apiRequestGuard(req, 'api:deriv-order', 30)
  if (!guard.allowed) return res.status(guard.status).json({ ok: false, error: guard.error, retryAfterSeconds: guard.retryAfterSeconds })
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })
  res.setHeader('Cache-Control', 'no-store')
  try {
    const action = String(req.body?.action || 'place')
    const result = action === 'sell' ? await sell(req) : await place(req)
    return res.status(200).json({ ok: true, order: result })
  } catch (error) {
    return res.status(400).json({ ok: false, error: error instanceof Error ? error.message : 'Deriv trade request failed.' })
  }
}
