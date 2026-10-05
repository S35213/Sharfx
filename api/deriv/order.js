import { apiRequestGuard } from '../../server/authSecurity.js'
import {
  getProviderAccount,
  getProviderConnection,
  getShafxUser,
  readProviderSecret,
  recordProviderAudit,
} from '../../server/providerConnections.js'

const DERIV_API = 'https://api.derivws.com/trading/v1/options'
const MIN_STAKE = 10
const MAX_MULTIPLIER = 10000

const toDerivSymbol = (symbol) => {
  const normalized = String(symbol || '').replace('/', '').toUpperCase()
  return normalized.length === 6 ? 'frx' + normalized : String(symbol || '')
}

class StageError extends Error {
  constructor(stage, message) {
    super(message)
    this.stage = stage
  }
}

const requestWebSocketUrl = async (token, accountId) => {
  const response = await fetch(DERIV_API + '/accounts/' + encodeURIComponent(accountId) + '/otp', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token },
  })
  const data = await response.json().catch(() => ({}))
  const url = data?.data?.url
  if (!response.ok || typeof url !== 'string' || !url) {
    const detail = typeof data?.error?.message === 'string' ? data.error.message : typeof data?.message === 'string' ? data.message : 'Deriv did not provide an authenticated trading WebSocket.'
    throw new StageError('AUTH', 'Deriv trading connection failed (' + response.status + '): ' + detail)
  }
  return url
}

const withSocket = async (url, fn) => {
  const socket = new WebSocket(url)
  let timeout
  try {
    await new Promise((resolve, reject) => {
      timeout = setTimeout(() => reject(new StageError('AUTH', 'Deriv trading connection timed out.')), 10000)
      socket.addEventListener('open', () => { clearTimeout(timeout); resolve() }, { once: true })
      socket.addEventListener('error', () => { clearTimeout(timeout); reject(new StageError('AUTH', 'Deriv authenticated WebSocket failed to open.')) }, { once: true })
    })
    return await fn(socket)
  } finally {
    clearTimeout(timeout)
    try { socket.close() } catch {}
  }
}

