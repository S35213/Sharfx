import { describe, expect, it } from 'vitest'
import { providerCatalog } from './catalog'
import { supportsDeposit, supportsOrderPlacement, supportsWithdrawal } from './core/providerRegistry'

const byId = (id: string) => {
  const provider = providerCatalog.find((item) => item.id === id)
  if (!provider) throw new Error('Missing provider in test: ' + id)
  return provider
}

describe('SHAFX provider catalog', () => {
  it('keeps Deriv, OANDA and Binance adapters available', () => {
    expect(byId('deriv').status).toBe('available')
    expect(byId('oanda').status).toBe('available')
    expect(byId('binance').status).toBe('available')
    expect(byId('binance').capabilities.accountRead).toBe(true)
    expect(byId('binance').capabilities.marketData).toBe(true)
    expect(byId('binance').capabilities.historicalCandles).toBe(true)
    expect(byId('binance').capabilities.ordersRead).toBe(true)
    expect(byId('binance').capabilities.orderPlacement).toBe(false)
  })

  it('keeps provider execution capabilities explicit', () => {
    expect(supportsOrderPlacement(byId('deriv'))).toBe(false)
    expect(supportsOrderPlacement(byId('binance'))).toBe(false)
    expect(supportsOrderPlacement(byId('oanda'))).toBe(true)
    expect(byId('oanda').executionMode).toBe('external')
  })

  it('does not conflate account/market integration with funding', () => {
    expect(supportsDeposit(byId('deriv'))).toBe(true)
    expect(supportsWithdrawal(byId('deriv'))).toBe(true)
    expect(supportsDeposit(byId('binance'))).toBe(false)
    expect(supportsWithdrawal(byId('binance'))).toBe(false)
  })

  it('keeps future session-heavy providers planned', () => {
    expect(byId('ibkr').status).toBe('planned')
    expect(byId('ibkr').capabilities.accountRead).toBe(false)
  })
})