import { describe, expect, it } from 'vitest'
import { providerCatalog } from './catalog'
import { supportsDeposit, supportsOrderPlacement, supportsWithdrawal } from './core/providerRegistry'

const byId = (id: string) => {
  const provider = providerCatalog.find((item) => item.id === id)
  if (!provider) throw new Error(`Missing provider in test: ${id}`)
  return provider
}

describe('SHAFX provider catalog', () => {
  it('keeps simulator and current Deriv integration available', () => {
    expect(byId('simulator').status).toBe('available')
    expect(byId('deriv').status).toBe('available')
  })

  it('does not advertise real execution before an execution adapter exists', () => {
    expect(supportsOrderPlacement(byId('deriv'))).toBe(false)
    expect(supportsOrderPlacement(byId('binance'))).toBe(false)
  })

  it('represents funding separately from trading capability', () => {
    expect(supportsDeposit(byId('deriv'))).toBe(true)
    expect(supportsWithdrawal(byId('deriv'))).toBe(true)
    expect(byId('deriv').capabilities.funding.deposit).toBe('redirect')
    expect(byId('deriv').capabilities.funding.withdrawal).toBe('redirect')
    expect(supportsDeposit(byId('simulator'))).toBe(false)
    expect(supportsWithdrawal(byId('simulator'))).toBe(false)
  })

  it('keeps planned providers visible without pretending they are implemented', () => {
    expect(byId('binance').status).toBe('planned')
    expect(byId('oanda').status).toBe('planned')
    expect(byId('ibkr').status).toBe('planned')
    expect(byId('binance').capabilities.marketData).toBe(false)
    expect(byId('oanda').capabilities.orderPlacement).toBe(false)
    expect(byId('ibkr').capabilities.accountRead).toBe(false)
  })
})
