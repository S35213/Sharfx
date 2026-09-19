import type { TradeOrder } from '../../types'

export interface SimulationFlowPoint {
  id: string
  time: string
  price: number | null
  side: 'BUY' | 'SELL'
  kind: 'OPEN' | 'CLOSE'
  profit: number
}

export function buildSimulationFlow(openPositions: TradeOrder[], tradeHistory: TradeOrder[]): SimulationFlowPoint[] {
  const open = openPositions.map((trade) => ({
    id: trade.id + '-open',
    time: trade.openTime,
    price: trade.entryPrice,
    side: trade.type,
    kind: 'OPEN' as const,
    profit: 0,
  }))
  const closed = tradeHistory.map((trade) => ({
    id: trade.id + '-close',
    time: trade.closeTime ?? trade.openTime,
    price: null,
    side: trade.type,
    kind: 'CLOSE' as const,
    profit: trade.profit ?? 0,
  }))
  return [...open, ...closed].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
}
