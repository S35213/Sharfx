import { analyzeLiquidity } from '../liquidity'
import { analyzeMarketStructure, findSwingPoints } from '../marketStructure'
import { analyzeSetup } from '../setup'
import { analyzeSupportResistance } from '../supportResistance'
import { analyzeMultiTimeframeBias } from '../agent/multiTimeframe'
import type { OHLCV, Timeframe } from '../../types'
import type { SetupCandidate } from '../setup/types'

export const RADAR_TIMEFRAMES: Timeframe[] = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1']

export interface SignalRadarOpportunity {
  timeframe: Timeframe
  direction: 'BUY' | 'SELL'
  signalStrength: number
  state: 'STRONG' | 'WATCH' | 'EARLY'
  setup: SetupCandidate
  structure: string
  liquidity: string[]
  higherTimeframeAligned: boolean
}

export interface SignalRadarBotPlan {
  mode: 'FAST_ADAPTIVE'
  opportunity: SignalRadarOpportunity | null
  analysisTimeframe: Timeframe | null
  entryTimeframe: Timeframe | null
  reason: string
}

export interface SignalRadarResult {
  opportunities: SignalRadarOpportunity[]
  dominantBias: 'Bullish' | 'Bearish' | null
  alignment: number
  scanned: Timeframe[]
  missing: Timeframe[]
  botPlan: SignalRadarBotPlan
}

const clamp = (value: number): number => Math.max(0, Math.min(100, Math.round(value)))

export const buildSignalRadar = (
  frames: Partial<Record<Timeframe, OHLCV[]>>,
  symbol: string,
  currentPrice: number,
): SignalRadarResult => {
  const multi = analyzeMultiTimeframeBias(frames)
  const opportunities = RADAR_TIMEFRAMES.flatMap((timeframe) => {
    const candles = frames[timeframe] ?? []
    if (candles.length < 8) return []

    const swings = findSwingPoints(candles, 2)
    const structure = analyzeMarketStructure(candles, 2)
    const tolerance = symbol.includes('JPY') ? 0.1 : symbol.includes('XAU') ? 0.01 : 0.001
    const supportResistance = analyzeSupportResistance(candles, tolerance, swings)
    const liquidity = analyzeLiquidity(candles, swings, tolerance)
    const setupResult = analyzeSetup({
      currentPrice: Number(candles[candles.length - 1]?.close ?? currentPrice),
      structure,
      supportResistance,
      liquidity,
    })
    const setup = setupResult.preferredSetup
    if (!setup || (setup.direction !== 'BUY' && setup.direction !== 'SELL')) return []
    const bullish = setup.direction === 'BUY'
    const htfAligned = multi.higherTimeframeBias === (bullish ? 'Bullish' : 'Bearish')
    const directionAgreement = multi.dominantBias === (bullish ? 'Bullish' : 'Bearish') ? 7 : 0
    const htfBonus = htfAligned ? 8 : 0
    const fastContextBonus =
      timeframe === 'M5' ? 4
      : timeframe === 'M15' ? 3
      : timeframe === 'M30' ? 2
      : timeframe === 'H1' ? 1
      : 0
    const signalStrength = clamp(setup.confidence + directionAgreement + htfBonus + fastContextBonus)
    return [{
      timeframe,
      direction: setup.direction,
      signalStrength,
      state: (signalStrength >= 82 ? 'STRONG' : signalStrength >= 68 ? 'WATCH' : 'EARLY') as 'STRONG' | 'WATCH' | 'EARLY',
      setup,
      structure: structure.structureType,
      liquidity: liquidity.pools.slice(0, 3).map((pool) => pool.association),
      higherTimeframeAligned: htfAligned,
    }]
  }).sort((a, b) => b.signalStrength - a.signalStrength || RADAR_TIMEFRAMES.indexOf(a.timeframe) - RADAR_TIMEFRAMES.indexOf(b.timeframe))

  const seen = new Set<string>()
  const top = opportunities.filter((item) => {
    if (seen.has(item.timeframe)) return false
    seen.add(item.timeframe)
    return true
  }).slice(0, 3)

  const fastOpportunity =
    opportunities.find((item) =>
      ['M5', 'M15', 'M30', 'H1'].includes(item.timeframe) &&
      item.higherTimeframeAligned &&
      item.signalStrength >= 68,
    ) ??
    opportunities.find((item) => ['M5', 'M15', 'M30'].includes(item.timeframe) && item.signalStrength >= 68) ??
    opportunities.find((item) => item.timeframe === 'M1' && item.signalStrength >= 68) ??
    opportunities[0] ??
    null

  const entryTimeframe = fastOpportunity
    ? fastOpportunity.timeframe === 'M1'
      ? 'M1'
      : ['M5', 'M15'].includes(fastOpportunity.timeframe)
        ? 'M1'
        : ['M30', 'H1'].includes(fastOpportunity.timeframe)
          ? 'M5'
          : 'M15'
    : null

  const botReason = fastOpportunity
    ? fastOpportunity.timeframe === entryTimeframe
      ? fastOpportunity.timeframe + ' signal selected directly.'
      : fastOpportunity.timeframe + ' structure selected; ' + entryTimeframe + ' is used only for the fast entry trigger.'
    : 'WAIT — no qualified fast setup is available.'

  return {
    opportunities: top,
    dominantBias: multi.dominantBias === 'Bullish' || multi.dominantBias === 'Bearish' ? multi.dominantBias : null,
    alignment: multi.confidence,
    scanned: RADAR_TIMEFRAMES.filter((timeframe) => (frames[timeframe]?.length ?? 0) >= 8),
    missing: RADAR_TIMEFRAMES.filter((timeframe) => (frames[timeframe]?.length ?? 0) < 8),
    botPlan: {
      mode: 'FAST_ADAPTIVE',
      opportunity: fastOpportunity,
      analysisTimeframe: fastOpportunity?.timeframe ?? null,
      entryTimeframe,
      reason: botReason,
    },
  }
}
