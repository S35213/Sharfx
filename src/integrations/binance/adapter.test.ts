import { describe, expect, it } from 'vitest'
import { normalizeBinanceAccount, normalizeBinanceCandles, normalizeBinanceInstruments, normalizeBinanceOrders, normalizeBinanceQuote } from '../../../server/binance.js'

describe('Binance normalization', () => {
  it('normalizes a spot account without exposing credentials', () => {
    const account = normalizeBinanceAccount({
      uid: 123,
      accountType: 'SPOT',
      canTrade: true,
      balances: [
        { asset: 'USDT', free: '100.25', locked: '2.75' },
        { asset: 'BTC', free: '0.01', locked: '0' },
      ],
    }, 'demo')
    expect(account.accountId).toBe('123')
    expect(account.currency).toBe('USDT')
    expect(account.balance).toBe(103)
    expect(account.environment).toBe('demo')
    expect(account.metadata?.canTrade).toBe(true)
  })

  it('normalizes order states and candle rows', () => {
    const orders = normalizeBinanceOrders([{ orderId: 10, status: 'FILLED', side: 'SELL', origQty: '0.5', symbol: 'BTCUSDT', time: 1000 }])
    const candles = normalizeBinanceCandles([[1000, '1', '2', '0.5', '1.5', '10', 2000]], 'BTC/USDT', 'M1')
    expect(orders[0]).toMatchObject({ providerOrderId: '10', status: 'filled', side: 'SELL', quantity: 0.5 })
    expect(candles[0]).toMatchObject({ open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 })
  })

  it('normalizes quotes and symbol metadata', () => {
    expect(normalizeBinanceQuote({ bidPrice: '1', askPrice: '2', lastPrice: '1.5' }, 'BTC/USDT')).toMatchObject({ bid: 1, ask: 2, last: 1.5 })
    const instruments = normalizeBinanceInstruments({
      symbols: [{
        symbol: 'BTCUSDT',
        baseAsset: 'BTC',
        quoteAsset: 'USDT',
        status: 'TRADING',
        filters: [
          { filterType: 'PRICE_FILTER', tickSize: '0.01' },
          { filterType: 'LOT_SIZE', minQty: '0.0001', maxQty: '100', stepSize: '0.0001' },
        ],
      }],
    })
    expect(instruments[0]).toMatchObject({
      symbol: 'BTC/USDT',
      providerSymbol: 'BTCUSDT',
      priceIncrement: 0.01,
      quantityMin: 0.0001,
      quantityStep: 0.0001,
      tradable: true,
    })
  })
})