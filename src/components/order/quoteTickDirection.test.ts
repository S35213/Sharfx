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
