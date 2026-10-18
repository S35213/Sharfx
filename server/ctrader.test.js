import { describe, expect, it } from 'vitest'
import {
  ctraderLotsToProtocolVolume,
  ctraderProtocolVolumeToLots,
  ctraderRelativeDistanceUnits,
  isCtraderMarketOrderTerminalEvent,
  getCtraderRequestError,
  normalizeCtraderInstrument,
  normalizeCtraderOrder,
  normalizeCtraderPosition,
  normalizeCtraderSpotTimestamp,
} from './ctrader.js'

describe('cTrader request error normalization', () => {
  it('handles order errors immediately with broker details', () => {
    expect(getCtraderRequestError({
      payloadType: 2132,
      payload: { errorCode: 'TRADING_BAD_STOPS', description: 'Stop loss is too close.', orderId: 81, positionId: 92 },
    })).toEqual({
      message: 'Stop loss is too close.',
      code: 'TRADING_BAD_STOPS',
      providerCode: 'TRADING_BAD_STOPS',
      orderId: '81',
      positionId: '92',
      payloadType: 2132,
    })
  })

  it('retains generic protocol errors and ignores ordinary events', () => {
    expect(getCtraderRequestError({
      payloadType: 2142,
      payload: { errorCode: 'CH_ACCESS_TOKEN_INVALID' },
    })).toMatchObject({
      message: 'CH_ACCESS_TOKEN_INVALID',
      code: 'CH_ACCESS_TOKEN_INVALID',
      payloadType: 2142,
    })
    expect(getCtraderRequestError({ payloadType: 2126, payload: { executionType: 2 } })).toBeNull()
  })
})

describe('cTrader relative SL/TP distance encoding', () => {
  it('encodes FX pip distances in 1/100000 price units', () => {
    expect(ctraderRelativeDistanceUnits(1.12, 1.1198)).toBe(20)
    expect(ctraderRelativeDistanceUnits(1.12, 1.1204)).toBe(40)
  })

  it('supports JPY pairs and absolute distance inputs in either direction', () => {
    expect(ctraderRelativeDistanceUnits(150.12, 150.10)).toBe(2000)
    expect(ctraderRelativeDistanceUnits(150.12, 150.14)).toBe(2000)
  })

  it('rejects invalid or sub-protocol-resolution prices', () => {
    expect(() => ctraderRelativeDistanceUnits(0, 1.12)).toThrow(/valid entry/i)
    expect(() => ctraderRelativeDistanceUnits(1.12, 1.120001)).toThrow(/at least one protocol unit/i)
  })
})

describe('cTrader market execution completion', () => {
  it('does not treat accepted or partial-fill events as a completed market order', () => {
    expect(isCtraderMarketOrderTerminalEvent({
      payloadType: 2126, payload: { executionType: 2, order: { orderStatus: 1 } },
    })).toBe(false)
    expect(isCtraderMarketOrderTerminalEvent({
      payloadType: 2126, payload: { executionType: 11, order: { orderStatus: 1 } },
    })).toBe(false)
  })

  it('waits for a filled event or resolves on rejection/cancellation', () => {
    expect(isCtraderMarketOrderTerminalEvent({
      payloadType: 2126, payload: { executionType: 3, order: { orderStatus: 2 } },
    })).toBe(true)
    expect(isCtraderMarketOrderTerminalEvent({
      payloadType: 2126, payload: { executionType: 7, order: { orderStatus: 3 } },
    })).toBe(true)
    expect(isCtraderMarketOrderTerminalEvent({
      payloadType: 2126, payload: { order: { orderStatus: 5 } },
    })).toBe(true)
    expect(isCtraderMarketOrderTerminalEvent({
      payloadType: 2106, payload: { executionType: 3 },
    })).toBe(false)
  })
})

