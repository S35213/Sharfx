import { describe, expect, it } from 'vitest'
import {
  ctraderLotsToProtocolVolume,
  ctraderProtocolVolumeToLots,
  normalizeCtraderInstrument,
  normalizeCtraderOrder,
  normalizeCtraderPosition,
} from './ctrader.js'

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
})
