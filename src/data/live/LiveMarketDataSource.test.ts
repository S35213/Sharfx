import { describe, expect, it } from 'vitest'
import { LiveMarketDataSource, type LiveMarketTransport } from './LiveMarketDataSource'

const candle = (time: number, open: number, high: number, low: number, close: number) => ({ time, open, high, low, close })

const transport = (candles = [candle(1, 1, 2, 0.5, 1.5), candle(2, 1.5, 2.5, 1, 2)]): LiveMarketTransport => ({
  getWatchlist: async () => [{ symbol: 'EUR/USD', price: 2, change: 0, changePercent: 0, status: 'open' }],
  getCandles: async () => candles,
  getAccountData: async () => ({ balance: 1000, equity: 1000, usedMargin: 0, freeMargin: 1000, floatingPL: 0, currency: 'USD' }),
  getSymbolSpec: async () => ({ symbol: 'EUR/USD', baseCurrency: 'EUR', quoteCurrency: 'USD', pipSize: 0.0001, contractSize: 100000, minLotSize: 0.01, maxLotSize: 100, lotStep: 0.01, pricePrecision: 5 }),
  getMarketAnalysis: async () => ({ bias: 'Neutral', structure: { type: 'Mixed', status: 'Developing' }, liquidity: { previousHigh: null, previousLow: null, equalHighs: false, equalLows: false, zones: [] }, supportResistance: { nearestSupport: null, nearestResistance: null } }),
  getAIAnalysis: async () => ({ marketBias: 'Neutral', structure: 'Mixed', liquidity: 'None', potentialSetup: 'None', invalidation: 'None', target: 'None', riskReward: 'N/A', confidence: 0, timestamp: '2026-01-01T00:00:00Z' }),
  getOpenPositions: async () => [],
  getPendingOrders: async () => [],
  getTradeHistory: async () => [],
})

describe('LiveMarketDataSource', () => {
  it('delegates valid provider data', async () => {
    const source = new LiveMarketDataSource(transport())
    await expect(source.getCandles('EUR/USD', 'M5')).resolves.toHaveLength(2)
    await expect(source.getWatchlist()).resolves.toHaveLength(1)
  })

  it('rejects malformed OHLC data', async () => {
    const source = new LiveMarketDataSource(transport([candle(1, 1, 0.5, 0.8, 0.9)]))
    await expect(source.getCandles('EUR/USD', 'M5')).rejects.toThrow('malformed OHLC')
  })

  it('rejects non-chronological candles', async () => {
    const source = new LiveMarketDataSource(transport([candle(2, 1, 2, 0.5, 1.5), candle(1, 1.5, 2.5, 1, 2)]))
    await expect(source.getCandles('EUR/USD', 'M5')).rejects.toThrow('chronological')
  })

  it('rejects an invalid candle limit', async () => {
    const source = new LiveMarketDataSource(transport())
    await expect(source.getCandles('EUR/USD', 'M5', 1)).rejects.toThrow('at least 2')
  })

  it('blocks stale candles when freshness enforcement is enabled', async () => {
    const source = new LiveMarketDataSource(transport([candle(100, 1, 2, 0.5, 1.5), candle(200, 1.5, 2.5, 1, 2)]), {
      enforceFreshness: true,
      nowSeconds: () => 1200,
      staleAfterIntervals: 3,
    })
    await expect(source.getCandles('EUR/USD', 'M5')).rejects.toThrow('stale')
  })

  it('blocks timestamps that are materially ahead of the local clock', async () => {
    const source = new LiveMarketDataSource(transport([candle(900, 1, 2, 0.5, 1.5), candle(1000, 1.5, 2.5, 1, 2)]), {
      enforceFreshness: true,
      nowSeconds: () => 100,
    })
    await expect(source.getCandles('EUR/USD', 'M5')).rejects.toThrow('invalid')
  })
})
