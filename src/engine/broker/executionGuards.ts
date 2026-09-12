import type { SimulatedOrderDraft } from '../../types'

export interface ExecutionGuardInput {
  order: SimulatedOrderDraft
  currentPrice: number
  maxPriceAgeSeconds: number
  priceTimestamp: number
  nowSeconds: number
  expectedConfirmationId: string
  confirmationId: string
}

export interface ExecutionGuardResult {
  isValid: boolean
  reason?: string
}

export function validateExecutionGuards(input: ExecutionGuardInput): ExecutionGuardResult {
  const values = [
    input.currentPrice,
    input.maxPriceAgeSeconds,
    input.priceTimestamp,
    input.nowSeconds,
    input.order.entryPrice,
    input.order.lotSize,
  ]

  if (values.some((value) => !Number.isFinite(value))) {
    return { isValid: false, reason: 'Execution data contains a non-finite value.' }
  }

  if (input.currentPrice <= 0 || input.order.entryPrice <= 0 || input.order.lotSize <= 0) {
    return { isValid: false, reason: 'Execution prices and lot size must be positive.' }
  }

  if (input.maxPriceAgeSeconds < 0 || input.priceTimestamp < 0 || input.nowSeconds < 0) {
    return { isValid: false, reason: 'Execution timestamps must be non-negative.' }
  }

  if (input.priceTimestamp > input.nowSeconds) {
    return { isValid: false, reason: 'The market-price timestamp is in the future.' }
  }

  if (input.nowSeconds - input.priceTimestamp > input.maxPriceAgeSeconds) {
    return { isValid: false, reason: 'The market price is stale; execution is blocked.' }
  }

  if (input.confirmationId.trim() !== input.expectedConfirmationId.trim()) {
    return { isValid: false, reason: 'The execution confirmation does not match the approved request.' }
  }

  return { isValid: true }
}
