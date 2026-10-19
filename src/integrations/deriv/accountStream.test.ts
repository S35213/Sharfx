import { describe, expect, it } from 'vitest'
import { deriveMultiplierAccountMetrics } from './accountStream'

describe('deriveMultiplierAccountMetrics', () => {
  it('tracks equity, used stake, and free margin from open multiplier contracts', () => {
    const result = deriveMultiplierAccountMetrics(1000, [
      { contract_id: '1', stake: 10, profit: 2.5 },
      { contract_id: '2', buy_price: 25, profit: -4 },
    ])

    expect(result.balance).toBe(1000)
    expect(result.floatingPL).toBe(-1.5)
    expect(result.equity).toBe(998.5)
    expect(result.usedMargin).toBe(35)
    expect(result.freeMargin).toBe(963.5)
  })

  it('does not report negative free margin', () => {
    const result = deriveMultiplierAccountMetrics(10, [
      { contract_id: '1', stake: 50, profit: -20 },
    ])

    expect(result.equity).toBe(-10)
    expect(result.usedMargin).toBe(50)
    expect(result.freeMargin).toBe(0)
  })
})
