import { describe, expect, it } from 'vitest'
import { normalizeProviderSymbol, providerSymbolsMatch } from './normalizeProviderSymbol'

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

describe('providerSymbolsMatch', () => {
  it.each([
    ['EURUSD', 'EUR/USD'],
    ['EURUSD.r', 'EUR/USD'],
    ['frxEURUSD.pro', 'EURUSD'],
    ['GBPJPY-ECN', 'GBP/JPY'],
    ['XAUUSD', 'XAU/USD'],
  ])('matches broker symbol %s to selected symbol %s', (brokerSymbol, selectedSymbol) => {
    expect(providerSymbolsMatch(brokerSymbol, selectedSymbol)).toBe(true)
  })

  it.each([
    ['EURUSD.r', 'GBP/USD'],
    ['USDJPY', 'EUR/JPY'],
    ['US30', 'EUR/USD'],
  ])('does not match different instruments %s and %s', (left, right) => {
    expect(providerSymbolsMatch(left, right)).toBe(false)
  })
})
