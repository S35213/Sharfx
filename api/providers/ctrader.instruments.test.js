import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiRequestGuard: vi.fn(),
  getShafxUser: vi.fn(),
  getProviderAccount: vi.fn(),
  loadCtraderConnection: vi.fn(),
  getCtraderSymbols: vi.fn(),
  resolveCtraderSymbol: vi.fn(),
  normalizeCtraderInstrument: vi.fn(),
}))

vi.mock('../../server/authSecurity.js', () => ({
  apiRequestGuard: mocks.apiRequestGuard,
}))

vi.mock('../../server/ctrader.js', () => ({
  buildCtraderAuthUrl: vi.fn(),
  buildCtraderPositionPnlMap: vi.fn(),
  cTraderConfigured: vi.fn(),
  exchangeCtraderCode: vi.fn(),
  getCtraderAssets: vi.fn(),
  getCtraderMargin: vi.fn(),
  getCtraderDealHistory: vi.fn(),
  getCtraderQuote: vi.fn(),
  getCtraderTrendbars: vi.fn(),
  getCtraderSymbols: mocks.getCtraderSymbols,
  getCtraderSymbol: vi.fn(),
  getCtraderTrader: vi.fn(),
  loadCtraderConnection: mocks.loadCtraderConnection,
  normalizeCtraderInstrument: mocks.normalizeCtraderInstrument,
  normalizeCtraderOrder: vi.fn(),
  normalizeCtraderPosition: vi.fn(),
  placeCtraderOrder: vi.fn(),
  amendCtraderPosition: vi.fn(),
  closeCtraderPosition: vi.fn(),
  reconcileCtrader: vi.fn(),
  syncCtraderAccountsForConnection: vi.fn(),
  ctraderLotsToProtocolVolume: vi.fn(),
  ctraderRelativeDistanceUnits: vi.fn(),
  resolveCtraderSymbol: mocks.resolveCtraderSymbol,
}))

vi.mock('../../server/providerConnections.js', () => ({
  createProviderConnection: vi.fn(),
  createProviderSecret: vi.fn(),
  getProviderAccount: mocks.getProviderAccount,
  getShafxUser: mocks.getShafxUser,
  recordProviderAudit: vi.fn(),
  upsertProviderAccount: vi.fn(),
}))

import handler from './ctrader.js'

describe('cTrader instrument metadata route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.apiRequestGuard.mockResolvedValue({ allowed: true })
    mocks.getShafxUser.mockResolvedValue({ id: 'user-1' })
    mocks.getProviderAccount.mockResolvedValue({ environment: 'demo' })
    mocks.loadCtraderConnection.mockResolvedValue({
      environment: 'demo',
      tokens: { accessToken: 'demo-access-token' },
    })
    mocks.resolveCtraderSymbol.mockResolvedValue({
      symbolId: 17,
      name: 'EURUSD',
      lotSize: 100000,
      minVolume: 1000,
      maxVolume: 5000000,
      stepVolume: 1000,
      digits: 5,
      pipPosition: 4,
      tradingMode: 0,
    })
    mocks.normalizeCtraderInstrument.mockReturnValue({
      symbol: 'EURUSD',
      providerSymbol: '17',
      contractSize: 1000,
      pipSize: 0.0001,
      quantityMin: 0.01,
      quantityMax: 50,
      quantityStep: 0.01,
      priceIncrement: 0.00001,
      tradable: true,
    })
  })

  it('uses the same requested-symbol resolver as candles and returns its instrument rules', async () => {
    const res = {
      statusCode: 0,
      body: null,
      status(code) {
        this.statusCode = code
        return this
      },
      json(body) {
        this.body = body
        return this
      },
    }

    await handler({
      method: 'POST',
      url: '/api/providers/ctrader',
      headers: {},
      body: {
        connectionId: 'connection-demo',
        accountId: '123456',
        action: 'instruments',
        symbol: 'EUR/USD',
      },
    }, res)

    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({
      ok: true,
      instruments: [{ symbol: 'EURUSD', providerSymbol: '17', tradable: true }],
    })
    expect(mocks.resolveCtraderSymbol).toHaveBeenCalledWith({
      environment: 'demo',
      accountId: '123456',
      accessToken: 'demo-access-token',
      symbol: 'EUR/USD',
    })
    // The requested instrument must not be discarded by a separate lightweight-catalog filter.
    expect(mocks.getCtraderSymbols).not.toHaveBeenCalled()
  })
})
