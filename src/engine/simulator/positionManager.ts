import type { SymbolSpec, TradeOrder } from '../../types'

export interface PositionCloseInput {
  exitPrice: number
  closeTime?: string
  conversionRate?: number
}

export interface PositionMarkInput {
  currentPrice: number
  symbolSpec: SymbolSpec
  conversionRate?: number
}

const finitePositive = (value: number): boolean => Number.isFinite(value) && value > 0

const conversion = (spec: SymbolSpec, rate?: number): number => {
  if (spec.quoteCurrency === 'USD') return 1
  if (typeof rate !== 'number' || !finitePositive(rate)) throw new Error(`Missing or invalid conversion rate for ${spec.quoteCurrency}/USD.`)
  return rate
}

export const calculatePositionProfit = (order: TradeOrder, exitPrice: number, spec: SymbolSpec, conversionRate?: number): number => {
  if (!finitePositive(exitPrice)) throw new Error('Exit price must be a positive finite number.')
  if (!finitePositive(order.lotSize) || !finitePositive(spec.pipSize) || !finitePositive(spec.contractSize)) throw new Error('Position or symbol specification is invalid.')
  const rate = conversion(spec, conversionRate)
  const pips = (exitPrice - order.entryPrice) / spec.pipSize * (order.type === 'BUY' ? 1 : -1)
  const profit = pips * spec.pipSize * spec.contractSize * order.lotSize * rate
  if (!Number.isFinite(profit)) throw new Error('Calculated position profit is invalid.')
  return Number(profit.toFixed(2))
}

export const closeSimulatedPosition = (order: TradeOrder, input: PositionCloseInput, spec: SymbolSpec): TradeOrder => {
  if (order.status !== 'open') throw new Error('Only open positions can be closed.')
  const profit = calculatePositionProfit(order, input.exitPrice, spec, input.conversionRate)
  return { ...order, status: 'closed', closeTime: input.closeTime ?? new Date().toISOString(), profit }
}

export const markSimulatedPosition = (order: TradeOrder, input: PositionMarkInput): TradeOrder => {
  if (order.status !== 'open') return order
  const price = input.currentPrice
  if (!finitePositive(price)) throw new Error('Current price must be a positive finite number.')
  const hitStop = order.stopLoss !== null && (order.type === 'BUY' ? price <= order.stopLoss : price >= order.stopLoss)
  const hitTarget = order.takeProfit !== null && (order.type === 'BUY' ? price >= order.takeProfit : price <= order.takeProfit)
  if (hitStop || hitTarget) {
    const exitPrice = hitStop ? order.stopLoss : order.takeProfit
    if (exitPrice === null) return order
    return closeSimulatedPosition(order, { exitPrice, conversionRate: input.conversionRate }, input.symbolSpec)
  }
  const profit = calculatePositionProfit(order, price, input.symbolSpec, input.conversionRate)
  return { ...order, profit }
}
