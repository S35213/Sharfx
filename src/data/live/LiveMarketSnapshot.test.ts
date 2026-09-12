import { describe, expect, it, vi } from 'vitest'
import type { OHLCV } from '../../types'
import type { LiveMarketTransport } from './LiveMarketDataSource'
import { getLiveMarketSnapshot } from './LiveMarketSnapshot'

const candles: OHLCV[] = [
  { time: 100, open: 1.1, high: 1.2, low: 1, close: 1.15 },
  { time: 200, open: 1.15, high: 1.25, low: 1.1, close: 1.2 },
]

const transport: LiveMarketTransport = {
  getWatchlist: vi.fn(),
  getCandles: vi.fn(async () => candles),
  getAccountData: vi.fn(),
  getSymbolSpec: vi.fn(),
  getMarketAnalysis: vi.fn(),
  getAIAnalysis: vi.fn(),
  getOpenPositions: vi.fn(),
  getPendingOrders: vi.fn(),
  getTradeHistory: vi.fn(),
}

describe('getLiveMarketSnapshot', () => {
  it('returns candles and healthy status for fresh data', async () => {
    const result = await getLiveMarketSnapshot(transport, 'EURUSD', 'M1', 2, { nowSeconds: 230 })
    expect(result.candles).toEqual(candles)
    expect(result.health.status).toBe('FRESH')
    expect(transport.getCandles).toHaveBeenCalledWith('EURUSD', 'M1', 2)
  })

  it('reports stale data without silently treating it as fresh', async () => {
    const result = await getLiveMarketSnapshot(transport, 'EURUSD', 'M1', 2, { nowSeconds: 401, staleAfterIntervals: 3 })
    expect(result.health.status).toBe('STALE')
    expect(result.health.ageSeconds).toBe(201)
  })

  it('preserves invalid clock configuration from the health gate', async () => {
    const result = await getLiveMarketSnapshot(transport, 'EURUSD', 'M1', 2, { nowSeconds: Number.NaN })
    expect(result.health.status).toBe('INVALID')
  })
})
