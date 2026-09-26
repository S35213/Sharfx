import type { TradeOrder } from '../../types'
import type { SetupCandidate } from '../setup/types'

export interface DerivOrderConnection {
  connectionId: string
  accountId: string
  environment: 'demo' | 'live'
}

interface PlaceInput {
  connection: DerivOrderConnection
  symbol: string
  side: 'BUY' | 'SELL'
  stake: number
  multiplier?: number
  takeProfitAmount?: number
  stopLossAmount?: number
  entryPrice: number
  stopLoss?: number | null
  takeProfit?: number | null
  riskPercent: number
  riskAmount: number
  rewardAmount: number
  riskRewardRatio: number
  setup?: SetupCandidate | null
}

export async function placeDerivContract(input: PlaceInput): Promise<TradeOrder> {
  const response = await fetch('/api/deriv/order', {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'place',
      connectionId: input.connection.connectionId,
      accountId: input.connection.accountId,
      order: {
        symbol: input.symbol,
        side: input.side,
        quantity: input.stake,
        stake: input.stake,
        multiplier: input.multiplier ?? 10,
        takeProfitAmount: input.rewardAmount,
        stopLossAmount: input.riskAmount,
        entryPrice: input.entryPrice,
        stopLoss: input.stopLoss ?? null,
        takeProfit: input.takeProfit ?? null,
        riskPercent: input.riskPercent,
      },
    }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || !payload?.ok || !payload?.order) {
    throw new Error(typeof payload?.error === 'string' ? payload.error : 'Unable to place the Deriv trade.')
  }

  const providerOrder = payload.order
  return {
    id: String(providerOrder.providerOrderId),
    symbol: input.symbol.replace('/', ''),
    type: input.side,
    lotSize: input.stake,
    entryPrice: input.entryPrice,
    stopLoss: input.stopLoss ?? null,
    takeProfit: input.takeProfit ?? null,
    riskPercent: input.riskPercent,
    riskAmount: input.riskAmount,
    rewardAmount: input.rewardAmount,
    riskRewardRatio: input.riskRewardRatio,
    status: 'open',
    openTime: providerOrder.timestamp || new Date().toISOString(),
  } as TradeOrder
}

export async function closeDerivContract(connection: DerivOrderConnection, providerOrderId: string, fallbackOrder?: TradeOrder | null): Promise<TradeOrder | null> {
  const response = await fetch('/api/deriv/order', {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'sell',
      connectionId: connection.connectionId,
      accountId: connection.accountId,
      providerOrderId,
    }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || !payload?.ok || !payload?.order) {
    if (/already|expired|closed/i.test(String(payload?.error || ''))) {
      return fallbackOrder ? { ...fallbackOrder, status: 'closed', closeTime: new Date().toISOString(), profit: Number(payload?.order?.raw?.profit ?? 0) } : null
    }
    throw new Error(typeof payload?.error === 'string' ? payload.error : 'Unable to close the Deriv trade.')
  }
  const raw = payload.order?.raw || {}
  const profit = Number(raw.profit)
  return {
    ...(fallbackOrder || { id: providerOrderId, symbol: '', type: 'BUY', lotSize: 0, entryPrice: 0, stopLoss: null, takeProfit: null, riskPercent: 0, riskAmount: 0, rewardAmount: 0, riskRewardRatio: 0, status: 'open', openTime: new Date().toISOString() }),
    status: 'closed',
    closeTime: payload.order.timestamp || new Date().toISOString(),
    profit: Number.isFinite(profit) ? profit : undefined,
  } as TradeOrder
}
