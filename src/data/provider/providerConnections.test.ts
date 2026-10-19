import { describe, expect, it } from 'vitest'
import { chooseDefaultProviderSelection, type ProviderConnectionRecord } from './providerConnections'

const connection = (accounts: ProviderConnectionRecord['accounts']): ProviderConnectionRecord => ({
  id: 'deriv-connection',
  providerId: 'deriv',
  label: 'Deriv test connection',
  environment: 'mixed',
  state: 'connected',
  authMethod: 'oauth2',
  expiresAt: null,
  lastSeenAt: null,
  metadata: {},
  createdAt: '2026-10-02T00:00:00.000Z',
  updatedAt: '2026-10-02T00:00:00.000Z',
  accounts,
})

describe('chooseDefaultProviderSelection', () => {
  it('prefers an active Deriv demo account over an active live account', () => {
    const selected = chooseDefaultProviderSelection([
      connection([
        {
          id: 'live-row',
          providerAccountId: 'live-account',
          label: 'Live USD',
          environment: 'live',
          currency: 'USD',
          balance: 100,
          equity: 100,
          usedMargin: 0,
          freeMargin: 100,
          floatingPL: 0,
          active: true,
          lastSyncedAt: null,
          metadata: {},
        },
        {
          id: 'demo-row',
          providerAccountId: 'demo-account',
          label: 'Demo USD',
          environment: 'demo',
          currency: 'USD',
          balance: 10000,
          equity: 10000,
          usedMargin: 0,
          freeMargin: 10000,
          floatingPL: 0,
          active: true,
          lastSyncedAt: null,
          metadata: {},
        },
      ]),
    ])

    expect(selected).toMatchObject({
      providerId: 'deriv',
      connectionId: 'deriv-connection',
      accountId: 'demo-account',
      environment: 'demo',
    })
  })
})
