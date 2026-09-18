import { afterEach, describe, expect, it, vi } from 'vitest'
import { OANDA_PROVIDER_ADAPTER } from './adapter'
import { OANDA_PROVIDER_DESCRIPTOR } from './descriptor'

const connection = { providerId: 'oanda', connectionId: 'connection-oanda-1', accountId: '101-001-1234567-001', environment: 'demo' as const, state: 'connected' as const, connectedAt: '2026-09-18T09:00:00.000Z' }
afterEach(() => vi.restoreAllMocks())

describe('OANDA provider adapter', () => {
  it('advertises implemented read, market-data, and demo execution capabilities', () => {
    expect(OANDA_PROVIDER_DESCRIPTOR.status).toBe('available')
    expect(OANDA_PROVIDER_DESCRIPTOR.capabilities.accountRead).toBe(true)
    expect(OANDA_PROVIDER_DESCRIPTOR.capabilities.positionsRead).toBe(true)
    expect(OANDA_PROVIDER_DESCRIPTOR.capabilities.ordersRead).toBe(true)
    expect(OANDA_PROVIDER_DESCRIPTOR.capabilities.orderPlacement).toBe(true)
    expect(OANDA_PROVIDER_DESCRIPTOR.capabilities.orderCancellation).toBe(true)
    expect(OANDA_PROVIDER_DESCRIPTOR.capabilities.orderLookupByClientOrderId).toBe(true)
    expect(OANDA_PROVIDER_DESCRIPTOR.capabilities.positionClose).toBe(true)
    expect(typeof OANDA_PROVIDER_ADAPTER.subscribe).toBe('function')
    expect(typeof OANDA_PROVIDER_ADAPTER.subscribeAccount).toBe('function')
  })
  it('places a normalized demo market order through the server boundary', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, order: {
      providerOrderId: '9001', status: 'filled', symbol: 'EUR/USD', side: 'BUY', quantity: 1000, timestamp: '2026-09-18T09:01:00.000Z'
    } }), { status: 200, headers: { 'content-type': 'application/json' } })))
    const result = await OANDA_PROVIDER_ADAPTER.placeOrder!(connection, connection.accountId!, { symbol: 'EUR/USD', side: 'BUY', quantity: 1000, quantityUnit: 'units', type: 'MARKET' })
    expect(result).toMatchObject({ providerOrderId: '9001', status: 'filled', symbol: 'EUR/USD', quantity: 1000 })
    expect(String((fetch as ReturnType<typeof vi.fn>).mock.calls[0][0])).toContain('action=placeOrder')
  })

  it('normalizes accounts through the server boundary', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, accounts: [{ accountId: '101-001', accountLabel: 'Practice • 101-001', environment: 'demo', currency: 'USD', balance: 1000, equity: 1001 }] }), { status: 200, headers: { 'content-type': 'application/json' } })))
    const accounts = await OANDA_PROVIDER_ADAPTER.getAccounts!(connection)
    expect(accounts).toHaveLength(1)
    expect(accounts[0]).toMatchObject({ accountId: '101-001', currency: 'USD', balance: 1000, environment: 'demo' })
  })
  it('normalizes quotes through the server boundary', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, quote: { symbol: 'EUR/USD', bid: 1.1, ask: 1.1002, last: 1.1001, timestamp: '2026-09-18T09:00:00.000Z' } }), { status: 200, headers: { 'content-type': 'application/json' } })))
    const quote = await OANDA_PROVIDER_ADAPTER.getQuote!(connection, connection.accountId, 'EUR/USD')
    expect(quote.bid).toBe(1.1); expect(quote.ask).toBe(1.1002); expect(quote.last).toBe(1.1001)
  })
})
