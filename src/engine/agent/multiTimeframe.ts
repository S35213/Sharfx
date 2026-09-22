import { analyzeMarketStructure } from '../marketStructure'
import type { MarketBias } from '../marketStructure/types'
import type { OHLCV, Timeframe } from '../../types'

export interface TimeframeBias {
  timeframe: Timeframe
  bias: MarketBias
  structure: string
  weight: number
}

export interface MultiTimeframeResult {
  biases: TimeframeBias[]
  dominantBias: MarketBias | null
  aligned: boolean
  confidence: number
  summary: string
}

const weights: Record<Timeframe, number> = {
  M1: 1,
  M5: 1,
  M15: 2,
  M30: 2,
  H1: 3,
  H4: 4,
  D1: 5,
  W1: 6,
}

const chooseLookback = (candles: OHLCV[]): number => {
  if (candles.length >= 9) return 2
  if (candles.length >= 5) return 1
  return 0
}

export const analyzeMultiTimeframeBias = (frames: Partial<Record<Timeframe, OHLCV[]>>): MultiTimeframeResult => {
  const order: Timeframe[] = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1']
  const biases = order
    .filter((timeframe) => (frames[timeframe]?.length ?? 0) > 0)
    .map((timeframe) => {
      const candles = frames[timeframe] ?? []
      const result = analyzeMarketStructure(candles, chooseLookback(candles))
      return { timeframe, bias: result.bias, structure: result.status, weight: weights[timeframe] }
    })

  const directional = biases.filter((item) => item.bias === 'Bullish' || item.bias === 'Bearish')
  const bullishWeight = directional.filter((item) => item.bias === 'Bullish').reduce((sum, item) => sum + item.weight, 0)
  const bearishWeight = directional.filter((item) => item.bias === 'Bearish').reduce((sum, item) => sum + item.weight, 0)
  const totalDirectionalWeight = bullishWeight + bearishWeight
  const dominantBias: MarketBias | null = bullishWeight === bearishWeight
    ? null
    : bullishWeight > bearishWeight ? 'Bullish' : 'Bearish'
  const dominantWeight = dominantBias === 'Bullish' ? bullishWeight : dominantBias === 'Bearish' ? bearishWeight : 0
  const confidence = totalDirectionalWeight === 0 ? 0 : Math.round((dominantWeight / totalDirectionalWeight) * 100)
  const aligned = directional.length > 0 && (bullishWeight === totalDirectionalWeight || bearishWeight === totalDirectionalWeight)

  let summary = 'Timeframes are mixed or insufficient for a dominant directional bias.'
  if (dominantBias) {
    summary = aligned
      ? `${dominantBias} bias is aligned across ${directional.length} directional timeframe${directional.length === 1 ? '' : 's'}, weighted toward the higher timeframes.`
      : `${dominantBias} bias has the stronger weighted evidence, but lower or higher timeframes disagree.`
  }

  return { biases, dominantBias, aligned, confidence, summary }
}
