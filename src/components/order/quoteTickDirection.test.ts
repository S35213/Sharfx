import { describe, expect, it } from 'vitest'
import { getQuoteTickDirection } from './quoteTickDirection'

describe('getQuoteTickDirection', () => {
  it('marks an actual upward quote move green/up', () => {
    expect(getQuoteTickDirection(1.12001, 1.12)).toBe('up')
  })

  it('marks an actual downward quote move red/down', () => {
    expect(getQuoteTickDirection(1.11999, 1.12)).toBe('down')
  })

  it('returns neutral for unchanged or unavailable prices', () => {
    expect(getQuoteTickDirection(1.12, 1.12)).toBe('neutral')
    expect(getQuoteTickDirection(Number.NaN, 1.12)).toBe('neutral')
  })
})

describe('getTradeButtonDirection', () => {
  it('colors BUY up and SELL down when price rises', async () => {
    const { getTradeButtonDirection } = await import('./quoteTickDirection')
    expect(getTradeButtonDirection('up', 'BUY')).toBe('up')
    expect(getTradeButtonDirection('up', 'SELL')).toBe('down')
  })

  it('colors BUY down and SELL up when price falls', async () => {
    const { getTradeButtonDirection } = await import('./quoteTickDirection')
    expect(getTradeButtonDirection('down', 'BUY')).toBe('down')
    expect(getTradeButtonDirection('down', 'SELL')).toBe('up')
  })

  it('returns neutral for both buttons when the market price is unchanged', async () => {
    const { getTradeButtonDirection } = await import('./quoteTickDirection')
    expect(getTradeButtonDirection('neutral', 'BUY')).toBe('neutral')
    expect(getTradeButtonDirection('neutral', 'SELL')).toBe('neutral')
  })
})
