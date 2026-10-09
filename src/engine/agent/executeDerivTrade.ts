import { decideAgentAction } from './decideAgentAction'
import { prepareTradePlan } from './prepareTradePlan'
import type { AgentContext } from './types'
import type { SymbolSpec, TradeOrder } from '../../types'

export interface ExecuteDerivTradeInput {
  context: AgentContext
  accountBalance: number
  accountCurrency: string
  riskPercent: number
  symbolSpec: SymbolSpec
  conversionRate?: number
  lotSize?: number
  connectionId: string
  accountId: string
  environment: 'demo' | 'live'
}

export interface ExecuteDerivTradeResult {
  decision: ReturnType<typeof decideAgentAction>
  plan: ReturnType<typeof prepareTradePlan> | null
  order: TradeOrder | null
}

// Broker execution is deliberately disabled while the SHAFX test project
// rebuilds its Deriv-native bridge. The analysis/planning layer remains useful,
// but it cannot turn a signal into a broker order by itself.
export const executeDerivTrade = async (input: ExecuteDerivTradeInput): Promise<ExecuteDerivTradeResult> => {
  const decision = decideAgentAction(input.context)
  const setup = decision.setup
  if (decision.action !== 'EXECUTE_TRADE' || !setup) return { decision, plan: null, order: null }

  const plan = prepareTradePlan({
    setup,
    accountBalance: input.accountBalance,
    accountCurrency: input.accountCurrency,
    riskPercent: input.riskPercent,
    symbolSpec: input.symbolSpec,
    conversionRate: input.conversionRate,
  })

  return {
    decision: {
      ...decision,
      action: 'WAIT',
      rationale: 'SHAFX broker execution is paused while the Deriv-native manual bridge is being rebuilt.',
    },
    plan,
    order: null,
  }
}
