import { describe, expect, it } from 'vitest'
import { resolvePriceLabelY } from './priceLineLabelLayout'

describe('resolvePriceLabelY', () => {
  it('keeps an above-chart level visible at the top rail', () => {
    expect(resolvePriceLabelY(-20, 1.13, 1.12, 42, 300)).toBe(42)
  })

  it('keeps a below-chart level visible at the bottom rail', () => {
    expect(resolvePriceLabelY(400, 1.10, 1.12, 42, 300)).toBe(300)
  })

  it('keeps labels anchored within the visible plot range', () => {
    expect(resolvePriceLabelY(160, 1.12, 1.12, 42, 300)).toBe(160)
  })

  it('uses the nearest edge when the chart cannot resolve the price coordinate', () => {
    expect(resolvePriceLabelY(null, 1.13, 1.12, 42, 300)).toBe(42)
    expect(resolvePriceLabelY(null, 1.11, 1.12, 42, 300)).toBe(300)
  })
})
