import { describe, expect, it } from 'vitest'
import { resolveTradeBotLotSize } from './tradeBotLotSizing'

const limits = {
  minimumLots: 0.01,
  maximumLots: 20,
  lotStep: 0.01,
}

describe('Trade Bot requested lot sizing', () => {
  it('respects the user's lot when risk and broker rules allow it', () => {
    expect(resolveTradeBotLotSize({
      ...limits,
      requestedLots: 0.03,
      riskAllowedLots: 0.05,
    })).toMatchObject({ lotSize: 0.03, adjusted: false, error: null })
  })

  it('automatically reduces a requested lot to the account risk limit', () => {
    expect(resolveTradeBotLotSize({
      ...limits,
      requestedLots: 0.1,
      riskAllowedLots: 0.04,
    })).toMatchObject({
      lotSize: 0.04,
      adjusted: true,
      adjustmentReason: 'Lot size adjusted to 0.04 lots to fit the account stop-risk limit.',
      error: null,
    })
  })

  it('rounds down to broker lot increments and never rounds up', () => {
    expect(resolveTradeBotLotSize({
      ...limits,
      requestedLots: 0.057,
      riskAllowedLots: 0.05,
    })).toMatchObject({ lotSize: 0.05, adjusted: true, error: null })
  })

  it('caps the request at the broker maximum', () => {
    expect(resolveTradeBotLotSize({
      ...limits,
      requestedLots: 25,
      riskAllowedLots: 4,
    })).toMatchObject({
      lotSize: 4,
      adjusted: true,
      adjustmentReason: 'Lot size adjusted to 4 lots to fit the broker maximum and account stop-risk limit.',
      error: null,
    })
  })

  it('blocks when even the minimum lot exceeds the risk allowance', () => {
    expect(resolveTradeBotLotSize({
      ...limits,
      requestedLots: 0.01,
      riskAllowedLots: 0.005,
    })).toMatchObject({
      lotSize: null,
      error: 'The broker minimum of 0.01 lots exceeds the account stop-risk limit. No entry is safe for this setup.',
    })
  })

  it('rejects a user-entered lot smaller than the broker minimum', () => {
    expect(resolveTradeBotLotSize({
      ...limits,
      requestedLots: 0.005,
      riskAllowedLots: 0.1,
    })).toMatchObject({
      lotSize: null,
      error: 'The requested lot is below the broker minimum of 0.01 lots.',
    })
  })
})
