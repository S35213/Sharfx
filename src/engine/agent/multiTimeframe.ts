import { analyzeMarketStructure } from '../marketStructure'
import type { MarketBias } from '../marketStructure/types'
import type { OHLCV, Timeframe } from '../../types'

export interface TimeframeBias { timeframe: Timeframe; bias: MarketBias; structure: string }
export interface MultiTimeframeResult { biases: TimeframeBias[]; dominantBias: MarketBias | null; aligned: boolean; summary: string }

export const analyzeMultiTimeframeBias = (frames: Partial<Record<Timeframe, OHLCV[]>>): MultiTimeframeResult => {
  const order: Timeframe[] = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1']
  const biases = order.filter((timeframe) => (frames[timeframe]?.length ?? 0) > 0).map((timeframe) => {
    const result = analyzeMarketStructure(frames[timeframe] ?? [], 2)
    return { timeframe, bias: result.bias, structure: result.status }
  })
  const directional = biases.filter((item) => item.bias === 'Bullish' || item.bias === 'Bearish')
  const bullish = directional.filter((item) => item.bias === 'Bullish').length
  const bearish = directional.filter((item) => item.bias === 'Bearish').length
  const dominantBias: MarketBias | null = bullish === bearish ? null : bullish > bearish ? 'Bullish' : 'Bearish'
  const aligned = directional.length > 0 && bullish === directional.length || directional.length > 0 && bearish === directional.length
  const summary = dominantBias ? `${dominantBias} bias dominates across ${directional.length} directional timeframe${directional.length === 1 ? '' : 's'}.` : 'Timeframes are mixed or insufficient for a dominant directional bias.'
  return { biases, dominantBias, aligned, summary }
}
