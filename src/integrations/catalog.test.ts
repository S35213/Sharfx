import { describe, expect, it } from 'vitest'
import { providerCatalog } from './catalog'
import { supportsDeposit, supportsOrderPlacement, supportsWithdrawal } from './core/providerRegistry'

const byId = (id: string) => {
  const provider = providerCatalog.find((item) => item.id === id)
  if (!provider) throw new Error(`Missing provider in test: ${id}`)
  return provider
}

describe('SHAFX provider catalog', () => {
  it('keeps simulator, Deriv and OANDA adapters available', () => {
    expect(byId('simulator').status).toBe('available')
    expect(byId('deriv').status).toBe('available')
    expect(byId('deriv').capabilities.accountRead).toBe(true)
    expect(byId('deriv').capabilities.marketData).toBe(true)
    expect(byId('deriv').capabilities.realtimeMarketData).toBe(true)
    expect(byId('deriv').capabilities.realtimeAccountData).toBe(true)
    expect(byId('deriv').capabilities.historicalCandles).toBe(true)
    expect(byId('deriv').capabilities.positionsRead).toBe(false)
    expect(byId('oanda').status).toBe('available')
    expect(byId('oanda').capabilities.accountRead).toBe(true)
    expect(byId('oanda').capabilities.marketData).toBe(true)
    expect(byId('oanda').capabilities.historicalCandles).toBe(true)
    expect(byId('oanda').capabilities.realtimeMarketData).toBe(true)
    expect(byId('oanda').capabilities.realtimeAccountData).toBe(true)
    expect(byId('oanda').capabilities.positionsRead).toBe(true)
    expect(byId('oanda').capabilities.ordersRead).toBe(true)
    expect(byId('oanda').capabilities.symbolMetadata).toBe(true)
  })

  it('does not advertise real execution before an execution adapter exists', () => {
    expect(supportsOrderPlacement(byId('deriv'))).toBe(false)
    expect(supportsOrderPlacement(byId('binance'))).toBe(false)
    expect(supportsOrderPlacement(byId('oanda'))).toBe(false)
  })

  it('does not conflate account/market integration with funding', () => {
    expect(supportsDeposit(byId('deriv'))).toBe(false)
    expect(supportsWithdrawal(byId('deriv'))).toBe(false)
    expect(byId('deriv').capabilities.funding.deposit).toBe('unsupported')
    expect(byId('deriv').capabilities.funding.withdrawal).toBe('unsupported')
    expect(supportsDeposit(byId('simulator'))).toBe(false)
    expect(supportsWithdrawal(byId('simulator'))).toBe(false)
  })

  it('keeps planned providers visible without pretending they are implemented', () => {
    expect(byId('binance').status).toBe('planned')
    expect(byId('ibkr').status).toBe('planned')
    expect(byId('binance').capabilities.marketData).toBe(false)
    expect(byId('oanda').capabilities.orderPlacement).toBe(false)
    expect(byId('ibkr').capabilities.accountRead).toBe(false)
  })
})