const sendAndWait = (socket, request, expectedReqId, stage) => new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new StageError(stage, 'Deriv ' + stage.toLowerCase() + ' request timed out.')), 10000)
  const onMessage = (event) => {
    try {
      const payload = JSON.parse(String(event.data))
      if (Number(payload?.echo_req?.req_id) !== expectedReqId && Number(payload?.req_id) !== expectedReqId) return
      clearTimeout(timeout)
      socket.removeEventListener('message', onMessage)
      if (payload?.error?.message) reject(new StageError(stage, payload.error.message))
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

const requireConnection = async (req) => {
  const user = await getShafxUser(req)
  if (!user) throw new StageError('AUTH', 'SHAFX sign-in is required.')
  const connectionId = typeof req.body?.connectionId === 'string' ? req.body.connectionId : ''
  const accountId = typeof req.body?.accountId === 'string' ? req.body.accountId : ''
  if (!connectionId || !accountId) throw new StageError('ACCOUNT', 'A connected Deriv account is required.')

  const connection = await getProviderConnection(user.id, connectionId, true)
  if (!connection || connection.provider_id !== 'deriv') throw new StageError('AUTH', 'Deriv connection not found.')
  if (connection.state !== 'connected') throw new StageError('AUTH', 'Deriv connection is ' + connection.state + '.')
  if (connection.expires_at && new Date(connection.expires_at).getTime() <= Date.now()) throw new StageError('AUTH', 'Deriv authorization has expired. Reconnect Deriv.')
  if (String(connection.metadata?.accountCount || '') === '0') throw new StageError('ACCOUNT', 'No Deriv trading accounts are available.')

  const account = await getProviderAccount(user.id, connection.id, accountId)
  if (!account || !account.active || account.provider_id !== 'deriv') throw new StageError('ACCOUNT', 'Selected Deriv account is not available.')
  if (account.environment !== 'demo') throw new StageError('ACCOUNT', 'Live Deriv order execution is disabled in SHAFX release testing. Select the connected demo account.')

  const token = await readProviderSecret(connection.credential_ref)
  return { user, connection, account, accountId, token }
}

const normalizeBuy = (payload, request, quote) => {
  const buy = payload?.buy || {}
  const contractId = String(buy.contract_id ?? '')
  if (!contractId) throw new StageError('BUY', 'Deriv did not return a contract ID.')
  const buyPrice = Number(buy.buy_price ?? buy.price ?? quote.askPrice ?? 0)
  const spot = Number(buy.start_spot ?? buy.start_spot_display_value ?? 0)
  return {
    providerOrderId: contractId,
    status: 'filled',
    clientOrderId: request.clientOrderId,
    symbol: quote.symbol,
    side: quote.side,
    quantity: Number(quote.stake),
    stake: Number(quote.stake),
    multiplier: Number(quote.multiplier),
    timestamp: new Date().toISOString(),
    message: 'Deriv contract purchased.',
    raw: { contractId, buyPrice, spot, stake: quote.stake, multiplier: quote.multiplier },
  }
}

const buildQuoteRequest = (order, account) => {
  const symbol = String(order.symbol || '').trim()
  const side = order.side === 'SELL' ? 'SELL' : 'BUY'
  const stake = Number(order.stake)
  const multiplier = Number(order.multiplier)
  const currency = String(account.currency || order.currency || '').trim().toUpperCase()
  const stopLossAmount = Number(order.stopLossAmount)
  const takeProfitAmount = Number(order.takeProfitAmount)

  if (!symbol) throw new StageError('MARKET', 'Select a Deriv market before requesting a quote.')
  if (!currency) throw new StageError('ACCOUNT', 'The selected Deriv account has no currency.')
  if (!Number.isFinite(stake) || stake < MIN_STAKE) throw new StageError('ACCOUNT', 'SHAFX minimum multiplier stake is 10 ' + currency + '.')
  if (!Number.isFinite(multiplier) || multiplier <= 0 || multiplier > MAX_MULTIPLIER) throw new StageError('PROPOSAL', 'Enter a valid multiplier between 1 and ' + MAX_MULTIPLIER + '.')
  if (Number.isFinite(stopLossAmount) && stopLossAmount < 0) throw new StageError('PROPOSAL', 'Stop-loss amount cannot be negative.')
  if (Number.isFinite(takeProfitAmount) && takeProfitAmount < 0) throw new StageError('PROPOSAL', 'Take-profit amount cannot be negative.')

  return {
    symbol,
    side,
    stake,
    multiplier,
    currency,
    underlyingSymbol: toDerivSymbol(symbol),
    stopLossAmount: Number.isFinite(stopLossAmount) && stopLossAmount > 0 ? stopLossAmount : 0,
    takeProfitAmount: Number.isFinite(takeProfitAmount) && takeProfitAmount > 0 ? takeProfitAmount : 0,
  }
}

const acceptedMultipliersFromError = (message) => {
  const match = String(message || '').match(/accepts?\\s+([0-9,\\s]+)/i)
  if (!match) return []
  return [...match[1].matchAll(/\\d+(?:\\.\\d+)?/g)]
    .map((item) => Number(item[0]))
    .filter((value) => Number.isFinite(value) && value > 0)
}

const proposalRequest = (requested, durationVariant, reqId) => ({
  proposal: 1,
  amount: requested.stake,
  basis: 'stake',
  contract_type: requested.side === 'BUY' ? 'MULTUP' : 'MULTDOWN',
  currency: requested.currency,
  multiplier: requested.multiplier,
  underlying_symbol: requested.underlyingSymbol,
  ...durationVariant,
  subscribe: 1,
  req_id: reqId,
  ...(requested.stopLossAmount > 0 || requested.takeProfitAmount > 0
    ? {
        limit_order: {
          ...(requested.stopLossAmount > 0 ? { stop_loss: requested.stopLossAmount } : {}),
          ...(requested.takeProfitAmount > 0 ? { take_profit: requested.takeProfitAmount } : {}),
        },
      }
    : {}),
})

const getQuote = async (req) => {
  const { user, connection, accountId, token, account } = await requireConnection(req)
  const order = req.body?.order && typeof req.body.order === 'object' ? req.body.order : {}
  const requested = buildQuoteRequest(order, account)
  const wsUrl = await requestWebSocketUrl(token, accountId)

  try {
    const quote = await withSocket(wsUrl, async (socket) => {
      const balanceResponse = await sendAndWait(socket, { balance: 1, req_id: 1 }, 1, 'ACCOUNT')
      const balance = Number(balanceResponse?.balance?.balance)
      if (Number.isFinite(balance) && balance < requested.stake) {
        throw new StageError('ACCOUNT', 'Insufficient Deriv balance for the selected stake. Available: ' + balance.toFixed(2) + ' ' + requested.currency + '.')
      }

      // This is the SHAFX market contract check. Deriv is authoritative for
      // whether the selected underlying supports the requested contract family.
      await sendAndWait(socket, { contracts_for: requested.underlyingSymbol, req_id: 2 }, 2, 'MARKET')

      // Deriv's current Multiplier workflow treats the position as open-ended;
      // the official example sends duration_unit without a numeric duration.
      // Older SHAFX code hard-coded 24h, which Deriv rejected for MULTDOWN.
      // Keep a small compatibility fallback for accounts/markets that still
      // require an explicit short duration.
      const durationVariants = [
        { duration_unit: 's' },
        { duration: 300, duration_unit: 's' },
        { duration: 60, duration_unit: 's' },
      ]
      let proposalResponse = null
      let proposalError = null

      for (let index = 0; index < durationVariants.length; index += 1) {
        const proposalBody = proposalRequest(requested, durationVariants[index], 3 + index)

        try {
          proposalResponse = await sendAndWait(socket, proposalBody, 3 + index, 'PROPOSAL')
          proposalError = null
          break
        } catch (error) {
          proposalError = error
          const message = error instanceof Error ? error.message : String(error)
          const accepted = acceptedMultipliersFromError(message)
          if (accepted.length > 0) {
            throw new StageError(
              'PROPOSAL',
              'Multiplier ' + requested.multiplier + ' is not supported for this Deriv market/account. Accepted: ' + accepted.join(', ') + '.',
            )
          }
          if (!/duration|date_expiry/i.test(message) || index === durationVariants.length - 1) throw error
        }
      }

      if (!proposalResponse) {
        throw proposalError || new StageError('PROPOSAL', 'Deriv did not return a proposal.')
      }

      const proposal = proposalResponse?.proposal || {}
      const proposalId = String(proposal.id || '')
      const askPrice = Number(proposal.ask_price ?? proposal.display_value)
      if (!proposalId || !Number.isFinite(askPrice) || askPrice <= 0) {
        throw new StageError('PROPOSAL', 'Deriv returned an incomplete proposal.')
      }

      const payout = Number(proposal.payout)
      const commission = Number(proposal.commission)
      const spot = Number(proposal.spot ?? proposal.current_spot)
      return {
        proposalId,
        symbol: requested.symbol,
        side: requested.side,
        contractType: requested.side === 'BUY' ? 'MULTUP' : 'MULTDOWN',
        stake: requested.stake,
        multiplier: requested.multiplier,
        currency: requested.currency,
        askPrice,
        payout: Number.isFinite(payout) ? payout : undefined,
        commission: Number.isFinite(commission) ? commission : undefined,
        spot: Number.isFinite(spot) ? spot : undefined,
        potentialProfit: Number.isFinite(payout) ? Number((payout - requested.stake).toFixed(2)) : undefined,
        stopLossAmount: requested.stopLossAmount > 0 ? requested.stopLossAmount : undefined,
        takeProfitAmount: requested.takeProfitAmount > 0 ? requested.takeProfitAmount : undefined,
        quotedAt: new Date().toISOString(),
      }
    })

    await recordProviderAudit({
      userId: user.id,
      connectionId: connection.id,
      accountId,
      eventType: 'deriv_proposal_quoted',
      metadata: { provider: 'deriv', accountId, symbol: requested.symbol, side: requested.side, stake: requested.stake, multiplier: requested.multiplier, proposalId: quote.proposalId, environment: account.environment },
    })
    return quote
  } catch (error) {
    await recordProviderAudit({
      userId: user.id,
      connectionId: connection.id,
      accountId,
      eventType: 'deriv_proposal_failed',
      severity: 'error',
      metadata: { provider: 'deriv', accountId, symbol: requested.symbol, side: requested.side, stake: requested.stake, multiplier: requested.multiplier, environment: account.environment, error: error instanceof Error ? error.message : String(error) },
    })
    throw error
  }
}

const buy = async (req) => {
  const { user, connection, accountId, token, account } = await requireConnection(req)
  const quote = req.body?.quote && typeof req.body.quote === 'object' ? req.body.quote : {}
  const proposalId = String(req.body?.proposalId || '')
  const askPrice = Number(req.body?.askPrice)
  const symbol = String(quote.symbol || '').trim()
  const side = quote.side === 'SELL' ? 'SELL' : 'BUY'
  const stake = Number(quote.stake)
  const multiplier = Number(quote.multiplier)
  const currency = String(account.currency || quote.currency || '').trim().toUpperCase()
  const stopLossAmount = Number(quote.stopLossAmount)
  const takeProfitAmount = Number(quote.takeProfitAmount)

  if (!symbol || !Number.isFinite(stake) || !Number.isFinite(multiplier) || !currency) {
    throw new StageError('BUY', 'The quoted trade details are incomplete.')
  }

  const requested = buildQuoteRequest({
    symbol,
    side,
    stake,
    multiplier,
    currency,
    stopLossAmount,
    takeProfitAmount,
  }, account)
  const wsUrl = await requestWebSocketUrl(token, accountId)

  try {
    const result = await withSocket(wsUrl, async (socket) => {
      // A proposal can become unusable between the review screen and the
      // confirmation tap. Re-price immediately before buying, on the SAME
      // authenticated WebSocket, following Deriv's documented workflow.
      let freshProposal
      const durationVariants = [
        { duration_unit: 's' },
        { duration: 300, duration_unit: 's' },
        { duration: 60, duration_unit: 's' },
      ]
      let proposalError = null

      for (let index = 0; index < durationVariants.length; index += 1) {
        try {
          freshProposal = await sendAndWait(
            socket,
            proposalRequest(requested, durationVariants[index], 10 + index),
            10 + index,
            'PROPOSAL',
          )
          proposalError = null
          break
        } catch (error) {
          proposalError = error
          const message = error instanceof Error ? error.message : String(error)
          const accepted = acceptedMultipliersFromError(message)
          if (accepted.length > 0) {
            throw new StageError(
              'PROPOSAL',
              'Multiplier ' + requested.multiplier + ' is not supported for this Deriv market/account. Accepted: ' + accepted.join(', ') + '.',
            )
          }
          if (!/duration|date_expiry/i.test(message) || index === durationVariants.length - 1) throw error
        }
      }

      if (!freshProposal) throw proposalError || new StageError('PROPOSAL', 'Deriv did not return a fresh proposal.')

      const fresh = freshProposal?.proposal || {}
      const freshProposalId = String(fresh.id || '')
      const freshAskPrice = Number(fresh.ask_price ?? fresh.display_value)
      if (!freshProposalId || !Number.isFinite(freshAskPrice) || freshAskPrice <= 0) {
        throw new StageError('PROPOSAL', 'Deriv returned an incomplete proposal at confirmation.')
      }

      // Keep the confirmation price authoritative: never buy above the
      // freshly quoted ask. The original screen quote is display-only.
      const response = await sendAndWait(socket, {
        buy: freshProposalId,
        price: freshAskPrice,
        req_id: 20,
      }, 20, 'BUY')
      return normalizeBuy(response, req, {
        proposalId: freshProposalId,
        askPrice: freshAskPrice,
        symbol: requested.symbol,
        side: requested.side,
        stake: requested.stake,
        multiplier: requested.multiplier,
      })
    })

    await recordProviderAudit({
      userId: user.id,
      connectionId: connection.id,
      accountId,
      eventType: 'deriv_order_placed',
      metadata: { provider: 'deriv', accountId, contractId: result.providerOrderId, symbol: requested.symbol, side: requested.side, stake: requested.stake, multiplier: requested.multiplier, environment: account.environment },
    })
    return result
  } catch (error) {
    await recordProviderAudit({
      userId: user.id,
      connectionId: connection.id,
      accountId,
      eventType: 'deriv_order_failed',
      severity: 'error',
      metadata: { provider: 'deriv', accountId, symbol: requested.symbol, side: requested.side, stake: requested.stake, multiplier: requested.multiplier, environment: account.environment, error: error instanceof Error ? error.message : String(error) },
    })
    throw error
  }
}

const sell = async (req) => {
  const { user, connection, accountId, token } = await requireConnection(req)
  const contractId = String(req.body?.providerOrderId || req.body?.positionId || '')
  if (!contractId) throw new StageError('CLOSE', 'Deriv contract ID is required to close the trade.')

  const wsUrl = await requestWebSocketUrl(token, accountId)
  const result = await withSocket(wsUrl, async (socket) => {
    const response = await sendAndWait(socket, { sell: Number(contractId), price: 0, req_id: 1 }, 1, 'CLOSE')
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

// Legacy one-click placement is intentionally retained for old code paths, but
// the active SHAFX test UI uses quote -> confirm -> buy.
const placeLegacy = async (req) => {
  const quote = await getQuote(req)
  return buy({ ...req, body: { ...req.body, proposalId: quote.proposalId, askPrice: quote.askPrice, quote } })
}

export default async function handler(req, res) {
  const guard = await apiRequestGuard(req, 'api:deriv-order', 30)
  if (!guard.allowed) return res.status(guard.status).json({ ok: false, stage: 'SECURITY', error: guard.error, retryAfterSeconds: guard.retryAfterSeconds })
  if (req.method !== 'POST') return res.status(405).json({ ok: false, stage: 'HTTP', error: 'Method not allowed' })
  res.setHeader('Cache-Control', 'no-store')

  try {
    const action = String(req.body?.action || 'quote')
    if (action === 'quote') return res.status(200).json({ ok: true, quote: await getQuote(req) })
    if (action === 'buy') return res.status(200).json({ ok: true, order: await buy(req) })
    if (action === 'sell') return res.status(200).json({ ok: true, order: await sell(req) })
    if (action === 'place') return res.status(200).json({ ok: true, order: await placeLegacy(req) })
    throw new StageError('HTTP', 'Unknown Deriv order action.')
  } catch (error) {
    const stage = error instanceof StageError ? error.stage : 'DERIV'
    return res.status(400).json({ ok: false, stage, error: error instanceof Error ? error.message : 'Deriv trade request failed.' })
  }
}
