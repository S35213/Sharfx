import type { SignalRadarOpportunity, SignalRadarResult } from '../engine/bot/signalRadar'
import type { SymbolSpec, TradeSide } from '../types'
import { getConversionRate } from '../data/mock/symbols'
import { calculateMultiplierPnl } from './derivMultiplierAccounting'

export type PaperEngineMode = 'SHAFX_STANDARD' | 'DERIV_MULTIPLIER'

export interface PaperEngineSettings {
  mode: PaperEngineMode
  accountCurrency: string
  lotSize: number
  stake: number
  multiplier: number
  minExpectedProfit: number
  minRiskReward: number
  minSignalStrength: number
}

export interface PaperOpportunityAssessment {
  decision: 'TRADE' | 'WAIT'
  opportunity: SignalRadarOpportunity | null
  direction: TradeSide | null
  entryPrice: number | null
  targetPrice: number | null
  stopPrice: number | null
  expectedProfit: number
  expectedLoss: number
  riskReward: number
  targetMovePips: number | null
  signalStrength: number
  reason: string
  reasons: string[]
}

const signedPriceMove = (direction: TradeSide, entryPrice: number, currentPrice: number): number => {
  const move = currentPrice - entryPrice
  return direction === 'BUY' ? move : -move
}

export const calculateStandardForexPnl = ({
  direction,
  entryPrice,
  currentPrice,
  lotSize,
  symbolSpec,
  accountCurrency,
}: {
  direction: TradeSide
  entryPrice: number
  currentPrice: number
  lotSize: number
  symbolSpec: SymbolSpec
  accountCurrency: string
}): number => {
  if (!Number.isFinite(entryPrice) || entryPrice <= 0 || !Number.isFinite(currentPrice) || currentPrice <= 0) return Number.NaN
  if (!Number.isFinite(lotSize) || lotSize <= 0 || symbolSpec.contractSize <= 0) return Number.NaN
  const quotePnl = signedPriceMove(direction, entryPrice, currentPrice) * symbolSpec.contractSize * lotSize
  const conversionRate = getConversionRate(symbolSpec.quoteCurrency, accountCurrency)
  if (conversionRate === undefined || !Number.isFinite(conversionRate)) return Number.NaN
  return quotePnl * conversionRate
}

export const calculatePaperPnl = ({
  mode,
  direction,
  entryPrice,
  currentPrice,
  settings,
  symbolSpec,
}: {
  mode: PaperEngineMode
  direction: TradeSide
  entryPrice: number
  currentPrice: number
  settings: PaperEngineSettings
  symbolSpec: SymbolSpec
}): number => mode === 'SHAFX_STANDARD'
  ? calculateStandardForexPnl({
      direction,
      entryPrice,
      currentPrice,
      lotSize: settings.lotSize,
      symbolSpec,
      accountCurrency: settings.accountCurrency,
    })
  : calculateMultiplierPnl({
      direction,
      entryPrice,
      currentPrice,
      stake: settings.stake,
      multiplier: settings.multiplier,
    })

export const assessPaperOpportunity = (
  radar: SignalRadarResult,
  currentPrice: number,
  symbolSpec: SymbolSpec,
  settings: PaperEngineSettings,
): PaperOpportunityAssessment => {
  const opportunity = radar.botPlan.opportunity
  if (!opportunity || !Number.isFinite(currentPrice) || currentPrice <= 0) {
    return {
      decision: 'WAIT',
      opportunity: null,
      direction: null,
      entryPrice: null,
      targetPrice: null,
      stopPrice: null,
      expectedProfit: 0,
      expectedLoss: 0,
      riskReward: 0,
      targetMovePips: null,
      signalStrength: 0,
      reason: radar.botPlan.reason || 'WAIT — no qualified setup is available.',
      reasons: ['No qualified setup is available.'],
    }
  }

  const setup = opportunity.setup
  const entryPrice = currentPrice
  const targetPrice = Number(setup.takeProfit)
  const stopPrice = Number(setup.stopLoss)
  const targetMovePips = Number.isFinite(targetPrice)
    ? Math.abs(targetPrice - entryPrice) / symbolSpec.pipSize
    : null
  const expectedProfit = calculatePaperPnl({
    mode: settings.mode,
    direction: opportunity.direction,
    entryPrice,
    currentPrice: targetPrice,
    settings,
    symbolSpec,
  })
  const stopPnl = calculatePaperPnl({
    mode: settings.mode,
    direction: opportunity.direction,
    entryPrice,
    currentPrice: stopPrice,
    settings,
    symbolSpec,
  })
  const expectedLoss = Number.isFinite(stopPnl) ? Math.abs(stopPnl) : 0
  const riskReward = expectedLoss > 0 && Number.isFinite(expectedProfit) ? expectedProfit / expectedLoss : 0
  const reasons: string[] = []
  const validDirection = expectedProfit > 0 && expectedLoss > 0

  if (!validDirection) reasons.push('Target or stop is not positioned correctly for the selected direction.')
  if (opportunity.signalStrength < settings.minSignalStrength) reasons.push('Signal strength is below the SHAFX execution floor.')
  if (!Number.isFinite(expectedProfit) || expectedProfit < settings.minExpectedProfit) reasons.push('Expected profit is below the selected minimum opportunity.')
  if (!Number.isFinite(riskReward) || riskReward < settings.minRiskReward) reasons.push('Reward-to-risk is below the selected minimum.')
  if (reasons.length === 0) reasons.push('Enough room to target with acceptable reward-to-risk.')

  return {
    decision: validDirection
      && opportunity.signalStrength >= settings.minSignalStrength
      && Number.isFinite(expectedProfit)
      && expectedProfit >= settings.minExpectedProfit
      && Number.isFinite(riskReward)
      && riskReward >= settings.minRiskReward
      ? 'TRADE'
      : 'WAIT',
    opportunity,
    direction: opportunity.direction,
    entryPrice,
    targetPrice: Number.isFinite(targetPrice) ? targetPrice : null,
    stopPrice: Number.isFinite(stopPrice) ? stopPrice : null,
    expectedProfit: Number.isFinite(expectedProfit) ? expectedProfit : 0,
    expectedLoss,
    riskReward: Number.isFinite(riskReward) ? riskReward : 0,
    targetMovePips,
    signalStrength: opportunity.signalStrength,
    reason: reasons.join(' '),
    reasons,
  }
}