describe('cTrader SHAFX normalization', () => {
  const symbol = {
    symbolId: 17,
    name: 'EURUSD',
    lotSize: 100000,
    minVolume: 1000,
    maxVolume: 5000000,
    stepVolume: 1000,
    digits: 5,
    pipPosition: 4,
    tradingMode: 0,
  }

  it('maps SHAFX lots to cTrader protocol volume using broker lotSize', () => {
    expect(ctraderLotsToProtocolVolume(0.01, symbol)).toBe(1000)
    expect(ctraderLotsToProtocolVolume(0.25, symbol)).toBe(25000)
    expect(ctraderProtocolVolumeToLots(25000, symbol)).toBeCloseTo(0.25, 8)
  })

  it('normalizes broker symbol constraints without hard-coding every broker', () => {
    const instrument = normalizeCtraderInstrument(symbol)
    expect(instrument.symbol).toBe('EURUSD')
    expect(instrument.contractSize).toBe(1000)
    expect(instrument.pipSize).toBe(0.0001)
    expect(instrument.quantityMin).toBeCloseTo(0.01, 8)
    expect(instrument.quantityStep).toBeCloseTo(0.01, 8)
    expect(instrument.tradable).toBe(true)
  })

  it('normalizes a cTrader position to the SHAFX provider shape', () => {
    const position = normalizeCtraderPosition({
      positionId: 42,
      price: 1.17001,
      stopLoss: 1.169,
      takeProfit: 1.172,
      usedMargin: 200000000,
      moneyDigits: 8,
      tradeData: { symbolId: 17, tradeSide: 1, volume: 25000, openTimestamp: '2026-10-06T10:00:00.000Z' },
    }, { '42': 12.34 })

    expect(position.id).toBe('42')
    expect(position.side).toBe('BUY')
    expect(position.volumeProtocol).toBe(25000)
    expect(position.unrealizedPL).toBeCloseTo(12.34, 8)
    expect(position.usedMargin).toBeCloseTo(2, 8)
  })

  it('normalizes cTrader order status conservatively', () => {
    const order = normalizeCtraderOrder({
      orderId: 7,
      orderStatus: 3,
      utcLastUpdateTimestamp: 1000,
      tradeData: { symbolId: 17, tradeSide: 2, volume: 1000 },
    })
    expect(order.providerOrderId).toBe('7')
    expect(order.status).toBe('rejected')
    expect(order.side).toBe('SELL')
  })

  it('uses the distinct cTrader execution-event status enum', () => {
    const filled = normalizeCtraderOrder({
      executionType: 3,
      order: { orderId: 8, orderStatus: 1, tradeData: { symbolId: 17, tradeSide: 1, volume: 1000 } },
    })
    const rejected = normalizeCtraderOrder({
      executionType: 7,
      orderId: 9,
      tradeData: { symbolId: 17, tradeSide: 2, volume: 1000 },
    })
    expect(filled.status).toBe('filled')
    expect(rejected.status).toBe('rejected')
  })
})


describe('cTrader spot quote source timestamps', () => {
  const now = Date.parse('2026-10-18T11:48:00.000Z')

  it('uses the supplied broker timestamp instead of local receipt time', () => {
    expect(normalizeCtraderSpotTimestamp(now - 30_000, now))
      .toBe('2026-10-18T11:47:30.000Z')
  })

  it('preserves an old Friday timestamp so freshness checks can pause the market', () => {
    expect(normalizeCtraderSpotTimestamp(Date.parse('2026-10-16T20:59:00.000Z'), now))
      .toBe('2026-10-16T20:59:00.000Z')
  })

  it('rejects missing source timestamps rather than fabricating fresh quotes', () => {
    expect(() => normalizeCtraderSpotTimestamp(undefined, now))
      .toThrow(/omitted its source timestamp/i)
    expect(() => normalizeCtraderSpotTimestamp('', now))
      .toThrow(/omitted its source timestamp/i)
  })

  it('rejects invalid and implausibly future timestamps', () => {
    expect(() => normalizeCtraderSpotTimestamp('not-a-time', now))
      .toThrow(/invalid source timestamp/i)
    expect(() => normalizeCtraderSpotTimestamp(now + 600_000, now))
      .toThrow(/future/i)
  })
})
