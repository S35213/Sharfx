import { describe, expect, it, vi } from 'vitest'
import type { LiveMarketTransport } from './LiveMarketDataSource'
import { LiveMarketPoller } from './LiveMarketPoller'

const transport = (delayMs = 0): LiveMarketTransport => ({
  getWatchlist: vi.fn(),
  getCandles: vi.fn(async () => {
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs))
    return [
      { time: 100, open: 1, high: 2, low: 0.5, close: 1.5 },
      { time: 200, open: 1.5, high: 2.5, low: 1, close: 2 },
    ]
  }),
  getAccountData: vi.fn(),
  getSymbolSpec: vi.fn(),
  getMarketAnalysis: vi.fn(),
  getAIAnalysis: vi.fn(),
  getOpenPositions: vi.fn(),
  getPendingOrders: vi.fn(),
  getTradeHistory: vi.fn(),
})

describe('LiveMarketPoller', () => {
  it('polls and reports health', async () => {
    const source = transport()
    const onUpdate = vi.fn()
    const poller = new LiveMarketPoller(source, { symbol: 'EUR/USD', timeframe: 'M5', nowSeconds: () => 230, onUpdate })
    await poller.poll()
    expect(source.getCandles).toHaveBeenCalledWith('EUR/USD', 'M5', 300)
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ health: expect.objectContaining({ status: 'FRESH' }) }))
  })

  it('does not overlap concurrent polls', async () => {
    const source = transport(25)
    const onUpdate = vi.fn()
    const poller = new LiveMarketPoller(source, { symbol: 'EUR/USD', timeframe: 'M5', nowSeconds: () => 230, onUpdate })
    const first = poller.poll()
    const second = poller.poll()
    await Promise.all([first, second])
    expect(source.getCandles).toHaveBeenCalledTimes(1)
  })

  it('reports provider failures without throwing from the polling loop', async () => {
    const source = transport()
    vi.mocked(source.getCandles).mockRejectedValueOnce(new Error('provider unavailable'))
    const onError = vi.fn()
    const poller = new LiveMarketPoller(source, { symbol: 'EUR/USD', timeframe: 'M5', onUpdate: vi.fn(), onError })
    await expect(poller.poll()).resolves.toBeUndefined()
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'provider unavailable' }))
  })

  it('validates polling configuration', () => {
    expect(() => new LiveMarketPoller(transport(), { symbol: ' ', timeframe: 'M5', onUpdate: vi.fn() })).toThrow('symbol is required')
    expect(() => new LiveMarketPoller(transport(), { symbol: 'EUR/USD', timeframe: 'M5', limit: 1, onUpdate: vi.fn() })).toThrow('limit must be at least 2')
    expect(() => new LiveMarketPoller(transport(), { symbol: 'EUR/USD', timeframe: 'M5', intervalMs: 0, onUpdate: vi.fn() })).toThrow('interval must be a positive integer')
  })
})
