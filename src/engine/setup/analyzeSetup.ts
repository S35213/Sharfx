import type { SetupCandidate, SetupEngineInput, SetupQuality, SetupResult } from './types'
import type { LiquidityPool } from '../liquidity/types'

const finitePositive = (value: number): boolean => Number.isFinite(value) && value > 0

const qualityFor = (score: number): SetupQuality => {
  if (score >= 80) return 'strong'
  if (score >= 60) return 'moderate'
  return 'weak'
}

const makeCandidate = (
  direction: 'BUY' | 'SELL',
  entryPrice: number,
  stopLoss: number,
  takeProfit: number,
  confidence: number,
  rationale: string[],
  invalidation: string,
  liquidityTarget: LiquidityPool | null,
): SetupCandidate | null => {
  if (!finitePositive(entryPrice) || !finitePositive(stopLoss) || !finitePositive(takeProfit)) return null

  const riskDistance = Math.abs(entryPrice - stopLoss)
  const rewardDistance = Math.abs(takeProfit - entryPrice)
  if (!finitePositive(riskDistance) || !finitePositive(rewardDistance)) return null

  if (direction === 'BUY' && !(stopLoss < entryPrice && takeProfit > entryPrice)) return null
  if (direction === 'SELL' && !(stopLoss > entryPrice && takeProfit < entryPrice)) return null

  const riskRewardRatio = rewardDistance / riskDistance
  if (!finitePositive(riskRewardRatio)) return null

  const boundedConfidence = Math.max(0, Math.min(100, Math.round(confidence)))
  return {
    direction,
    status: 'candidate',
    quality: qualityFor(boundedConfidence),
    entryPrice,
    stopLoss,
    takeProfit,
    riskRewardRatio: Number(riskRewardRatio.toFixed(2)),
    riskDistance,
    rewardDistance,
    confidence: boundedConfidence,
    rationale,
    invalidation,
    liquidityTarget,
  }
}

export const analyzeSetup = (input: SetupEngineInput): SetupResult => {
  const { currentPrice, structure, supportResistance, liquidity } = input
  if (!finitePositive(currentPrice)) return { candidates: [], preferredSetup: null, currentPrice }

  const candidates: SetupCandidate[] = []
  const buyTarget = liquidity.nearestBuySide
  const sellTarget = liquidity.nearestSellSide

  const bullish = structure.bias === 'Bullish'
  const bearish = structure.bias === 'Bearish'

  if (bullish && supportResistance.nearestSupport !== null && buyTarget !== null) {
    const support = supportResistance.nearestSupport
    const target = buyTarget.referencePrice
    if (support < currentPrice && target > currentPrice) {
      const stopBuffer = Math.abs(currentPrice - support) * 0.15
      const stopLoss = support - stopBuffer
      const score = 55 + (structure.status === 'Intact' ? 15 : 0) + (buyTarget.strength === 'strong' ? 15 : buyTarget.strength === 'moderate' ? 8 : 0) + (supportResistance.nearestSupport !== null ? 10 : 0)
      const candidate = makeCandidate(
        'BUY',
        currentPrice,
        stopLoss,
        target,
        score,
        [
          'Market structure is bullish (HH/HL bias).',
          `Nearest support is ${support}.`,
          `Nearest unswept buy-side liquidity is ${target}.`,
        ],
        `Bullish setup invalidated below ${support}.`,
        buyTarget,
      )
      if (candidate) candidates.push(candidate)
    }
  }

  if (bearish && supportResistance.nearestResistance !== null && sellTarget !== null) {
    const resistance = supportResistance.nearestResistance
    const target = sellTarget.referencePrice
    if (resistance > currentPrice && target < currentPrice) {
      const stopBuffer = Math.abs(resistance - currentPrice) * 0.15
      const stopLoss = resistance + stopBuffer
      const score = 55 + (structure.status === 'Intact' ? 15 : 0) + (sellTarget.strength === 'strong' ? 15 : sellTarget.strength === 'moderate' ? 8 : 0) + (supportResistance.nearestResistance !== null ? 10 : 0)
      const candidate = makeCandidate(
        'SELL',
        currentPrice,
        stopLoss,
        target,
        score,
        [
          'Market structure is bearish (LH/LL bias).',
          `Nearest resistance is ${resistance}.`,
          `Nearest unswept sell-side liquidity is ${target}.`,
        ],
        `Bearish setup invalidated above ${resistance}.`,
        sellTarget,
      )
      if (candidate) candidates.push(candidate)
    }
  }

  // A setup is preferred only when the engine has structural alignment.
  // This engine does not invent a trade in neutral/unclear conditions.
  const preferredSetup = candidates
    .slice()
    .sort((a, b) => b.confidence - a.confidence || b.riskRewardRatio - a.riskRewardRatio)[0] ?? null

  return { candidates, preferredSetup, currentPrice }
}
