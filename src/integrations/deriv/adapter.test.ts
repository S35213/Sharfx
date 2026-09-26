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

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

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

describe('Deriv provider funding and readiness capabilities', () => {
  it('exposes official cashier redirect instructions', async () => {
    const deposit = await DERIV_PROVIDER_ADAPTER.getDepositInstructions!(connection, 'demo-123')
    const withdrawal = await DERIV_PROVIDER_ADAPTER.getWithdrawalInstructions!(connection, 'demo-123')

    expect(deposit).toMatchObject({
      mode: 'redirect',
      providerUrl: 'https://app.deriv.com/cashier/deposit',
    })
    expect(withdrawal).toMatchObject({
      mode: 'redirect',
      providerUrl: 'https://app.deriv.com/cashier/withdraw',
    })
  })

  it('supports W1 historical candles without opening a real network connection', async () => {
    class FakeWebSocket {
      static readonly OPEN = 1
      readyState = FakeWebSocket.OPEN
      onopen: (() => void) | null = null
      onmessage: ((event: MessageEvent) => void) | null = null
      onerror: (() => void) | null = null
      onclose: (() => void) | null = null

      constructor(_url: string) {
        queueMicrotask(() => this.onopen?.())
      }

      send(raw: string): void {
        const request = JSON.parse(raw) as { req_id?: number; msg_type?: string }
        if (request.req_id !== 1) return
        queueMicrotask(() => this.onmessage?.({
          data: JSON.stringify({
            msg_type: 'candles',
            candles: [{
              epoch: 1700000000,
              open: 1.08,
              high: 1.09,
              low: 1.07,
              close: 1.085,
            }],
          }),
        } as MessageEvent))
      }

      close(): void {
        this.readyState = 3
        this.onclose?.()
      }
    }

    vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket)

    const candles = await DERIV_PROVIDER_ADAPTER.getHistoricalCandles!(connection, 'demo-123', 'EURUSD', 'W1', 10)

    expect(candles).toHaveLength(1)
    expect(candles[0]).toMatchObject({
      symbol: 'EURUSD',
      timeframe: 'W1',
      open: 1.08,
      high: 1.09,
      low: 1.07,
      close: 1.085,
    })
  })
})
