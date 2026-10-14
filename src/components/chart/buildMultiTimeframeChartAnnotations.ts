import type { OHLCV, Timeframe } from '../../types'
import type { ChartAnnotation } from './CandlestickChart'
import { buildStructuralChartAnnotations } from './buildAIChartAnnotations'

/**
 * Three-tier chart context: the selected interval, a setup interval, and a
 * higher-timeframe bias interval. Lower-timeframe structure is never painted
 * onto a higher-timeframe chart.
 *
 * Examples:
 * - M5 displays M5, H1 and H4 structure.
 * - H4 displays H4, D1 and W1 structure; it can never inherit M5 liquidity.
 */
export const STRUCTURAL_TIMEFRAME_CONTEXTS: Record<Timeframe, readonly Timeframe[]> = {
  M1: ['M1', 'M5', 'H1'],
  M5: ['M5', 'H1', 'H4'],
  M15: ['M15', 'H1', 'H4'],
  M30: ['M30', 'H4', 'D1'],
  H1: ['H1', 'H4', 'D1'],
  H4: ['H4', 'D1', 'W1'],
  D1: ['D1', 'W1'],
  W1: ['W1'],
}

export const buildMultiTimeframeStructuralAnnotations = (
  symbol: string,
  selectedTimeframe: Timeframe,
  historyByTimeframe: Partial<Record<Timeframe, OHLCV[]>>,
): ChartAnnotation[] => {
  const sourceTimeframes = STRUCTURAL_TIMEFRAME_CONTEXTS[selectedTimeframe]
  const annotations: ChartAnnotation[] = []

  for (const sourceTimeframe of sourceTimeframes) {
    const candles = historyByTimeframe[sourceTimeframe]
    if (!candles || candles.length < 5) continue

    const sourceAnnotations = buildStructuralChartAnnotations(symbol, candles, sourceTimeframe)
    annotations.push(...sourceAnnotations.map((annotation) => ({
      ...annotation,
      id: `mtf-${sourceTimeframe}-${annotation.id}`,
    })))
  }

  return annotations.sort((left, right) => left.price - right.price || left.id.localeCompare(right.id))
}
