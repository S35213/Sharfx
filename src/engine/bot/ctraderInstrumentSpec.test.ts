import { describe, expect, it } from 'vitest'
import type { CTraderLiveInstrument } from '../../data/ctrader/CTraderLiveQuote'
import { cTraderInstrumentToSymbolSpec } from './ctraderInstrumentSpec'

const instrument = (overrides: Partial<CTraderLiveInstrument> = {}): CTraderLiveInstrument => ({
  symbol: 'EURUSD',
  providerSymbol: '1',
  contractSize: 100_000,
  pipSize: 0.0001,
  quantityMin: 0.01,
  quantityMax: 100,
  quantityStep: 0.01,
  priceIncrement: 0.00001,
  tradable: true,
  ...overrides,
})

describe('cTrader Trade Bot instrument specification', () => {
  it('builds a SymbolSpec from matching broker contract data', () => {
    expect(cTraderInstrumentToSymbolSpec('EUR/USD', instrument())).toEqual({
      symbol: 'EUR/USD',
      baseCurrency: 'EUR',
      quoteCurrency: 'USD',
      pipSize: 0.0001,
      contractSize: 100_000,
      minLotSize: 0.01,
      maxLotSize: 100,
      lotStep: 0.01,
      pricePrecision: 5,
    })
  })

  it('supports three-letter metal codes when the provider confirms the same instrument', () => {
    const gold = instrument({
      symbol: 'XAUUSD',
      contractSize: 100,
      pipSize: 0.01,
      priceIncrement: 0.001,
    })
    expect(cTraderInstrumentToSymbolSpec('XAU/USD', gold)).toMatchObject({
      symbol: 'XAU/USD',
      baseCurrency: 'XAU',
      quoteCurrency: 'USD',
      contractSize: 100,
      pipSize: 0.01,
      pricePrecision: 3,
    })
  })

  it('rejects an instrument for a different selected symbol', () => {
    expect(cTraderInstrumentToSymbolSpec('EUR/USD', instrument({ symbol: 'GBPUSD' }))).toBeNull()
  })

  it('rejects non-tradable instruments', () => {
    expect(cTraderInstrumentToSymbolSpec('EUR/USD', instrument({ tradable: false }))).toBeNull()
  })

  it.each([
    ['contract size', { contractSize: undefined }],
    ['pip size', { pipSize: undefined }],
    ['minimum volume', { quantityMin: undefined }],
    ['maximum volume', { quantityMax: undefined }],
    ['volume step', { quantityStep: 0 }],
    ['price increment', { priceIncrement: Number.NaN }],
    ['inverted volume bounds', { quantityMin: 1, quantityMax: 0.1 }],
  ])('rejects incomplete or invalid broker field: %s', (_field, overrides) => {
    expect(cTraderInstrumentToSymbolSpec('EUR/USD', instrument(overrides))).toBeNull()
  })

  it('fails closed when the selected CFD name does not identify base and quote currencies', () => {
    expect(cTraderInstrumentToSymbolSpec('US30', instrument({ symbol: 'US30' }))).toBeNull()
  })
})
