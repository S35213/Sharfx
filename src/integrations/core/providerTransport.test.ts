import { describe, expect, it } from 'vitest'
import { createRestProviderAdapter, createWebSocketProviderAdapter } from './providerTransport'
import type { ProviderDescriptor } from './types'

const descriptor: ProviderDescriptor = {
  id: 'test',
  name: 'Test',
  kind: 'broker',
  status: 'available',
  executionMode: 'simulated',
  authMethods: ['custom'],
  description: '',
  capabilities: {
    accountRead: false, marketData: true, historicalCandles: false, realtimeMarketData: true, realtimeAccountData: false,
    positionsRead: false, ordersRead: false, orderPlacement: false, orderCancellation: false, orderModification: false,
    orderLookupByClientOrderId: false, positionClose: false, multipleAccounts: false, demoAccounts: true, symbolMetadata: false,
    funding: { deposit: 'unsupported', withdrawal: 'unsupported' },
  },
}

describe('provider transport factories', () => {
  it('creates a normalized REST adapter without binding the core to a vendor SDK', () => {
    const adapter = createRestProviderAdapter(descriptor, {})
    expect(adapter.descriptor.id).toBe('test')
  })

  it('creates a normalized WebSocket adapter with explicit cleanup ownership', async () => {
    const adapter = createWebSocketProviderAdapter(descriptor, async (symbols, onEvent) => { void symbols; void onEvent; return { streamId: 's1', close: async () => undefined } })
    const stream = await adapter.subscribe?.({ providerId: 'test', connectionId: 'c1', environment: 'demo', connectedAt: new Date().toISOString() }, undefined, ['EUR/USD'], () => {})
    expect(stream?.streamId).toBe('s1')
    await stream?.close()
  })
})