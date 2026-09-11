import type { SimulatedOrderDraft, SymbolSpec } from '../../types'
import type { TradePlan } from './prepareTradePlan'

export interface ApprovalInput {
  approvedByUser: boolean
  plan: TradePlan
  accountCurrency: string
  symbolSpec: SymbolSpec
}

export const approveSimulationTrade = (input: ApprovalInput): SimulatedOrderDraft => {
  if (!input.approvedByUser) throw new Error('User approval is required before simulated execution.')
  if (!input.plan.isValid || !input.plan.risk.isValid) throw new Error('The trade plan is not risk-valid.')
  const setup = input.plan.setup
  return {
    symbol: input.symbolSpec.symbol,
    type: setup.direction,
    lotSize: input.plan.lotSize,
    entryPrice: setup.entryPrice,
    stopLoss: setup.stopLoss,
    takeProfit: setup.takeProfit,
    riskPercent: input.plan.riskPercent,
    riskAmount: input.plan.estimatedLoss,
    rewardAmount: input.plan.estimatedReward,
    riskRewardRatio: input.plan.risk.riskRewardRatio,
  }
}
