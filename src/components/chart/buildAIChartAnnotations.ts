import { analyzeLiquidity } from '../../engine/liquidity'
import { analyzeMarketStructure, findSwingPoints } from '../../engine/marketStructure'
import { analyzeSetup } from '../../engine/setup'
import { analyzeSupportResistance } from '../../engine/supportResistance'
import type { OHLCV } from '../../types'
import type { SetupResult } from '../../engine/setup/types'
import type { ChartAnnotation } from './CandlestickChart'

const toleranceFor = (symbol: string): number => symbol.includes('JPY') ? 0.1 : 0.001

const annotationPriceTolerance = (symbol: string): number => Math.max(toleranceFor(symbol) * 0.05, Number.EPSILON)

export const analyzeCurrentSetup = (symbol: string, candles: OHLCV[]): SetupResult | null => {
  if (candles.length === 0) return null
  const currentPrice = candles[candles.length - 1]?.close ?? Number.NaN
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) return null
  const swings = findSwingPoints(candles, 2)
  const structure = analyzeMarketStructure(candles, 2)
  const supportResistance = analyzeSupportResistance(candles, toleranceFor(symbol), swings)
  const liquidity = analyzeLiquidity(candles, swings, toleranceFor(symbol))
  return analyzeSetup({ currentPrice, structure, supportResistance, liquidity })
}

export const buildAIChartAnnotations = (symbol: string, candles: OHLCV[]): ChartAnnotation[] => {
  if (candles.length === 0) return []
  const currentPrice = candles[candles.length - 1]?.close ?? Number.NaN
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) return []

  // Structural levels are based on completed candles. The forming candle is
  // deliberately excluded so support/resistance does not chase the live
  // Bid/Ask tick inside the current bar.
  const structuralCandles = candles.length > 1 ? candles.slice(0, -1) : candles
  const result: ChartAnnotation[] = []
  const add = (id: string, price: number | null, label: string, color: string, lineWidth: 1 | 2 = 1): void => {
    if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) return
    result.push({ id, price, label, color, lineWidth })
  }

  const swings = findSwingPoints(structuralCandles, 2)
  const tolerance = toleranceFor(symbol)
  const supportResistance = analyzeSupportResistance(structuralCandles, tolerance, swings)
  const liquidity = analyzeLiquidity(structuralCandles, swings, tolerance)

  add('support', supportResistance.nearestSupport, 'Support', '#22D3A5', 2)
  add('resistance', supportResistance.nearestResistance, 'Resistance', '#FF5C75', 2)
  const latestSwingHigh = swings.highs.length ? swings.highs[swings.highs.length - 1].price : null
  const latestSwingLow = swings.lows.length ? swings.lows[swings.lows.length - 1].price : null
  const buyLiquidity = liquidity.nearestBuySide?.referencePrice ?? latestSwingHigh
  const sellLiquidity = liquidity.nearestSellSide?.referencePrice ?? latestSwingLow

  add('liquidity-buy', buyLiquidity, 'Buy-side liquidity', '#5CA8FF', 1)
  add('liquidity-sell', sellLiquidity, 'Sell-side liquidity', '#5CA8FF', 1)

  const setup = analyzeCurrentSetup(symbol, candles)
  const preferred = setup?.preferredSetup ?? null
  if (preferred) {
    add('ai-entry', preferred.entryPrice, `AI ${preferred.direction} entry`, '#2962FF', 2)
    add('ai-stop', preferred.stopLoss, 'AI stop', '#F6465D', 2)
    add('ai-target', preferred.takeProfit, 'AI target', '#0ECB81', 2)
  }

  return result.sort((a, b) => a.price - b.price).slice(-8)
}

/**
 * Combine nearby analysis levels without silently discarding a market concept.
 * When multiple real levels are within the chart's clustering tolerance, one
 * representative line carries every label that contributed to the cluster.
 */
export const mergeNearbyStructuralAnnotations = (
  existing: ChartAnnotation,
  incoming: ChartAnnotation,
): ChartAnnotation => {
  const ids = [...new Set([...existing.id.split('+'), ...incoming.id.split('+')])]
  const labels = [...new Set(`${existing.label} / ${incoming.label}`.split(' / ').map((label) => label.trim()).filter(Boolean))]
  const liquidityOnly = ids.every((id) => id.startsWith('liquidity-'))

  return {
    ...existing,
    id: ids.join('+'),
    label: labels.join(' / '),
    color: liquidityOnly ? '#5CA8FF' : existing.color,
    lineWidth: liquidityOnly ? 1 : existing.lineWidth,
  }
}

export const buildStructuralChartAnnotations = (symbol: string, candles: OHLCV[], sourceLabel?: string): ChartAnnotation[] => {
  if (candles.length === 0) return []
  const structuralCandles = candles.length > 1 ? candles.slice(0, -1) : candles
  if (structuralCandles.length < 5) return []

  const swings = findSwingPoints(structuralCandles, 2)
  const tolerance = toleranceFor(symbol)
  const supportResistance = analyzeSupportResistance(structuralCandles, tolerance, swings)
  const liquidity = analyzeLiquidity(structuralCandles, swings, tolerance)
  const prefix = sourceLabel ? `${sourceLabel} ` : ''

  const result: ChartAnnotation[] = []
  const priceTolerance = annotationPriceTolerance(symbol)
  const add = (id: string, price: number | null, label: string, color: string, lineWidth: 1 | 2 = 1): void => {
    if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) return

    const incoming = { id, price, label, color, lineWidth }
    const duplicate = result.find((item) => Math.abs(item.price - price) <= priceTolerance)
    if (duplicate) {
      // Nearby levels can cluster at the same visual pixel. Keep their meaning
      // explicit in a combined label instead of silently dropping BSL/SSL.
      const duplicateLabel = duplicate.label.startsWith(prefix) ? duplicate.label.slice(prefix.length) : duplicate.label
      const merged = mergeNearbyStructuralAnnotations(
        { ...duplicate, label: duplicateLabel },
        incoming,
      )
      duplicate.id = merged.id
      duplicate.label = `${prefix}${merged.label}`
      duplicate.color = merged.color
      duplicate.lineWidth = merged.lineWidth
      return
    }

    result.push({ id, price, label: `${prefix}${label}`, color, lineWidth })
  }

  const currentPrice = structuralCandles[structuralCandles.length - 1]?.close ?? Number.NaN
  // Repeated-touch clusters are stronger, but a clean single swing can still
  // be the nearest visible decision level on a higher timeframe. Fall back to
  // the nearest confirmed swing on the correct side of price when no cluster
  // is available, instead of silently losing RES/SUP on H4/D1/W1.
  const fallbackSupport = swings.lows
    .filter((point) => point.price <= currentPrice)
    .sort((a, b) => b.price - a.price)[0]?.price ?? null
  const fallbackResistance = swings.highs
    .filter((point) => point.price >= currentPrice)
    .sort((a, b) => a.price - b.price)[0]?.price ?? null

  add('support', supportResistance.nearestSupport ?? fallbackSupport, 'Support', '#22D3A5', 2)
  add('resistance', supportResistance.nearestResistance ?? fallbackResistance, 'Resistance', '#FF5C75', 2)
  add('liquidity-buy', liquidity.nearestBuySide?.referencePrice ?? fallbackResistance, 'Buy-side liquidity', '#5CA8FF', 1)
  add('liquidity-sell', liquidity.nearestSellSide?.referencePrice ?? fallbackSupport, 'Sell-side liquidity', '#5CA8FF', 1)

  return result.sort((a, b) => a.price - b.price)
}
