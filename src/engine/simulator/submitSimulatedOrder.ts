import type { SimulatedOrderDraft, TradeOrder } from '../../types'

const generateId = (): string => `SIM-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}`

const validateDraft = (draft: SimulatedOrderDraft): string | null => {
  if (!draft.symbol) return 'Symbol is required.'
  if (draft.type !== 'BUY' && draft.type !== 'SELL') return 'Side must be BUY or SELL.'
  if (!Number.isFinite(draft.lotSize) || draft.lotSize <= 0) return 'Lot size must be positive.'
  if (!Number.isFinite(draft.entryPrice) || draft.entryPrice <= 0) return 'Entry price must be positive.'
  if (draft.stopLoss === null || !Number.isFinite(draft.stopLoss) || draft.stopLoss <= 0) return 'Stop loss must be positive.'
  if (draft.takeProfit === null || !Number.isFinite(draft.takeProfit) || draft.takeProfit <= 0) return 'Take profit must be positive.'
  if (!Number.isFinite(draft.riskPercent) || draft.riskPercent <= 0 || draft.riskPercent > 100) return 'Risk % must be greater than 0 and at most 100.'
  if (!Number.isFinite(draft.riskAmount) || draft.riskAmount < 0) return 'Risk amount is invalid.'
  if (!Number.isFinite(draft.rewardAmount) || draft.rewardAmount < 0) return 'Reward amount is invalid.'
  if (!Number.isFinite(draft.riskRewardRatio) || draft.riskRewardRatio <= 0) return 'Risk/reward ratio is invalid.'
  if (draft.type === 'BUY') {
    if (draft.stopLoss >= draft.entryPrice) return 'Buy SL must be below entry.'
    if (draft.takeProfit <= draft.entryPrice) return 'Buy TP must be above entry.'
  } else {
    if (draft.stopLoss <= draft.entryPrice) return 'Sell SL must be above entry.'
    if (draft.takeProfit >= draft.entryPrice) return 'Sell TP must be below entry.'
  }
  return null
}

export const submitSimulatedOrder = (draft: SimulatedOrderDraft): TradeOrder => {
  const error = validateDraft(draft)
  if (error) throw new Error(`Invalid simulated order: ${error}`)
  return { ...draft, id: generateId(), status: 'open', openTime: new Date().toISOString() }
}
