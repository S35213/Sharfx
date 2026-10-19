import { analyzeLiquidity } from '../liquidity'
import { analyzeMarketStructure, findSwingPoints } from '../marketStructure'
import { analyzeSetup } from '../setup'
import { analyzeSupportResistance } from '../supportResistance'
import { analyzeMultiTimeframeBias } from '../agent/multiTimeframe'
import { calculateCfdRiskPlan, type CfdRiskPlan } from '../../lib/cfdRiskEngine'
import { resolveTradeBotLotSize } from './tradeBotLotSizing'
import type { OHLCV, SymbolSpec, Timeframe } from '../../types'
import type { SetupCandidate } from '../setup/types'

export type TradeBotDecisionStatus = 'WAIT' | 'READY' | 'BLOCKED'

export interface TradeBotDecision {
  status: TradeBotDecisionStatus
  reason: string
  setup: SetupCandidate | null
  timeframe: Timeframe
  riskBudget: number
  riskPlan: CfdRiskPlan | null
  requestedLotSize?: number
  lotAdjustmentReason?: string | null
  higherTimeframeBias: 'Bullish' | 'Bearish' | 'Sideways' | 'Unclear'
}

export const tradeBotRiskBudget = (accountBalance: number): number => {
  if (!Number.isFinite(accountBalance) || accountBalance <= 0) return 0
  // Conservative first-pass ceiling: never exceed 0.5% of balance or 10 account-currency units.
  return Number(Math.min(10, accountBalance * 0.005).toFixed(2))
}

const wait = (
  timeframe: Timeframe,
  reason: string,
  riskBudget: number,
  higherTimeframeBias: TradeBotDecision['higherTimeframeBias'] = 'Unclear',
): TradeBotDecision => ({
  status: 'WAIT', reason, setup: null, timeframe, riskBudget, riskPlan: null, higherTimeframeBias,
})

