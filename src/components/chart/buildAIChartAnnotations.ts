import { analyzeLiquidity } from '../../engine/liquidity'
import { analyzeMarketStructure, findSwingPoints } from '../../engine/marketStructure'
import { analyzeSetup } from '../../engine/setup'
import { analyzeSupportResistance } from '../../engine/supportResistance'
import type { OHLCV } from '../../types'
import type { SetupResult } from '../../engine/setup/types'
import type { ChartAnnotation } from './CandlestickChart'

const toleranceFor = (symbol: string): number => symbol.includes('JPY') ? 0.1 : 0.001

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
  const setup = analyzeCurrentSetup(symbol, candles)
  const result: ChartAnnotation[] = []
  const add = (id: string, price: number | null, label: string, color: string, lineWidth: 1 | 2 = 1): void => {
    if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) return
    result.push({ id, price, label, color, lineWidth })
  }
  const swings = findSwingPoints(candles, 2)
  const supportResistance = analyzeSupportResistance(candles, toleranceFor(symbol), swings)
  add('support', supportResistance.nearestSupport, 'Support', '#22D3A5', 2)
  add('resistance', supportResistance.nearestResistance, 'Resistance', '#FF5C75', 2)
  const preferred = setup?.preferredSetup ?? null
  if (preferred) {
    add('ai-entry', preferred.entryPrice, `AI ${preferred.direction} entry`, '#2962FF', 2)
    add('ai-stop', preferred.stopLoss, 'AI stop', '#F6465D', 2)
    add('ai-target', preferred.takeProfit, 'AI target', '#0ECB81', 2)
  }
  return result.sort((a, b) => a.price - b.price).slice(-6)
}
