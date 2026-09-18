import { describe, expect, it } from 'vitest'
import { BINANCE_PROVIDER_DESCRIPTOR } from './descriptor'
import { symbolMappingRegistry } from '../core/symbolMapping'

describe('Binance provider contract', () => {
  it('advertises read-only Spot capabilities and credential schema', () => {
    expect(BINANCE_PROVIDER_DESCRIPTOR.status).toBe('available')
    expect(BINANCE_PROVIDER_DESCRIPTOR.capabilities.accountRead).toBe(true)
    expect(BINANCE_PROVIDER_DESCRIPTOR.capabilities.marketData).toBe(true)
    expect(BINANCE_PROVIDER_DESCRIPTOR.capabilities.orderPlacement).toBe(false)
    expect(BINANCE_PROVIDER_DESCRIPTOR.credentialFields?.map((field) => field.key)).toEqual(['apiKey', 'apiSecret', 'environment', 'label'])
  })

  it('keeps provider symbol mapping isolated from other providers', () => {
    const mapped = symbolMappingRegistry.mapToProvider('binance', 'BTC/USDT')
    expect(mapped).toBeNull()
    expect(symbolMappingRegistry.mapToProvider('oanda', 'EURUSD')?.providerSymbol).toBe('EUR_USD')
  })
})