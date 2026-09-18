import { describe, expect, it } from 'vitest'
import { ProviderRateLimiter } from './providerRateLimiter'

describe('ProviderRateLimiter', () => {
  it('spaces requests for the same connection key', async () => {
    let now = 0
    const waits: number[] = []
    const limiter = new ProviderRateLimiter(
      { requestsPerSecond: 10 },
      () => now,
      async (ms) => { waits.push(ms); now += ms },
    )

    await limiter.acquire('oanda:connection-a')
    await limiter.acquire('oanda:connection-a')
    await limiter.acquire('oanda:connection-a')

    expect(waits).toEqual([100, 100])
  })

  it('keeps different connection keys independent', async () => {
    let now = 0
    const waits: number[] = []
    const limiter = new ProviderRateLimiter(
      { requestsPerSecond: 10 },
      () => now,
      async (ms) => { waits.push(ms); now += ms },
    )

    await Promise.all([
      limiter.acquire('oanda:connection-a'),
      limiter.acquire('oanda:connection-b'),
    ])

    expect(waits).toEqual([])
  })

  it('rejects invalid provider policies', () => {
    expect(() => new ProviderRateLimiter({ requestsPerSecond: 0 })).toThrow()
  })
})
