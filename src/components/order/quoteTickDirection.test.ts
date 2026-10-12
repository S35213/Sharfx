import { describe, expect, it } from 'vitest'
import { getQuoteTickColor, getQuoteTickDirection } from './quoteTickDirection'

describe('getQuoteTickDirection', () => {
  it('marks an actual upward quote move blue/up', () => {
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
  it('lets BUY and SELL both show green when their quotes rise', async () => {
    const { getTradeButtonDirection } = await import('./quoteTickDirection')
    expect(getTradeButtonDirection('up', 'BUY')).toBe('up')
    expect(getTradeButtonDirection('up', 'SELL')).toBe('up')
  })

  it('lets BUY and SELL both show red when their quotes fall', async () => {
    const { getTradeButtonDirection } = await import('./quoteTickDirection')
    expect(getTradeButtonDirection('down', 'BUY')).toBe('down')
    expect(getTradeButtonDirection('down', 'SELL')).toBe('down')
  })

  it('keeps BUY Ask and SELL Bid colors independent when their actual ticks differ', async () => {
    const { getTradeButtonDirection } = await import('./quoteTickDirection')
    const askDirection = getQuoteTickDirection(1.12000, 1.12001)
    const bidDirection = getQuoteTickDirection(1.12002, 1.12001)
    expect(getTradeButtonDirection(askDirection, 'BUY')).toBe('down')
    expect(getTradeButtonDirection(bidDirection, 'SELL')).toBe('up')
  })

  it('keeps both buttons neutral until a quote direction is known', async () => {
    const { getTradeButtonDirection } = await import('./quoteTickDirection')
    expect(getTradeButtonDirection('neutral', 'BUY')).toBe('neutral')
    expect(getTradeButtonDirection('neutral', 'SELL')).toBe('neutral')
  })
})


describe('getQuoteTickColor', () => {
  it('uses blue for upticks, red for downticks, and neutral for unavailable prices', () => {
    expect(getQuoteTickColor('up')).toBe('#2F80FF')
    expect(getQuoteTickColor('down')).toBe('#F04452')
    expect(getQuoteTickColor('neutral')).toBe('#DDE4EC')
  })
})
