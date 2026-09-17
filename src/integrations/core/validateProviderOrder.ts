import type { ProviderInstrument, ProviderOrderRequest } from './types'

export interface ProviderOrderValidationResult {
  isValid: boolean
  reasons: string[]
}

const isAligned = (value: number, step: number, tolerance = 1e-10): boolean => {
  if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0) return false
  const quotient = value / step
  return Math.abs(quotient - Math.round(quotient)) <= tolerance
}

const validatePrice = (label: string, value: number | undefined, increment: number | undefined, reasons: string[]): void => {
  if (value === undefined) return
  if (!Number.isFinite(value) || value <= 0) {
    reasons.push(`${label} must be a positive finite number.`)
    return
  }
  if (increment !== undefined && !isAligned(value, increment)) {
    reasons.push(`${label} does not match the provider price increment.`)
  }
}

export function validateProviderOrder(order: ProviderOrderRequest, instrument: ProviderInstrument): ProviderOrderValidationResult {
  const reasons: string[] = []

  if (!instrument.tradable) reasons.push('The provider reports this instrument as not tradable.')
  if (order.symbol !== instrument.symbol) reasons.push('The order symbol does not match the selected provider instrument.')
  if (!Number.isFinite(order.quantity) || order.quantity <= 0) reasons.push('Quantity must be a positive finite number.')

  if (order.quantityUnit === 'base' || order.quantityUnit === 'units' || order.quantityUnit === 'contracts') {
    if (instrument.quantityMin !== undefined && order.quantity < instrument.quantityMin) reasons.push('Quantity is below the provider minimum.')
    if (instrument.quantityMax !== undefined && order.quantity > instrument.quantityMax) reasons.push('Quantity is above the provider maximum.')
    if (instrument.quantityStep !== undefined && !isAligned(order.quantity - (instrument.quantityMin ?? 0), instrument.quantityStep)) reasons.push('Quantity does not match the provider quantity step.')
  }

  if (instrument.supportedOrderTypes && !instrument.supportedOrderTypes.includes(order.type)) {
    reasons.push(`The provider does not support ${order.type} for this instrument.`)
  }
  if (order.timeInForce && instrument.supportedTimeInForce && !instrument.supportedTimeInForce.includes(order.timeInForce)) {
    reasons.push(`The provider does not support ${order.timeInForce} for this instrument.`)
  }

  if (order.type === 'LIMIT' || order.type === 'STOP_LIMIT') validatePrice('Limit price', order.limitPrice, instrument.priceIncrement, reasons)
  if (order.type === 'STOP' || order.type === 'STOP_LIMIT') validatePrice('Stop price', order.stopPrice, instrument.priceIncrement, reasons)
  validatePrice('Stop-loss', order.stopLoss, instrument.priceIncrement, reasons)
  validatePrice('Take-profit', order.takeProfit, instrument.priceIncrement, reasons)

  if (order.clientOrderId !== undefined && (order.clientOrderId.length < 1 || order.clientOrderId.length > 128)) {
    reasons.push('Client order ID must contain between 1 and 128 characters.')
  }

  return { isValid: reasons.length === 0, reasons }
}
