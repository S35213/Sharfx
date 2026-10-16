import { describe, expect, it } from 'vitest'
import { isPriceLevelOccludedByQuote } from './priceLineVisibility'

describe('isPriceLevelOccludedByQuote', () => {
  it('hides a structural line while a live quote crosses its pixel row', () => {
    expect(isPriceLevelOccludedByQuote(100, [94, null, 180], 7)).toBe(true)
  })

  it('restores the line once the quote has moved beyond the overlap zone', () => {
    expect(isPriceLevelOccludedByQuote(100, [112, 140], 7)).toBe(false)
  })

  it('does not hide a level when its coordinates are unavailable', () => {
    expect(isPriceLevelOccludedByQuote(null, [100], 7)).toBe(false)
  })
})
