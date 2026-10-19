import { describe, expect, it } from 'vitest'
import { scaleAutoRiskDistance } from './autoRiskDistances'

describe('AUTO risk-based stop/target distances', () => {
  it('keeps the 10-unit reference distances unchanged', () => {
    expect(scaleAutoRiskDistance(10, 10)).toBe(10)
    expect(scaleAutoRiskDistance(20, 10)).toBe(20)
  })

  it('scales the default stop and target with the selected risk amount', () => {
    expect(scaleAutoRiskDistance(10, 2)).toBe(2)
    expect(scaleAutoRiskDistance(20, 2)).toBe(4)
    expect(scaleAutoRiskDistance(10, 4)).toBe(4)
    expect(scaleAutoRiskDistance(20, 4)).toBe(8)
  })

  it('scales a selected setup proportionally rather than using fixed defaults', () => {
    expect(scaleAutoRiskDistance(15, 2)).toBe(3)
    expect(scaleAutoRiskDistance(30, 2)).toBe(6)
  })

  it('keeps very small calculated distances at least one pip', () => {
    expect(scaleAutoRiskDistance(2, 1)).toBe(1)
  })

  it('uses the base distance while the risk amount is blank or invalid', () => {
    expect(scaleAutoRiskDistance(10, 0)).toBe(10)
    expect(scaleAutoRiskDistance(20, Number.NaN)).toBe(20)
  })
})
