import type { TradeOrder, TradeSide } from '../../types'

export interface DerivOrderConnection {
  connectionId: string
  accountId: string
  environment: 'demo' | 'live'
}

export interface DerivQuoteInput {
  connection: DerivOrderConnection
  symbol: string
  side: TradeSide
  stake: number
  currency?: string
  multiplier: number
  stopLossAmount?: number
  takeProfitAmount?: number
}

export interface DerivProposalQuote {
  proposalId: string
  symbol: string
  side: TradeSide
  contractType: 'MULTUP' | 'MULTDOWN'
  stake: number
  multiplier: number
  currency: string
  askPrice: number
  payout?: number
  commission?: number
  spot?: number
  potentialProfit?: number
  stopLossAmount?: number
  takeProfitAmount?: number
  quotedAt: string
}

interface DerivBuyInput {
  connection: DerivOrderConnection
  quote: DerivProposalQuote
}

interface ProviderOrderPayload {
  providerOrderId?: string
  stake?: number
  multiplier?: number
  timestamp?: string
  raw?: {
    contractId?: string | number
    spot?: number | string
    profit?: number | string
  }
}

interface OrderApiPayload {
  ok?: boolean
  quote?: DerivProposalQuote
  order?: ProviderOrderPayload
  stage?: string
  error?: string
}

const postOrderApi = async (body: Record<string, unknown>): Promise<OrderApiPayload> => {
  const response = await fetch('/api/deriv/order', {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const payload = (await response.json().catch(() => ({}))) as OrderApiPayload
  if (!response.ok || !payload.ok) {
    const stage = typeof payload?.stage === 'string' ? payload.stage + ': ' : ''
    throw new Error(stage + (typeof payload?.error === 'string' ? payload.error : 'Deriv request failed.'))
  }
  return payload
}

export async function getDerivQuote(input: DerivQuoteInput): Promise<DerivProposalQuote> {
  const payload = await postOrderApi({
    action: 'quote',
    connectionId: input.connection.connectionId,
    accountId: input.connection.accountId,
    order: {
      symbol: input.symbol,
      side: input.side,
      stake: input.stake,
      currency: input.currency,
      multiplier: input.multiplier,
      stopLossAmount: input.stopLossAmount ?? 0,
      takeProfitAmount: input.takeProfitAmount ?? 0,
    },
  })
  if (!payload.quote) throw new Error('Deriv did not return a proposal quote.')
  return payload.quote
}

export async function buyDerivProposal(input: DerivBuyInput): Promise<TradeOrder> {
  const payload = await postOrderApi({
    action: 'buy',
    connectionId: input.connection.connectionId,
    accountId: input.connection.accountId,
    proposalId: input.quote.proposalId,
    askPrice: input.quote.askPrice,
    quote: input.quote,
  })
  if (!payload.order) throw new Error('Deriv did not return a purchased contract.')
  return normalizeTradeOrder(payload.order, input.quote)
}

const normalizeTradeOrder = (providerOrder: ProviderOrderPayload, quote: DerivProposalQuote): TradeOrder => {
  const stake = Number(providerOrder.stake ?? quote.stake)
  const multiplier = Number(providerOrder.multiplier ?? quote.multiplier)
  const providerOrderId = String(providerOrder.providerOrderId ?? providerOrder.raw?.contractId ?? '')
  const entryPrice = Number(providerOrder.raw?.spot ?? quote.spot ?? 0)
  const stopLossAmount = Number(quote.stopLossAmount ?? 0)
  const takeProfitAmount = Number(quote.takeProfitAmount ?? 0)
  const risk = Number.isFinite(stopLossAmount) && stopLossAmount > 0 ? stopLossAmount : stake
  const reward = Number.isFinite(takeProfitAmount) && takeProfitAmount > 0 ? takeProfitAmount : 0
  const riskRewardRatio = risk > 0 && reward > 0 ? reward / risk : 0
  return {
    id: providerOrderId || crypto.randomUUID(),
    symbol: quote.symbol,
    type: quote.side,
    lotSize: stake,
    entryPrice: Number.isFinite(entryPrice) ? entryPrice : 0,
    stopLoss: null,
    takeProfit: null,
    riskPercent: 0,
    riskAmount: risk,
    rewardAmount: reward,
    riskRewardRatio,
    status: 'open',
    openTime: providerOrder?.timestamp || new Date().toISOString(),
    providerOrderId: providerOrderId || undefined,
    brokerProduct: 'DERIV_MULTIPLIER',
    stake: Number.isFinite(stake) ? stake : quote.stake,
    multiplier: Number.isFinite(multiplier) ? multiplier : quote.multiplier,
    stopLossAmount: stopLossAmount > 0 ? stopLossAmount : undefined,
    takeProfitAmount: takeProfitAmount > 0 ? takeProfitAmount : undefined,
  }
}

// Kept for legacy engine compatibility. The SHAFX test UI does not use this
// path; the broker bridge now requires a quote-then-confirm flow.
export async function placeDerivContract(input: {
  connection: DerivOrderConnection
  symbol: string
  side: TradeSide
  stake: number
  currency?: string
  multiplier?: number
  durationSeconds?: number
  takeProfitAmount?: number
  stopLossAmount?: number
  entryPrice: number
  stopLoss?: number | null
  takeProfit?: number | null
  riskPercent: number
  riskAmount: number
  rewardAmount: number
  riskRewardRatio: number
}): Promise<TradeOrder> {
  const quote = await getDerivQuote({
    connection: input.connection,
    symbol: input.symbol,
    side: input.side,
    stake: input.stake,
    currency: input.currency,
    multiplier: input.multiplier ?? 100,
    stopLossAmount: input.stopLossAmount,
    takeProfitAmount: input.takeProfitAmount,
  })
  return buyDerivProposal({ connection: input.connection, quote })
}

export async function closeDerivContract(connection: DerivOrderConnection, providerOrderId: string, fallbackOrder?: TradeOrder | null): Promise<TradeOrder | null> {
  const payload = await postOrderApi({
    action: 'sell',
    connectionId: connection.connectionId,
    accountId: connection.accountId,
    providerOrderId,
  })
  if (!payload?.order) return fallbackOrder ? { ...fallbackOrder, status: 'closed', closeTime: new Date().toISOString() } : null
  const raw = payload.order?.raw || {}
  const profit = Number(raw.profit)
  return {
    ...(fallbackOrder || {
      id: providerOrderId,
      symbol: '',
      type: 'BUY',
      lotSize: 0,
      entryPrice: 0,
      stopLoss: null,
      takeProfit: null,
      riskPercent: 0,
      riskAmount: 0,
      rewardAmount: 0,
      riskRewardRatio: 0,
      status: 'open',
      openTime: new Date().toISOString(),
    }),
    status: 'closed',
    closeTime: payload.order.timestamp || new Date().toISOString(),
    profit: Number.isFinite(profit) ? profit : undefined,
  } as TradeOrder
}
