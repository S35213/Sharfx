import { describe, expect, it } from 'vitest'
import { learnFromTrades } from './learning'

describe('learnFromTrades', () => {
  it('does not invent learning without completed outcomes', () => {
    const result = learnFromTrades([{ symbol: 'EURUSD', direction: 'BUY' }])
    expect(result.lessons).toHaveLength(0)
    expect(result.confidenceAdjustment).toBe(0)
  })

  it('marks repeated underperformance for caution', () => {
    const result = learnFromTrades([
      { symbol: 'EURUSD', direction: 'BUY', profit: -10 },
      { symbol: 'EURUSD', direction: 'BUY', profit: -5 },
      { symbol: 'EURUSD', direction: 'BUY', profit: 2 },
    ])
    expect(result.cautionKeys).toContain('EURUSD:BUY')
    expect(result.confidenceAdjustment).toBe(-10)
  })

  it('recognizes positive history without claiming certainty', () => {
    const result = learnFromTrades([
      { symbol: 'EURUSD', direction: 'SELL', profit: 10 },
      { symbol: 'EURUSD', direction: 'SELL', profit: 5 },
      { symbol: 'EURUSD', direction: 'SELL', profit: 3 },
    ])
    expect(result.lessons[0]?.winRate).toBe(100)
    expect(result.lessons[0]?.lesson).toContain('evidence')
    expect(result.confidenceAdjustment).toBe(5)
  })
})
