import { decideAgentAction } from './decideAgentAction'
import { prepareTradePlan } from './prepareTradePlan'
import { submitSimulatedOrder } from '../simulator/submitSimulatedOrder'
import type { AgentContext } from './types'
import type { SetupCandidate } from '../setup/types'
import type { SimulatedOrderDraft, SymbolSpec, TradeOrder } from '../../types'

export interface ExecuteSimulationTradeInput {
  context: AgentContext
  accountBalance: number
  accountCurrency: string
  riskPercent: number
  symbolSpec: SymbolSpec
  conversionRate?: number
  lotSize?: number
  allowSimulationFallback?: boolean
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
  let setup = decision.setup

  if (!setup && input.allowSimulationFallback && decision.permission === 'AUTONOMOUS_SIMULATION' && !input.context.hasOpenPosition) {
    const marketBias = input.context.tradingContext.marketStructure.bias
    const recent = input.context.tradingContext.recentCandles
    const momentumUp = recent.length > 1 && recent[recent.length - 1].close >= recent[recent.length - 2].close
    const direction = marketBias === 'Bullish' ? 'BUY' : marketBias === 'Bearish' ? 'SELL' : momentumUp ? 'BUY' : 'SELL'
    const distance = input.symbolSpec.pipSize * 30
    const reward = input.symbolSpec.pipSize * 50
    const entryPrice = input.context.tradingContext.currentPrice
    setup = {
      direction,
      status: 'candidate',
      quality: 'moderate',
      entryPrice,
      stopLoss: Number((entryPrice + (direction === 'BUY' ? -distance : distance)).toFixed(input.symbolSpec.pricePrecision)),
      takeProfit: Number((entryPrice + (direction === 'BUY' ? reward : -reward)).toFixed(input.symbolSpec.pricePrecision)),
      riskRewardRatio: 50 / 30,
      riskDistance: distance,
      rewardDistance: reward,
      confidence: 55,
      rationale: ['Simulator fallback execution was used after the normal setup gate returned no candidate.', 'Direction follows the current structure/momentum context.'],
      invalidation: 'The simulated stop loss invalidates this demo setup.',
      liquidityTarget: null,
    } satisfies SetupCandidate
  }

  if (decision.action !== 'EXECUTE_SIMULATION' && !setup) return { decision, plan: null, order: null }
  if (!setup) return { decision, plan: null, order: null }

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
    return { decision, plan: { ...plan, isValid: false, summary: `Lot size must be between ${input.symbolSpec.minLotSize} and ${input.symbolSpec.maxLotSize} using step ${input.symbolSpec.lotStep}.` }, order: null }
  }
  // Account-aware execution gate: a bot round may not use a manually selected
  // volume above the lot size supported by the selected risk budget.
  if (lotSize > plan.lotSize + 1e-8) {
    return { decision, plan: { ...plan, isValid: false, summary: `Lot size ${lotSize.toFixed(2)} exceeds the account-risk limit of ${plan.lotSize.toFixed(2)} lots for this setup.` }, order: null }
  }

  const lotMultiplier = plan.lotSize > 0 ? lotSize / plan.lotSize : 1
  const estimatedLoss = Number((plan.estimatedLoss * lotMultiplier).toFixed(2))
  const estimatedReward = Number((plan.estimatedReward * lotMultiplier).toFixed(2))
  const draft: SimulatedOrderDraft = {
    symbol: input.symbolSpec.symbol,
    type: setup.direction,
    lotSize,
    entryPrice: setup.entryPrice,
    stopLoss: setup.stopLoss,
    takeProfit: setup.takeProfit,
    riskPercent: plan.riskPercent,
    riskAmount: estimatedLoss,
    rewardAmount: estimatedReward,
    riskRewardRatio: plan.risk.riskRewardRatio,
  }

  return { decision, plan, order: submitSimulatedOrder(draft) }
}
