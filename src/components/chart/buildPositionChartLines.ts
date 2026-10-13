import type { TradeOrder } from '../../types'
import type { ChartAnnotation } from './CandlestickChart'

const formatOpenPositionProfit = (profit: number, currency: string): string => {
  const code = currency.trim().toUpperCase() || 'USD'
  const marker = ({ USD: '$', EUR: '€', GBP: '£', JPY: '¥', KES: 'KSh ' } as Record<string, string>)[code] ?? (code + ' ')
  const sign = profit > 0 ? '+' : profit < 0 ? '−' : ''
  return sign + marker + Math.abs(profit).toFixed(2)
}

/**
 * The chart-level mapping for one open position. Entry stays fixed and carries
 * floating P/L; the live exit price follows Bid for BUY and Ask for SELL.
 */
export const buildOpenPositionChartLines = (
  position: TradeOrder | null,
  bidPrice: number,
  askPrice: number,
  currency = 'USD',
): ChartAnnotation[] => {
  if (!position || position.status !== 'open' || !Number.isFinite(position.entryPrice) || position.entryPrice <= 0) return []

  const hasProfit = typeof position.profit === 'number' && Number.isFinite(position.profit)
  const profit = hasProfit ? position.profit as number : 0
  const profitLabelColor = !hasProfit ? '#8A96A8' : profit > 0 ? '#22D3A5' : profit < 0 ? '#FF5C75' : '#8A96A8'
  const currentLineColor = position.type === 'BUY' ? '#2F80FF' : '#F04452'
  const currentPrice = position.type === 'BUY' ? bidPrice : askPrice
  const result: ChartAnnotation[] = [
    {
      id: position.id + '-entry',
      price: position.entryPrice,
      label: 'OPEN ' + (hasProfit ? formatOpenPositionProfit(profit, currency) : '—'),
      color: '#8A96A8',
      labelColor: profitLabelColor,
      lineWidth: 2,
    },
  ]

  if (Number.isFinite(currentPrice) && currentPrice > 0) {
    result.push({
      id: position.id + '-current',
      price: currentPrice,
      label: position.type + ' CURRENT / EXIT',
      color: currentLineColor,
      labelColor: currentLineColor,
      lineWidth: 2,
    })
  }

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
    })
  }

  // Prefer a valid planned TP, then fall back to the broker's confirmed TP.
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
    })
  }

  return result
}
