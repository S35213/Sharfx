import { decideAgentAction } from './decideAgentAction'
import { prepareTradePlan } from './prepareTradePlan'
import { placeDerivContract } from '../../data/deriv/derivTrading'
import type { AgentContext } from './types'
import type { SymbolSpec, TradeOrder } from '../../types'


const accountAffordableLotCeiling = (accountBalance: number, plan: ReturnType<typeof prepareTradePlan>): number => {
  if (!Number.isFinite(accountBalance) || accountBalance <= 0 || !Number.isFinite(plan.estimatedLoss) || plan.estimatedLoss <= 0 || !Number.isFinite(plan.lotSize) || plan.lotSize <= 0) return 0
  const lossPerLot = plan.estimatedLoss / plan.lotSize
  if (!Number.isFinite(lossPerLot) || lossPerLot <= 0) return 0
  return accountBalance / lossPerLot
}

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
  if (!plan.isValid) return { decision, plan, order: null }

  const lotSize = input.lotSize ?? plan.lotSize
  const lotStepValid = Math.abs((lotSize / input.symbolSpec.lotStep) - Math.round(lotSize / input.symbolSpec.lotStep)) < 1e-8
  if (!Number.isFinite(lotSize) || lotSize < input.symbolSpec.minLotSize || lotSize > input.symbolSpec.maxLotSize || !lotStepValid) {
    return { decision, plan: { ...plan, isValid: false, summary: 'Trade size is outside the selected symbol rules.' }, order: null }
  }

  const accountLotCeiling = accountAffordableLotCeiling(input.accountBalance, plan)
  if (!Number.isFinite(accountLotCeiling) || accountLotCeiling <= 0 || lotSize > accountLotCeiling + 1e-8) {
    return { decision, plan: { ...plan, isValid: false, summary: 'Trade size exceeds the Deriv account balance when converted to the bot stake.' }, order: null }
  }

  const multiplier = 100
  const lotMultiplier = plan.lotSize > 0 ? lotSize / plan.lotSize : 1
  const estimatedLoss = Number((plan.estimatedLoss * lotMultiplier).toFixed(2))
  const stake = estimatedLoss
  const estimatedReward = Number((plan.estimatedReward * lotMultiplier).toFixed(2))
  if (!Number.isFinite(stake) || stake < 1) {
    return {
      decision,
      plan: { ...plan, isValid: false, summary: 'Deriv minimum stake is 1 ' + input.accountCurrency + '. Current calculated risk is ' + stake.toFixed(2) + '.' },
      order: null,
    }
  }

  const order = await placeDerivContract({
    connection: {
      connectionId: input.connectionId,
      accountId: input.accountId,
      environment: input.environment,
    },
    symbol: input.symbolSpec.symbol,
    side: setup.direction,
    stake,
    currency: input.accountCurrency,
    multiplier,
    durationSeconds: 30,
    takeProfitAmount: estimatedReward,
    stopLossAmount: estimatedLoss,
    entryPrice: setup.entryPrice,
    stopLoss: setup.stopLoss,
    takeProfit: setup.takeProfit,
    riskPercent: plan.riskPercent,
    riskAmount: estimatedLoss,
    rewardAmount: estimatedReward,
    riskRewardRatio: plan.risk.riskRewardRatio,
  })

  return { decision, plan, order }
}
