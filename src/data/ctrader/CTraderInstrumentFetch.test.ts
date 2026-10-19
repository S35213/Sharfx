import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchCTraderInstrument, type CTraderLiveInstrument } from './CTraderLiveQuote'

const brokerInstrument: CTraderLiveInstrument = {
  symbol: 'EURUSD',
  providerSymbol: '1',
  contractSize: 100_000,
  pipSize: 0.0001,
  quantityMin: 0.01,
  quantityMax: 100,
  quantityStep: 0.01,
  priceIncrement: 0.00001,
  tradable: true,
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const stubJsonResponse = (payload: unknown, ok = true): ReturnType<typeof vi.fn> => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    json: async () => payload,
  } as Response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('fetchCTraderInstrument', () => {
  it('requests the selected broker instrument without needing a live quote', async () => {
    const fetchMock = stubJsonResponse({ ok: true, instruments: [brokerInstrument] })
    const result = await fetchCTraderInstrument({
      connectionId: 'connection-demo',
      accountId: 'account-demo',
      environment: 'demo',
      symbol: 'EUR/USD',
    })

    expect(result).toEqual(brokerInstrument)
    expect(fetchMock).toHaveBeenCalledWith('/api/providers/ctrader', expect.objectContaining({
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      body: JSON.stringify({
        providerId: 'ctrader',
        connectionId: 'connection-demo',
        accountId: 'account-demo',
        environment: 'demo',
        action: 'instruments',
        symbol: 'EUR/USD',
      }),
    }))
  })

  it('rejects a mismatched broker instrument instead of guessing metadata', async () => {
    stubJsonResponse({ ok: true, instruments: [{ ...brokerInstrument, symbol: 'GBPUSD' }] })
    await expect(fetchCTraderInstrument({
      connectionId: 'connection-demo',
      accountId: 'account-demo',
      environment: 'demo',
      symbol: 'EUR/USD',
    })).rejects.toThrow('no matching instrument specification')
  })

  it('surfaces provider errors and malformed instrument responses', async () => {
    stubJsonResponse({ ok: false, error: 'cTrader account is unavailable' }, false)
    await expect(fetchCTraderInstrument({
      connectionId: 'connection-demo',
      accountId: 'account-demo',
      environment: 'demo',
      symbol: 'EUR/USD',
    })).rejects.toThrow('cTrader account is unavailable')

    stubJsonResponse({ ok: true, instruments: null })
    await expect(fetchCTraderInstrument({
      connectionId: 'connection-demo',
      accountId: 'account-demo',
      environment: 'demo',
      symbol: 'EUR/USD',
    })).rejects.toThrow('instrument specification request failed')
  })
})
