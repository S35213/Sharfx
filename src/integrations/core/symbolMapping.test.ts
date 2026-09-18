import { describe, expect, it } from 'vitest'
import { SymbolMappingRegistry } from './symbolMapping'

describe('SymbolMappingRegistry', () => {
  it('maps normalized and alias symbols to provider symbols', () => {
    const registry = new SymbolMappingRegistry()
    registry.register({ providerId: 'test', normalizedSymbol: 'EUR/USD', providerSymbol: 'EUR_USD', aliases: ['EURUSD'] })

    expect(registry.mapToProvider('test', 'EUR/USD')).toMatchObject({ normalizedSymbol: 'EUR/USD', providerSymbol: 'EUR_USD', source: 'exact' })
    expect(registry.mapToProvider('test', ' eurusd ')).toMatchObject({ normalizedSymbol: 'EUR/USD', providerSymbol: 'EUR_USD', source: 'alias' })
    expect(registry.mapFromProvider('test', 'EUR_USD')).toMatchObject({ normalizedSymbol: 'EUR/USD', providerSymbol: 'EUR_USD' })
  })

  it('keeps providers isolated', () => {
    const registry = new SymbolMappingRegistry()
    registry.register({ providerId: 'a', normalizedSymbol: 'EUR/USD', providerSymbol: 'A_EURUSD' })
    registry.register({ providerId: 'b', normalizedSymbol: 'EUR/USD', providerSymbol: 'B.EURUSD' })

    expect(registry.mapToProvider('a', 'EUR/USD')?.providerSymbol).toBe('A_EURUSD')
    expect(registry.mapToProvider('b', 'EUR/USD')?.providerSymbol).toBe('B.EURUSD')
  })

  it('rejects duplicate normalized mappings within one provider', () => {
    const registry = new SymbolMappingRegistry()
    registry.register({ providerId: 'test', normalizedSymbol: 'EUR/USD', providerSymbol: 'EUR_USD' })
    expect(() => registry.register({ providerId: 'test', normalizedSymbol: 'EURUSD', providerSymbol: 'EUR/USD' })).toThrow()
  })
})
