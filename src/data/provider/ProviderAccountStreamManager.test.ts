import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProviderAdapter, ProviderAccountSnapshot, ProviderConnection } from '../../integrations/core/types'
import { providerRegistry } from '../../integrations/core/providerRegistry'
import { ProviderAccountStreamManager, providerAccountStreamKey } from './ProviderAccountStreamManager'

const descriptor = {
  id: 'test-concurrency-provider',
  name: 'Concurrency Test Provider',
  kind: 'broker' as const,
  status: 'available' as const,
  executionMode: 'external' as const,
  authMethods: ['custom' as const],
  description: 'test',
  capabilities: {
    accountRead: true,
    marketData: false,
    historicalCandles: false,
    realtimeMarketData: false,
    realtimeAccountData: true,
    positionsRead: false,
    ordersRead: false,
    orderPlacement: false,
    orderCancellation: false,
    orderModification: false,
    orderLookupByClientOrderId: false,
    positionClose: false,
    multipleAccounts: true,
    demoAccounts: true,
    symbolMetadata: false,
    funding: { deposit: 'unsupported' as const, withdrawal: 'unsupported' as const },
  },
}

const handles = new Map<string, { close: ReturnType<typeof vi.fn> }>()

const adapter: ProviderAdapter = {
  descriptor,
  getAccounts: async () => [],
  getQuote: async () => ({ symbol: 'EUR/USD', bid: 1, ask: 1.1, timestamp: new Date().toISOString() }),
  subscribeAccount: async (connection: ProviderConnection, accountId, onEvent) => {
    const handle = { close: vi.fn(async () => undefined) }
    const key = connection.connectionId + ':' + accountId
    handles.set(key, handle)
    const snapshot: ProviderAccountSnapshot = {
      accountId: accountId || 'all',
      accountLabel: accountId || 'all',
      environment: connection.environment,
      currency: 'USD',
      balance: accountId === 'acct-a' ? 100 : 200,
    }
    onEvent({ type: 'account', account: snapshot })
    return {
      streamId: key,
      close: handle.close,
    }
  },
}

describe('ProviderAccountStreamManager', () => {
  afterEach(async () => {
    await new ProviderAccountStreamManager().stopAll()
  })

  it('builds collision-safe identity keys', () => {
    expect(providerAccountStreamKey({ providerId: 'deriv', connectionId: 'c1', accountId: 'a', accountType: 'demo' }))
      .not.toBe(providerAccountStreamKey({ providerId: 'deriv', connectionId: 'c2', accountId: 'a', accountType: 'demo' }))
  })

  it('keeps two provider accounts alive independently', async () => {
    if (!providerRegistry.has(descriptor.id)) providerRegistry.register(adapter)
    const manager = new ProviderAccountStreamManager()
    const first = { providerId: descriptor.id, connectionId: 'connection-a', accountId: 'acct-a', accountType: 'demo' as const }
    const second = { providerId: descriptor.id, connectionId: 'connection-b', accountId: 'acct-b', accountType: 'demo' as const }

    const firstKey = await manager.start(first)
    const secondKey = await manager.start(second)

    expect(firstKey).not.toBe(secondKey)
    expect(manager.list()).toHaveLength(2)
    expect(manager.get(firstKey)?.snapshot?.balance).toBe(100)
    expect(manager.get(secondKey)?.snapshot?.balance).toBe(200)

    await manager.stop(firstKey)
    expect(handles.get('connection-a:acct-a')?.close).toHaveBeenCalledTimes(1)
    expect(manager.get(firstKey)).toBeUndefined()
    expect(manager.get(secondKey)?.status).toBe('connected')
    expect(handles.get('connection-b:acct-b')?.close).not.toHaveBeenCalled()

    await manager.stopAll()
    expect(handles.get('connection-b:acct-b')?.close).toHaveBeenCalledTimes(1)
  })

  it('replaces only the same identity and preserves sibling streams', async () => {
    if (!providerRegistry.has(descriptor.id)) providerRegistry.register(adapter)
    const manager = new ProviderAccountStreamManager()
    const first = { providerId: descriptor.id, connectionId: 'connection-a', accountId: 'acct-a', accountType: 'demo' as const }
    const sibling = { providerId: descriptor.id, connectionId: 'connection-b', accountId: 'acct-b', accountType: 'demo' as const }

    await manager.start(first)
    const firstHandle = handles.get('connection-a:acct-a')?.close
    await manager.start(sibling)
    await manager.start(first)

    expect(firstHandle).toBeDefined()
    expect(firstHandle).toHaveBeenCalledTimes(1)
    expect(manager.list()).toHaveLength(2)
    expect(manager.get(firstKey)?.snapshot?.accountId).toBe('acct-a')
    expect(manager.get(providerAccountStreamKey(sibling))?.snapshot?.accountId).toBe('acct-b')

    await manager.stopAll()
  })
})
