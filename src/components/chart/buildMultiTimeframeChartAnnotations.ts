import type { OHLCV, Timeframe } from '../../types'
import type { ChartAnnotation } from './CandlestickChart'
import { buildStructuralChartAnnotations } from './buildAIChartAnnotations'

/**
 * Three-tier chart context: the selected interval, a setup interval, and a
 * higher-timeframe bias interval. Lower-timeframe structure is never painted
 * onto a higher-timeframe chart.
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

type StructuralKind = 'support' | 'resistance' | 'liquidity-buy' | 'liquidity-sell'
type StructuralLevel = {
  annotation: ChartAnnotation
  timeframe: Timeframe
  kind: StructuralKind
  price: number
}
type StructuralZone = {
  levels: StructuralLevel[]
  price: number
}

const TIMEFRAME_STRENGTH: Record<Timeframe, number> = {
  M1: 1,
  M5: 2,
  M15: 3,
  M30: 4,
  H1: 5,
  H4: 6,
  D1: 7,
  W1: 8,
}
const MAX_ZONES_PER_SIDE = 2

const priceMergeTolerance = (symbol: string, price: number): number =>
  symbol.toUpperCase().includes('JPY')
    ? 0.02
    : Math.max(Math.abs(price) * 0.00008, 0.00015)

const parseSourceTimeframe = (annotation: ChartAnnotation): Timeframe | null => {
  const match = /^(M1|M5|M15|M30|H1|H4|D1|W1)\s/i.exec(annotation.label.trim())
  return match ? match[1].toUpperCase() as Timeframe : null
}

const parseStructuralKind = (annotation: ChartAnnotation): StructuralKind | null => {
  const id = annotation.id.toLowerCase()
  if (id.includes('liquidity-buy')) return 'liquidity-buy'
  if (id.includes('liquidity-sell')) return 'liquidity-sell'
  if (id.includes('support')) return 'support'
  if (id.includes('resistance')) return 'resistance'
  return null
}

const medianPrice = (levels: StructuralLevel[]): number => {
  const prices = levels.map((level) => level.price).sort((a, b) => a - b)
  const middle = Math.floor(prices.length / 2)
  return prices.length % 2 === 0
    ? (prices[middle - 1] + prices[middle]) / 2
    : prices[middle]
}

const groupNearbyLevels = (levels: StructuralLevel[], symbol: string): StructuralZone[] => {
  const zones: StructuralZone[] = []
  const sorted = levels.slice().sort((left, right) => left.price - right.price)

  for (const level of sorted) {
    const tolerance = priceMergeTolerance(symbol, level.price)
    const candidate = zones.find((zone) => {
      const zoneTolerance = Math.max(tolerance, priceMergeTolerance(symbol, zone.price))
      return Math.abs(level.price - zone.price) <= zoneTolerance &&
        Math.max(...zone.levels.map((member) => member.price), level.price) -
          Math.min(...zone.levels.map((member) => member.price), level.price) <= zoneTolerance * 1.8
    })

    if (candidate) {
      candidate.levels.push(level)
      candidate.price = medianPrice(candidate.levels)
    } else {
      zones.push({ levels: [level], price: level.price })
    }
  }

  return zones
}

const labelForZone = (zone: StructuralZone, currentPrice: number): string => {
  const kindAlias: Record<StructuralKind, string> = {
    support: 'SUP',
    resistance: 'RES',
    'liquidity-buy': 'BSL',
    'liquidity-sell': 'SSL',
  }
  const abovePrice = zone.price >= currentPrice
  const conceptPriority: StructuralKind[] = abovePrice
    ? ['resistance', 'liquidity-buy', 'support', 'liquidity-sell']
    : ['support', 'liquidity-sell', 'resistance', 'liquidity-buy']

  const summaries = conceptPriority
    .map((kind) => {
      const matching = zone.levels.filter((level) => level.kind === kind)
      if (!matching.length) return null
      const timeframes = [...new Set(matching.map((level) => level.timeframe))]
        .sort((left, right) => TIMEFRAME_STRENGTH[right] - TIMEFRAME_STRENGTH[left])
      const source = timeframes.length > 1 ? timeframes.join('/') : timeframes[0]
      return source + ' ' + kindAlias[kind]
    })
    .filter((value): value is string => value !== null)

  // Keep plot-area labels short; the complete timeframes remain in SHAFX's
  // computed zone membership and are used for ranking/confluence.
  return summaries.slice(0, 2).join(' · ')
}

const summarizeZone = (zone: StructuralZone, currentPrice: number): ChartAnnotation => {
  const kinds = new Set(zone.levels.map((level) => level.kind))
  const timeframes = [...new Set(zone.levels.map((level) => level.timeframe))]
  const sortedMembers = [...new Set(zone.levels.map((level) => level.annotation.id))].sort()
  const id = 'mtf-zone-' + sortedMembers.map((member) => member.replace(/^mtf-/, '')).join('+')
  const hasSupport = kinds.has('support')
  const hasResistance = kinds.has('resistance')
  const color = hasSupport && hasResistance
    ? '#9AA8B8'
    : hasResistance
      ? '#FF5C75'
      : hasSupport
        ? '#22D3A5'
        : '#5CA8FF'
  const strongestTimeframe = Math.max(...timeframes.map((timeframe) => TIMEFRAME_STRENGTH[timeframe]))
  const lineWidth: 1 | 2 = strongestTimeframe >= TIMEFRAME_STRENGTH.H4 || timeframes.length > 1 ? 2 : 1

  return {
    id,
    price: zone.price,
    label: labelForZone(zone, currentPrice),
    color,
    lineWidth,
  }
}

const zoneRelevance = (zone: StructuralZone, currentPrice: number): number => {
  const timeframes = new Set(zone.levels.map((level) => level.timeframe))
  const kinds = new Set(zone.levels.map((level) => level.kind))
  const strongest = Math.max(...[...timeframes].map((timeframe) => TIMEFRAME_STRENGTH[timeframe]))
  const confluenceBonus = Math.max(0, timeframes.size - 1) * 0.22
  const conceptBonus = Math.max(0, kinds.size - 1) * 0.06
  const distance = Math.abs(zone.price - currentPrice) / Math.max(Math.abs(currentPrice), 1e-8)
  // Prefer nearby actionable zones, but modestly favor HTF and cross-timeframe
  // confluence. A remote weekly level should not swamp all local structure.
  return distance / (1 + strongest * 0.035 + confluenceBonus + conceptBonus)
}

export const buildMultiTimeframeStructuralAnnotations = (
  symbol: string,
  selectedTimeframe: Timeframe,
  historyByTimeframe: Partial<Record<Timeframe, OHLCV[]>>,
): ChartAnnotation[] => {
  const sourceTimeframes = STRUCTURAL_TIMEFRAME_CONTEXTS[selectedTimeframe]
  const currentCandles = historyByTimeframe[selectedTimeframe]
  const currentPrice = currentCandles?.[currentCandles.length - 1]?.close
  if (!Number.isFinite(currentPrice) || (currentPrice ?? 0) <= 0) return []

  const levels: StructuralLevel[] = []
  for (const sourceTimeframe of sourceTimeframes) {
    const candles = historyByTimeframe[sourceTimeframe]
    if (!candles || candles.length < 5) continue

    const sourceAnnotations = buildStructuralChartAnnotations(symbol, candles, sourceTimeframe)
    for (const annotation of sourceAnnotations) {
      const kind = parseStructuralKind(annotation)
      if (!kind || !Number.isFinite(annotation.price) || annotation.price <= 0) continue
      levels.push({ annotation, timeframe: sourceTimeframe, kind, price: annotation.price })
    }
  }

  const zones = groupNearbyLevels(levels, symbol)
  const abovePrice = zones
    .filter((zone) => zone.price > (currentPrice as number))
    .sort((left, right) =>
      zoneRelevance(left, currentPrice as number) - zoneRelevance(right, currentPrice as number))
    .slice(0, MAX_ZONES_PER_SIDE)
  const belowPrice = zones
    .filter((zone) => zone.price < (currentPrice as number))
    .sort((left, right) =>
      zoneRelevance(left, currentPrice as number) - zoneRelevance(right, currentPrice as number))
    .slice(0, MAX_ZONES_PER_SIDE)

  return [...belowPrice, ...abovePrice]
    .map((zone) => summarizeZone(zone, currentPrice as number))
    .sort((left, right) => left.price - right.price || left.id.localeCompare(right.id))
}
