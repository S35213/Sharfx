import { describe, expect, it } from 'vitest'
import { ProviderAccountCache } from './ProviderAccountCache'

describe('ProviderAccountCache', () => {
  it('keeps account, positions and orders isolated by identity key', () => {
    const cache = new ProviderAccountCache()
    cache.setAccount('provider-a:connection-a:account-a', { accountId: 'account-a', environment: 'demo', currency: 'USD', balance: 100 })
    cache.setPositions('provider-a:connection-a:account-a', [{ id: 'p1', symbol: 'EUR/USD', side: 'BUY', quantity: 1, entryPrice: 1 }])
    cache.setOrders('provider-a:connection-a:account-a', [{ providerOrderId: 'o1', status: 'pending' }])

    cache.setAccount('provider-a:connection-b:account-b', { accountId: 'account-b', environment: 'demo', currency: 'USD', balance: 200 })

    expect(cache.get('provider-a:connection-a:account-a')?.account?.balance).toBe(100)
    expect(cache.get('provider-a:connection-a:account-a')?.positions).toHaveLength(1)
    expect(cache.get('provider-a:connection-a:account-a')?.orders).toHaveLength(1)
    expect(cache.get('provider-a:connection-b:account-b')?.account?.balance).toBe(200)
    expect(cache.get('provider-a:connection-b:account-b')?.positions).toHaveLength(0)
  })
})
