import { describe, expect, it } from 'vitest'
import { getSymbolSpec } from './symbols'

describe('symbol display precision', () => {
  it('keeps one fractional-pip digit for XAU/USD', () => {
    const spec = getSymbolSpec('XAU/USD')
    expect(spec.pipSize).toBe(0.01)
    expect(spec.pricePrecision).toBe(3)
    expect((1158.141).toFixed(spec.pricePrecision)).toBe('1158.141')
  })

  it('keeps five-decimal fractional-pip precision for major FX', () => {
    const spec = getSymbolSpec('EUR/USD')
    expect(spec.pipSize).toBe(0.0001)
    expect(spec.pricePrecision).toBe(5)
    expect((1.08541).toFixed(spec.pricePrecision)).toBe('1.08541')
  })
})
