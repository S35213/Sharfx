import type { TradeOrder } from '../../types'

export interface SimulationPulseInput {
  openPositions: TradeOrder[]
  tradeHistory: TradeOrder[]
  botOrderIds: string[]
  botRunning: boolean
}

export interface SimulationPulseStats {
  botRunning: number
  openBotPositions: number
  closedBotTrades: number
  activeSimulatorSessions: number
}

export function buildSimulationPulseStats(input: SimulationPulseInput): SimulationPulseStats {
  const ids = new Set(input.botOrderIds)
  return {
    botRunning: input.botRunning ? 1 : 0,
    openBotPositions: input.openPositions.filter((trade) => ids.has(trade.id) && trade.status === 'open').length,
    closedBotTrades: input.tradeHistory.filter((trade) => ids.has(trade.id) && trade.status === 'closed').length,
    activeSimulatorSessions: 1,
  }
}
