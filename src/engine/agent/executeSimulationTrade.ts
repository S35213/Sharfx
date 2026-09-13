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

  const draft: SimulatedOrderDraft = {
    symbol: input.symbolSpec.symbol,
    type: decision.setup.direction,
    lotSize: plan.lotSize,
    entryPrice: decision.setup.entryPrice,
    stopLoss: decision.setup.stopLoss,
    takeProfit: decision.setup.takeProfit,
    riskPercent: plan.riskPercent,
    riskAmount: plan.estimatedLoss,
    rewardAmount: plan.estimatedReward,
    riskRewardRatio: plan.risk.riskRewardRatio,
  }

  return { decision, plan, order: submitSimulatedOrder(draft) }
}
