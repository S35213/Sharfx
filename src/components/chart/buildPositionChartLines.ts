import type { TradeOrder } from '../../types'
import type { ChartAnnotation } from './CandlestickChart'

/**
 * The chart-level mapping for one open position. A BUY position exits at Bid;
 * a SELL position exits at Ask. Entry stays fixed while the exit line follows
 * the real quotes supplied to the chart.
 */
export const buildOpenPositionChartLines = (
  position: TradeOrder | null,
  bidPrice: number,
  askPrice: number,
): ChartAnnotation[] => {
  if (!position || position.status !== 'open' || !Number.isFinite(position.entryPrice) || position.entryPrice <= 0) return []

  const sideColor = position.type === 'BUY' ? '#22D3A5' : '#FF5C75'
  const profit = Number(position.profit ?? 0)
  const currentLineColor = Number.isFinite(profit) && profit >= 0 ? '#22D3A5' : '#FF5C75'
  const currentPrice = position.type === 'BUY' ? bidPrice : askPrice
  const result: ChartAnnotation[] = [
    {
      id: position.id + '-entry',
      price: position.entryPrice,
      label: position.type + ' ENTRY',
      color: sideColor,
      lineWidth: 2,
    },
  ]

  if (Number.isFinite(currentPrice) && currentPrice > 0) {
    result.push({
      id: position.id + '-current',
      price: currentPrice,
      label: position.type + ' CURRENT / EXIT',
      color: currentLineColor,
      lineWidth: 2,
    })
  }

  const stopLossPrice = Number(position.plannedStopLossPrice ?? position.stopLoss)
  if (Number.isFinite(stopLossPrice) && stopLossPrice > 0) {
    result.push({
      id: position.id + '-sl',
      price: stopLossPrice,
      label: 'STOP LOSS',
      color: '#FF5C75',
      lineWidth: 2,
    })
  }

  const takeProfitPrice = Number(position.plannedTakeProfitPrice ?? position.takeProfit)
  if (Number.isFinite(takeProfitPrice) && takeProfitPrice > 0) {
    result.push({
      id: position.id + '-tp',
      price: takeProfitPrice,
      label: 'TAKE PROFIT',
      color: '#22D3A5',
      lineWidth: 2,
    })
  }

  return result
}
