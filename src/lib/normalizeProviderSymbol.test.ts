import { describe, expect, it } from 'vitest'
import { normalizeProviderSymbol } from './normalizeProviderSymbol'

describe('normalizeProviderSymbol', () => {
  it.each([
    ['EURUSD', 'EUR/USD'],
    ['eurusd', 'EUR/USD'],
    ['EUR/USD', 'EUR/USD'],
    ['frxEURUSD', 'EUR/USD'],
    ['XAUUSD', 'XAU/USD'],
    ['GBPJPY', 'GBP/JPY'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizeProviderSymbol(input)).toBe(expected)
  })

  it.each(['US30', 'BTCUSD.r', '', '  '])('preserves non-six-letter or broker-specific symbol %s', (input) => {
    expect(normalizeProviderSymbol(input)).toBe(input)
  })
})
