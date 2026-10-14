import type { TradeOrder } from '../../types'
import type { ChartAnnotation } from './CandlestickChart'

const formatOpenPositionProfit = (profit: number, currency: string): string => {
  const code = currency.trim().toUpperCase() || 'USD'
  const marker = ({ USD: '$', EUR: '€', GBP: '£', JPY: '¥', KES: 'KSh ' } as Record<string, string>)[code] ?? (code + ' ')
  const sign = profit > 0 ? '+' : profit < 0 ? '−' : ''
  return sign + marker + Math.abs(profit).toFixed(2)
}

/**
 * Chart mapping for one open position.
 * The plot-area entry label carries only OPEN + floating P/L; the exact entry,
 * stop and target prices are rendered as boxed labels on the right price scale.
 * Bid/Ask are shared market quotes and are drawn only once by the chart itself.
 */
export const buildOpenPositionChartLines = (
  position: TradeOrder | null,
  currency = 'USD',
): ChartAnnotation[] => {
  if (!position || position.status !== 'open' || !Number.isFinite(position.entryPrice) || position.entryPrice <= 0) return []

  const hasProfit = typeof position.profit === 'number' && Number.isFinite(position.profit)
  const profit = hasProfit ? position.profit as number : 0
  const profitLabelColor = !hasProfit ? '#8A96A8' : profit > 0 ? '#22D3A5' : profit < 0 ? '#FF5C75' : '#8A96A8'
  const result: ChartAnnotation[] = [
    {
      id: position.id + '-entry',
      price: position.entryPrice,
      label: 'OPEN ' + (hasProfit ? formatOpenPositionProfit(profit, currency) : '—'),
      color: '#8A96A8',
      labelColor: profitLabelColor,
      lineWidth: 2,
      priceTagOnly: true,
    },
  ]

  // A stale/empty planning value of 0 must not mask a valid broker SL.
  const stopLossPrice = [position.plannedStopLossPrice, position.stopLoss]
    .map(Number)
    .find((value) => Number.isFinite(value) && value > 0)
  if (stopLossPrice !== undefined) {
    result.push({
      id: position.id + '-sl',
      price: stopLossPrice,
      label: position.brokerProtectionConfirmed === false ? 'STOP LOSS — UNCONFIRMED' : 'STOP LOSS',
      color: '#FF5C75',
      lineWidth: 2,
      priceTagOnly: true,
    })
  }

  // Prefer a valid planned TP, then fall back to the broker's current TP.
  const takeProfitPrice = [position.plannedTakeProfitPrice, position.takeProfit]
    .map(Number)
    .find((value) => Number.isFinite(value) && value > 0)
  if (takeProfitPrice !== undefined) {
    result.push({
      id: position.id + '-tp',
      price: takeProfitPrice,
      label: position.brokerProtectionConfirmed === false ? 'TAKE PROFIT — UNCONFIRMED' : 'TAKE PROFIT',
      color: '#2F80FF',
      lineWidth: 2,
      priceTagOnly: true,
    })
  }

  return result
}

/**
 * Build chart lines for all open positions on the selected symbol. Entry levels
 * remain individual. Stops/targets at exactly the same price are merged so a
 * group of identical protection levels cannot stack several indistinguishable
 * labels on the price scale.
 */
export const buildOpenPositionsChartLines = (
  positions: readonly TradeOrder[],
  currency = 'USD',
): ChartAnnotation[] => {
  const lines = positions.flatMap((position) => buildOpenPositionChartLines(position, currency))
  const result: ChartAnnotation[] = []
  const groups = new Map<string, ChartAnnotation[]>()

  for (const line of lines) {
    const id = line.id.toLowerCase()
    const kind = id.endsWith('-sl') ? 'sl' : id.endsWith('-tp') ? 'tp' : null
    if (!kind) {
      result.push(line)
      continue
    }
    const verificationState = line.label.includes('UNCONFIRMED') ? 'unconfirmed' : 'confirmed'
    const key = [kind, line.price.toFixed(10), verificationState].join(':')
    groups.set(key, [...(groups.get(key) ?? []), line])
  }

  for (const [key, group] of groups) {
    const first = group[0]
    if (!first) continue
    if (group.length === 1) {
      result.push(first)
      continue
    }
    const kind = key.startsWith('sl:') ? 'STOP LOSS' : 'TAKE PROFIT'
    const unconfirmed = key.endsWith(':unconfirmed')
    result.push({
      ...first,
      id: 'shafx-position-group-' + key.replaceAll(':', '-'),
      label: kind + (unconfirmed ? ' — UNCONFIRMED' : '') + ' · ' + group.length + ' trades',
    })
  }

  return result
}
