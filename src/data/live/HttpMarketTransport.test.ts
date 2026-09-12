import { describe, expect, it, vi } from 'vitest'
import { HttpMarketTransport } from './HttpMarketTransport'

describe('HttpMarketTransport', () => {
  it('builds encoded candle requests and returns JSON', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => [{ time: 1 }] })
    const transport = new HttpMarketTransport({ baseUrl: 'https://example.test/api/', fetchImpl })
    const result = await transport.getCandles('EUR/USD', 'M5', 100)
    expect(result).toEqual([{ time: 1 }])
    expect(fetchImpl).toHaveBeenCalledWith('https://example.test/api/candles?symbol=EUR%2FUSD&timeframe=M5&limit=100', expect.objectContaining({ headers: { Accept: 'application/json' } }))
  })

  it('rejects failed API responses', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 503 })
    const transport = new HttpMarketTransport({ baseUrl: 'https://example.test', fetchImpl })
    await expect(transport.getWatchlist()).rejects.toThrow('Market API request failed (503).')
  })

  it('rejects an invalid base URL', () => {
    expect(() => new HttpMarketTransport({ baseUrl: 'javascript:alert(1)' })).toThrow('Market API base URL must use HTTP or HTTPS.')
  })
})
