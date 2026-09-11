import { calculateRisk } from '../risk/riskCalculator'
import type { SetupCandidate } from '../setup/types'
import type { RiskCalculationResult, SymbolSpec } from '../../types'

export interface TradePlanInput {
  setup: SetupCandidate
  accountBalance: number
  accountCurrency: string
  riskPercent: number
  symbolSpec: SymbolSpec
  conversionRate?: number
}

export interface TradePlan {
  isValid: boolean
  setup: SetupCandidate
  risk: RiskCalculationResult
  riskPercent: number
  lotSize: number
  estimatedLoss: number
  estimatedReward: number
  summary: string
}

export const prepareTradePlan = (input: TradePlanInput): TradePlan => {
  const risk = calculateRisk({ accountBalance: input.accountBalance, accountCurrency: input.accountCurrency, riskPercent: input.riskPercent, side: input.setup.direction, entryPrice: input.setup.entryPrice, stopLoss: input.setup.stopLoss, takeProfit: input.setup.takeProfit, symbolSpec: input.symbolSpec, conversionRate: input.conversionRate })
  if (!risk.isValid) return { isValid: false, setup: input.setup, risk, riskPercent: input.riskPercent, lotSize: 0, estimatedLoss: 0, estimatedReward: 0, summary: risk.errorMessage ?? 'The trade plan failed risk validation.' }
  const estimatedReward = Number((risk.estimatedLossAtStop * risk.riskRewardRatio).toFixed(2))
  return { isValid: true, setup: input.setup, risk, riskPercent: input.riskPercent, lotSize: risk.suggestedLotSize, estimatedLoss: risk.estimatedLossAtStop, estimatedReward, summary: `${input.setup.direction} plan validated at ${risk.suggestedLotSize.toFixed(2)} lots with ${risk.riskRewardRatio.toFixed(2)}R reward potential.` }
}
