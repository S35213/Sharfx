import { describe, expect, it, vi } from 'vitest'
import { HttpMarketTransport } from './HttpMarketTransport'

describe('HttpMarketTransport', () => {
  it('builds encoded candle requests and returns JSON', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => [{ time: 1 }] })
    const transport = new HttpMarketTransport({ baseUrl: 'https://example.test/api/', fetchImpl })
    const result = await transport.getCandles('EUR/USD', 'M5', 100)
    expect(result).toEqual([{ time: 1 }])
    expect(fetchImpl).toHaveBeenCalledWith('https://example.test/api/candles?symbol=EUR%2FUSD&timeframe=M5&limit=100', expect.objectContaining({ method: 'GET', headers: { Accept: 'application/json' }, signal: expect.any(AbortSignal) }))
  })

  it('retries transient 5xx API responses', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })
    const transport = new HttpMarketTransport({ baseUrl: 'https://example.test', fetchImpl, maxRetries: 2 })
    await expect(transport.getWatchlist()).resolves.toEqual({ ok: true })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('does not retry client errors', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 400 })
    const transport = new HttpMarketTransport({ baseUrl: 'https://example.test', fetchImpl, maxRetries: 2 })
    await expect(transport.getWatchlist()).rejects.toThrow('Market API request failed (400).')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('rejects an invalid base URL', () => {
    expect(() => new HttpMarketTransport({ baseUrl: 'javascript:alert(1)' })).toThrow('Market API base URL must use HTTP or HTTPS.')
  })

  it('rejects invalid transport settings', () => {
    expect(() => new HttpMarketTransport({ baseUrl: 'https://example.test', timeoutMs: 0 })).toThrow('Request timeout must be a positive integer.')
    expect(() => new HttpMarketTransport({ baseUrl: 'https://example.test', maxRetries: -1 })).toThrow('Maximum retries must be a non-negative integer.')
  })

  it('retries transient transport failures and succeeds without duplicating application work', async () => {
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(new Error('temporary network failure'))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })
    const transport = new HttpMarketTransport({ baseUrl: 'https://example.test', fetchImpl, maxRetries: 1 })
    await expect(transport.getAccountData()).resolves.toEqual({ ok: true })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})