export const evaluateTradeBotDecision = (input: {
  frames: Partial<Record<Timeframe, OHLCV[]>>
  symbol: string
  timeframe: Timeframe
  accountBalance: number
  accountCurrency: string
  symbolSpec: SymbolSpec | null
  /** User's requested maximum lot. The broker/risk rules may reduce it, never increase it. */
  requestedLots?: number
}): TradeBotDecision => {
  const { frames, symbol, timeframe, accountBalance, accountCurrency, symbolSpec } = input
  const riskBudget = tradeBotRiskBudget(accountBalance)
  if (!riskBudget) return wait(timeframe, 'Account balance is unavailable; risk sizing is blocked.', 0)
  if (!symbolSpec) {
    return {
      status: 'BLOCKED',
      reason: 'Verified cTrader instrument contract data is unavailable; Trade Bot risk sizing is blocked.',
      setup: null,
      timeframe,
      riskBudget,
      riskPlan: null,
      higherTimeframeBias: 'Unclear',
    }
  }

  const candles = frames[timeframe] ?? []
  if (candles.length < 8) return wait(timeframe, `Waiting for at least 8 ${timeframe} candles.`, riskBudget)

  const multi = analyzeMultiTimeframeBias(frames)
  const rawBias = multi.higherTimeframeBias
  const higherTimeframeBias = rawBias === 'Bullish' || rawBias === 'Bearish' || rawBias === 'Sideways'
    ? rawBias
    : 'Unclear'
  const swings = findSwingPoints(candles, 2)
  const structure = analyzeMarketStructure(candles, 2)
  const tolerance = symbol.includes('JPY') ? 0.1 : symbol.includes('XAU') ? 0.01 : 0.001
  const supportResistance = analyzeSupportResistance(candles, tolerance, swings)
  const liquidity = analyzeLiquidity(candles, swings, tolerance)
  const setup = analyzeSetup({
    currentPrice: Number(candles[candles.length - 1]?.close ?? 0),
    structure,
    supportResistance,
    liquidity,
  }).preferredSetup

  if (!setup || (setup.direction !== 'BUY' && setup.direction !== 'SELL')) {
    return wait(timeframe, 'No setup passed the Trade Bot structure and liquidity rules.', riskBudget, higherTimeframeBias)
  }

  const directionalBias = setup.direction === 'BUY' ? 'Bullish' : 'Bearish'
  if (higherTimeframeBias !== directionalBias) {
    return wait(timeframe, 'Higher-timeframe bias does not confirm the candidate direction.', riskBudget, higherTimeframeBias)
  }

  const riskLimitPlan = calculateCfdRiskPlan({
    accountBalance,
    accountCurrency,
    symbol: symbolSpec,
    side: setup.direction,
    entryPrice: setup.entryPrice,
    stopLossPrice: setup.stopLoss,
    takeProfitPrice: setup.takeProfit,
    riskAmount: riskBudget,
  })
  if (!riskLimitPlan.valid) {
    return {
      status: 'BLOCKED',
      reason: riskLimitPlan.error || 'Risk plan failed validation.',
      setup,
      timeframe,
      riskBudget,
      riskPlan: riskLimitPlan,
      higherTimeframeBias,
    }
  }

  let riskPlan = riskLimitPlan
  let lotAdjustmentReason: string | null = null
  if (input.requestedLots !== undefined) {
    const choice = resolveTradeBotLotSize({
      requestedLots: input.requestedLots,
      riskAllowedLots: riskLimitPlan.lotSize,
      minimumLots: symbolSpec.minLotSize,
      maximumLots: symbolSpec.maxLotSize,
      lotStep: symbolSpec.lotStep,
    })
    if (choice.error || choice.lotSize === null) {
      return {
        status: 'BLOCKED',
        reason: choice.error || 'No valid lot size fits the selected account and risk limit.',
        setup,
        timeframe,
        riskBudget,
        riskPlan: riskLimitPlan,
        requestedLotSize: input.requestedLots,
        higherTimeframeBias,
      }
    }
    lotAdjustmentReason = choice.adjustmentReason
    riskPlan = calculateCfdRiskPlan({
      accountBalance,
      accountCurrency,
      symbol: symbolSpec,
      side: setup.direction,
      entryPrice: setup.entryPrice,
      stopLossPrice: setup.stopLoss,
      takeProfitPrice: setup.takeProfit,
      riskAmount: riskBudget,
      lots: choice.lotSize,
    })
    if (!riskPlan.valid) {
      return {
        status: 'BLOCKED',
        reason: riskPlan.error || 'Selected lot failed risk validation.',
        setup,
        timeframe,
        riskBudget,
        riskPlan,
        requestedLotSize: input.requestedLots,
        lotAdjustmentReason,
        higherTimeframeBias,
      }
    }
  }
  if (riskPlan.estimatedLossAtStop > riskBudget + 0.01) {
    return {
      status: 'BLOCKED',
      reason: 'Calculated stop-loss exposure exceeds the Trade Bot risk limit.',
      setup,
      timeframe,
      riskBudget,
      riskPlan,
      requestedLotSize: input.requestedLots,
      lotAdjustmentReason,
      higherTimeframeBias,
    }
  }
  if (riskPlan.riskRewardRatio < 1.5) {
    return {
      status: 'BLOCKED',
      reason: 'Risk/reward is below the Trade Bot minimum of 1.5:1.',
      setup,
      timeframe,
      riskBudget,
      riskPlan,
      requestedLotSize: input.requestedLots,
      lotAdjustmentReason,
      higherTimeframeBias,
    }
  }

  return {
    status: 'READY',
    reason: 'Setup and initial risk checks passed. A fresh broker quote and final practice-order checks are still required.',
    setup,
    timeframe,
    riskBudget,
    riskPlan,
    requestedLotSize: input.requestedLots,
    lotAdjustmentReason,
    higherTimeframeBias,
  }
}
