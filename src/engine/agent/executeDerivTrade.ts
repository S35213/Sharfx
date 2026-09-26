import { decideAgentAction } from './decideAgentAction'
import { prepareTradePlan } from './prepareTradePlan'
import { placeDerivContract } from '../../data/deriv/derivTrading'
import type { AgentContext } from './types'
import type { SetupCandidate } from '../setup/types'
import type { SymbolSpec, TradeOrder } from '../../types'

const LEVERAGE = 100

const accountMarginLotCeiling = (accountBalance: number, accountCurrency: string, symbolSpec: SymbolSpec, setup: SetupCandidate, conversionRate?: number): number => {
  if (!Number.isFinite(accountBalance) || accountBalance <= 0) return 0
  let exposurePerLot = symbolSpec.contractSize
  if (symbolSpec.quoteCurrency === accountCurrency) exposurePerLot = symbolSpec.contractSize * setup.entryPrice
  else if (symbolSpec.baseCurrency !== accountCurrency) {
    if (!Number.isFinite(conversionRate) || Number(conversionRate) <= 0) return 0
    exposurePerLot = symbolSpec.contractSize * setup.entryPrice * Number(conversionRate)
  }
  return accountBalance * LEVERAGE / exposurePerLot
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

  const marginCeiling = accountMarginLotCeiling(input.accountBalance, input.accountCurrency, input.symbolSpec, setup, input.conversionRate)
  if (!Number.isFinite(marginCeiling) || marginCeiling <= 0 || lotSize > marginCeiling + 1e-8) {
    return { decision, plan: { ...plan, isValid: false, summary: 'Trade size exceeds the selected Deriv account margin ceiling.' }, order: null }
  }

  const multiplier = 10
  const lotMultiplier = plan.lotSize > 0 ? lotSize / plan.lotSize : 1
  const estimatedLoss = Number((plan.estimatedLoss * lotMultiplier).toFixed(2))
  const estimatedReward = Number((plan.estimatedReward * lotMultiplier).toFixed(2))

  const order = await placeDerivContract({
    connection: {
      connectionId: input.connectionId,
      accountId: input.accountId,
      environment: input.environment,
    },
    symbol: input.symbolSpec.symbol,
    side: setup.direction,
    stake: lotSize,
    multiplier,
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
