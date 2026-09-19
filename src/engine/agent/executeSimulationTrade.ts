import { decideAgentAction } from './decideAgentAction'
import { prepareTradePlan } from './prepareTradePlan'
import { submitSimulatedOrder } from '../simulator/submitSimulatedOrder'
import type { AgentContext } from './types'
import type { SimulatedOrderDraft, SymbolSpec, TradeOrder } from '../../types'

export interface ExecuteSimulationTradeInput {
  context: AgentContext
  accountBalance: number
  accountCurrency: string
  riskPercent: number
  symbolSpec: SymbolSpec
  conversionRate?: number
  lotSize?: number
}

export interface ExecuteSimulationTradeResult {
  decision: ReturnType<typeof decideAgentAction>
  plan: ReturnType<typeof prepareTradePlan> | null
  order: TradeOrder | null
}

/**
 * Autonomous paper-trading boundary for the SHAFX Bot.
 * It deliberately ends at submitSimulatedOrder: no broker/API/network call is possible here.
 */
export const executeSimulationTrade = (input: ExecuteSimulationTradeInput): ExecuteSimulationTradeResult => {
  const decision = decideAgentAction(input.context)
  if (decision.action !== 'EXECUTE_SIMULATION' || !decision.setup) return { decision, plan: null, order: null }

  const plan = prepareTradePlan({
    setup: decision.setup,
    accountBalance: input.accountBalance,
    accountCurrency: input.accountCurrency,
    riskPercent: input.riskPercent,
    symbolSpec: input.symbolSpec,
    conversionRate: input.conversionRate,
  })
  if (!plan.isValid) return { decision, plan, order: null }

  const lotSize = input.lotSize ?? plan.lotSize
  const lotStepValid = Math.abs((lotSize / input.symbolSpec.lotStep) - Math.round(lotSize / input.symbolSpec.lotStep)) < 1e-8
  if (!Number.isFinite(lotSize) || lotSize < input.symbolSpec.minLotSize || lotSize > input.symbolSpec.maxLotSize || !lotStepValid) {
    return { decision, plan: { ...plan, isValid: false, summary: `Lot size must be between ${input.symbolSpec.minLotSize} and ${input.symbolSpec.maxLotSize} using step ${input.symbolSpec.lotStep}.` }, order: null }
  }

  const lotMultiplier = plan.lotSize > 0 ? lotSize / plan.lotSize : 1
  const estimatedLoss = Number((plan.estimatedLoss * lotMultiplier).toFixed(2))
  const estimatedReward = Number((plan.estimatedReward * lotMultiplier).toFixed(2))
  const draft: SimulatedOrderDraft = {
    symbol: input.symbolSpec.symbol,
    type: decision.setup.direction,
    lotSize,
    entryPrice: decision.setup.entryPrice,
    stopLoss: decision.setup.stopLoss,
    takeProfit: decision.setup.takeProfit,
    riskPercent: plan.riskPercent,
    riskAmount: estimatedLoss,
    rewardAmount: estimatedReward,
    riskRewardRatio: plan.risk.riskRewardRatio,
  }

  return { decision, plan, order: submitSimulatedOrder(draft) }
}
