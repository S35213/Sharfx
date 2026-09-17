import { afterEach, describe, expect, it, vi } from 'vitest'
import { DERIV_PROVIDER_ADAPTER } from './adapter'
import type { ProviderConnection } from '../core/types'

const connection: ProviderConnection = {
  providerId: 'deriv',
  connectionId: 'test-deriv',
  environment: 'demo',
  connectedAt: new Date().toISOString(),
  state: 'connected',
}

afterEach(() => vi.restoreAllMocks())

describe('Deriv provider adapter account discovery', () => {
  it('normalizes the authenticated accounts response without exposing provider-specific fields', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      connected: true,
      data: [
        { account_id: 'demo-123', balance: 1000, currency: 'USD', account_type: 'demo', group: 'demo', status: 'active', secret: 'never-surface' },
        { account_id: 'real-456', balance: 250, currency: 'USD', account_type: 'real', group: 'real', status: 'active' },
        { account_id: 'bad-row', balance: 'not-a-number', currency: 'USD', account_type: 'demo' },
      ],
    }), { status: 200, headers: { 'content-type': 'application/json' } })))

    const accounts = await DERIV_PROVIDER_ADAPTER.getAccounts!(connection)

    expect(accounts).toHaveLength(2)
    expect(accounts[0]).toMatchObject({
      accountId: 'demo-123',
      environment: 'demo',
      currency: 'USD',
      balance: 1000,
    })
    expect(accounts[1]).toMatchObject({
      accountId: 'real-456',
      environment: 'live',
      currency: 'USD',
      balance: 250,
    })
    expect(accounts[0]).not.toHaveProperty('secret')
  })

  it('fails closed when the account endpoint rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'session expired' }), { status: 401 })))

    await expect(DERIV_PROVIDER_ADAPTER.getAccounts!(connection)).rejects.toThrow('session expired')
  })
})
