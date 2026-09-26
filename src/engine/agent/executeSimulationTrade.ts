import { decideAgentAction } from './decideAgentAction'
import { prepareTradePlan, type TradePlan } from './prepareTradePlan'
import { submitSimulatedOrder } from '../simulator/submitSimulatedOrder'
import type { AgentContext } from './types'
import type { SetupCandidate } from '../setup/types'
import type { SimulatedOrderDraft, SymbolSpec, TradeOrder } from '../../types'

const SIMULATOR_LEVERAGE = 100

const accountMarginLotCeiling = (input: ExecuteSimulationTradeInput, setup: SetupCandidate): number => {
  if (!Number.isFinite(input.accountBalance) || input.accountBalance <= 0) return 0
  let exposurePerLot = input.symbolSpec.contractSize
  if (input.symbolSpec.quoteCurrency === input.accountCurrency) exposurePerLot = input.symbolSpec.contractSize * setup.entryPrice
  else if (input.symbolSpec.baseCurrency !== input.accountCurrency) {
    if (typeof input.conversionRate !== 'number' || !Number.isFinite(input.conversionRate) || input.conversionRate <= 0) return 0
    exposurePerLot = input.symbolSpec.contractSize * setup.entryPrice * input.conversionRate
  }
  return input.accountBalance * SIMULATOR_LEVERAGE / exposurePerLot
}

const buildAccountOnlyPlan = (input: ExecuteSimulationTradeInput, setup: SetupCandidate): TradePlan | null => {
  const ceiling = accountMarginLotCeiling(input, setup)
  const lotSize = Math.min(input.symbolSpec.maxLotSize, Math.floor(ceiling / input.symbolSpec.lotStep + 1e-9) * input.symbolSpec.lotStep)
  if (!Number.isFinite(lotSize) || lotSize < input.symbolSpec.minLotSize) return null
  const stopDistancePips = Math.abs(setup.entryPrice - setup.stopLoss) / input.symbolSpec.pipSize
  const rewardDistancePips = Math.abs(setup.takeProfit - setup.entryPrice) / input.symbolSpec.pipSize
  const quoteRate = input.symbolSpec.quoteCurrency === input.accountCurrency ? 1 : input.conversionRate ?? 0
  const pipValuePerLot = input.symbolSpec.pipSize * input.symbolSpec.contractSize * quoteRate
  if (!Number.isFinite(stopDistancePips) || !Number.isFinite(rewardDistancePips) || !Number.isFinite(pipValuePerLot) || pipValuePerLot <= 0) return null
  const estimatedLoss = Number((lotSize * stopDistancePips * pipValuePerLot).toFixed(2))
  const estimatedReward = Number((lotSize * rewardDistancePips * pipValuePerLot).toFixed(2))
  const riskRewardRatio = rewardDistancePips / stopDistancePips
  return {
    isValid: true,
    setup,
    risk: {
      isValid: true,
      riskAmount: estimatedLoss,
      stopDistancePips: Number(stopDistancePips.toFixed(1)),
      rewardDistancePips: Number(rewardDistancePips.toFixed(1)),
      riskRewardRatio: Number(riskRewardRatio.toFixed(2)),
      suggestedLotSize: Number(lotSize.toFixed(8)),
      pipValuePerLot: Number(pipValuePerLot.toFixed(4)),
      estimatedLossAtStop: estimatedLoss,
    },
    riskPercent: input.riskPercent,
    lotSize: Number(lotSize.toFixed(8)),
    estimatedLoss,
    estimatedReward,
    summary: `${setup.direction} plan uses account-affordable sizing at ${lotSize.toFixed(2)} lots.`,
  }
}

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

  if (!setup && input.allowSimulationFallback && decision.permission === 'AUTONOMOUS_TRADING' && !input.context.hasOpenPosition) {
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

  if (decision.action !== 'EXECUTE_TRADE' && !setup) return { decision, plan: null, order: null }
  if (!setup) return { decision, plan: null, order: null }

  let plan = prepareTradePlan({
    setup,
    accountBalance: input.accountBalance,
    accountCurrency: input.accountCurrency,
    riskPercent: input.riskPercent,
    symbolSpec: input.symbolSpec,
    conversionRate: input.conversionRate,
  })
  // Do not reject a trade solely because the selected risk profile produces a
  // sub-minimum lot. The account/margin check below is the execution safety gate.
  if (!plan.isValid) {
    const accountOnlyPlan = buildAccountOnlyPlan(input, setup)
    if (!accountOnlyPlan) return { decision, plan, order: null }
    plan = accountOnlyPlan
  }

  const lotSize = input.lotSize ?? plan.lotSize
  const lotStepValid = Math.abs((lotSize / input.symbolSpec.lotStep) - Math.round(lotSize / input.symbolSpec.lotStep)) < 1e-8
  if (!Number.isFinite(lotSize) || lotSize < input.symbolSpec.minLotSize || lotSize > input.symbolSpec.maxLotSize || !lotStepValid) {
    return { decision, plan: { ...plan, isValid: false, summary: `Lot size must be between ${input.symbolSpec.minLotSize} and ${input.symbolSpec.maxLotSize} using step ${input.symbolSpec.lotStep}.` }, order: null }
  }

  const marginCeiling = accountMarginLotCeiling(input, setup)
  if (!Number.isFinite(marginCeiling) || marginCeiling <= 0 || lotSize > marginCeiling + 1e-8) {
    return { decision, plan: { ...plan, isValid: false, summary: `Lot size ${lotSize.toFixed(2)} exceeds the account-affordable margin ceiling of ${Math.max(0, marginCeiling).toFixed(2)} lots at ${SIMULATOR_LEVERAGE}:1 leverage.` }, order: null }
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
