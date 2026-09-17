import { describe, expect, it } from 'vitest'
import type { ProviderInstrument, ProviderOrderRequest } from './types'
import { validateProviderOrder } from './validateProviderOrder'

const instrument: ProviderInstrument = {
  symbol: 'EURUSD',
  providerSymbol: 'EUR_USD',
  tradable: true,
  priceIncrement: 0.00001,
  quantityMin: 0.01,
  quantityMax: 10,
  quantityStep: 0.01,
  supportedOrderTypes: ['MARKET', 'LIMIT', 'STOP'],
  supportedTimeInForce: ['GTC', 'DAY'],
}

const baseOrder: ProviderOrderRequest = {
  symbol: 'EURUSD',
  side: 'BUY',
  quantity: 0.01,
  quantityUnit: 'units',
  type: 'MARKET',
}

describe('validateProviderOrder', () => {
  it('accepts an order matching provider constraints', () => {
    expect(validateProviderOrder(baseOrder, instrument)).toEqual({ isValid: true, reasons: [] })
  })

  it('blocks an order below the provider minimum', () => {
    const result = validateProviderOrder({ ...baseOrder, quantity: 0.005 }, instrument)
    expect(result.isValid).toBe(false)
    expect(result.reasons).toContain('Quantity is below the provider minimum.')
  })

  it('blocks unsupported order types and time-in-force', () => {
    const result = validateProviderOrder({ ...baseOrder, type: 'STOP_LIMIT', timeInForce: 'IOC' }, instrument)
    expect(result.isValid).toBe(false)
    expect(result.reasons).toContain('The provider does not support STOP_LIMIT for this instrument.')
    expect(result.reasons).toContain('The provider does not support IOC for this instrument.')
  })

  it('blocks prices that do not match the provider increment', () => {
    const result = validateProviderOrder({ ...baseOrder, type: 'LIMIT', limitPrice: 1.123456 }, instrument)
    expect(result.isValid).toBe(false)
    expect(result.reasons).toContain('Limit price does not match the provider price increment.')
  })

  it('fails closed for a non-tradable instrument', () => {
    const result = validateProviderOrder(baseOrder, { ...instrument, tradable: false })
    expect(result.isValid).toBe(false)
    expect(result.reasons).toContain('The provider reports this instrument as not tradable.')
  })
})
