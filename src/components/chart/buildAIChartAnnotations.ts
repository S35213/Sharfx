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
  add('liquidity-buy', liquidity.nearestBuySide?.referencePrice ?? null, 'Buy-side liquidity', '#A78BFA', 1)
  add('liquidity-sell', liquidity.nearestSellSide?.referencePrice ?? null, 'Sell-side liquidity', '#A78BFA', 1)

  const setup = analyzeCurrentSetup(symbol, candles)
  const preferred = setup?.preferredSetup ?? null
  if (preferred) {
    add('ai-entry', preferred.entryPrice, `AI ${preferred.direction} entry`, '#2962FF', 2)
    add('ai-stop', preferred.stopLoss, 'AI stop', '#F6465D', 2)
    add('ai-target', preferred.takeProfit, 'AI target', '#0ECB81', 2)
  }

  return result.sort((a, b) => a.price - b.price).slice(-8)
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

    const duplicate = result.find((item) => Math.abs(item.price - price) <= priceTolerance)
    if (duplicate) {
      // A buy-side and sell-side liquidity pool can collapse to the same
      // reference price after clustering. Rendering both labels on one
      // horizontal line creates a misleading duplicate label in the chart.
      if (duplicate.id.startsWith('liquidity-') && id.startsWith('liquidity-')) {
        if (!duplicate.label.includes('liquidity')) return
        duplicate.label = `${prefix}Liquidity`
        duplicate.id = 'liquidity-both'
        duplicate.color = '#A78BFA'
        duplicate.lineWidth = 1
      }
      return
    }

    result.push({ id, price, label: `${prefix}${label}`, color, lineWidth })
  }

  add('support', supportResistance.nearestSupport, 'Support', '#22D3A5', 2)
  add('resistance', supportResistance.nearestResistance, 'Resistance', '#FF5C75', 2)
  add('liquidity-buy', liquidity.nearestBuySide?.referencePrice ?? null, 'Buy-side liquidity', '#A78BFA', 1)
  add('liquidity-sell', liquidity.nearestSellSide?.referencePrice ?? null, 'Sell-side liquidity', '#A78BFA', 1)

  return result.sort((a, b) => a.price - b.price)
}
