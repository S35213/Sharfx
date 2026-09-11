import type { SimulatedOrderDraft } from '../../types'
import type { SetupCandidate } from '../setup/types'

export const setupToSimulatedOrder = (setup: SetupCandidate, symbol: string, lotSize: number, riskPercent: number, riskAmount: number): SimulatedOrderDraft => {
  if (setup.status !== 'candidate') throw new Error('Only valid setup candidates can be converted to an order.')
  if (!symbol.trim()) throw new Error('Symbol is required.')
  if (!Number.isFinite(lotSize) || lotSize <= 0) throw new Error('Lot size must be positive.')
  if (!Number.isFinite(riskPercent) || riskPercent <= 0) throw new Error('Risk % must be positive.')
  if (!Number.isFinite(riskAmount) || riskAmount <= 0) throw new Error('Risk amount must be positive.')
  return { symbol, type: setup.direction, lotSize, entryPrice: setup.entryPrice, stopLoss: setup.stopLoss, takeProfit: setup.takeProfit, riskPercent, riskAmount, rewardAmount: Number((riskAmount * setup.riskRewardRatio).toFixed(2)), riskRewardRatio: setup.riskRewardRatio }
}
