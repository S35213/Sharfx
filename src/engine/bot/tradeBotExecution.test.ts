import { describe, expect, it, vi } from 'vitest'
import type { SymbolSpec } from '../../types'
import type { SetupCandidate } from '../setup/types'
import type { CTraderApiPost } from './tradeBotExecution'
import { calculateMarginConstrainedLots, executeTradeBotDemoOrder } from './tradeBotExecution'

const NOW = Date.now()
const source = {
  providerId: 'ctrader',
  connectionId: 'connection-demo',
  accountId: 'account-demo',
  environment: 'demo' as const,
}
const symbolSpec: SymbolSpec = {
  symbol: 'EUR/USD',
  baseCurrency: 'EUR',
  quoteCurrency: 'USD',
  contractSize: 100_000,
  pipSize: 0.0001,
  minLotSize: 0.01,
  maxLotSize: 20,
  lotStep: 0.01,
  pricePrecision: 5,
}
const setup: SetupCandidate = {
  direction: 'BUY',
  status: 'candidate',
  quality: 'strong',
  entryPrice: 1.1,
  stopLoss: 1.099,
  takeProfit: 1.102,
  riskRewardRatio: 2,
  riskDistance: 0.001,
  rewardDistance: 0.002,
  confidence: 90,
  rationale: ['test setup'],
  invalidation: 'invalid below stop',
  liquidityTarget: null,
}
const validQuote = {
  ok: true,
  quote: { symbol: 'EUR/USD', bid: 1.1, ask: 1.1001, last: 1.1001, timestamp: new Date(NOW).toISOString() },
  instrument: {
    symbol: 'EUR/USD',
    providerSymbol: '1',
    contractSize: 100_000,
    pipSize: 0.0001,
    quantityMin: 0.01,
    quantityMax: 20,
    quantityStep: 0.01,
    priceIncrement: 0.00001,
    tradable: true,
    metadata: { digits: '5', distanceSetIn: '1', slDistance: '0', tpDistance: '0' },
  },
}
const filledOrder = {
  ok: true,
  order: {
    status: 'filled',
    positionId: 'position-1',
    providerOrderId: 'order-1',
    executionPrice: 1.1001,
    protectionApplied: true,
    raw: { position: { positionId: 'position-1', price: 1.1001, stopLoss: 1.0991, takeProfit: 1.1021 } },
  },
}
const validAccount = {
  ok: true,
  account: { balance: 10_000, freeMargin: 5_000, currency: 'USD' },
  positions: [],
  orders: [],
}
const input = () => ({
  source,
  symbol: 'EUR/USD',
  timeframe: 'M5' as const,
  signalCandleTime: 1_797_000_000,
  setup,
  accountBalance: 10_000,
  accountFreeMargin: 5_000,
  accountCurrency: 'USD',
  symbolSpec,
  nowMs: NOW,
})

const createPost = (overrides: Partial<Record<string, unknown>> = {}): CTraderApiPost => vi.fn(async (body) => {
  const action = String(body.action)
  if (action === 'quote') return (overrides.quote ?? validQuote) as Record<string, unknown>
  if (action === 'account') return (overrides.account ?? validAccount) as Record<string, unknown>
  if (action === 'margin') return (overrides.margin ?? { ok: true, margin: { buyMargin: 100, sellMargin: 100 } }) as Record<string, unknown>
  if (action === 'placeOrder') return (overrides.placeOrder ?? filledOrder) as Record<string, unknown>
  throw new Error('Unexpected action: ' + action)
})

describe('Trade Bot balance-aware lot sizing', () => {
  it('reduces volume to a valid lot step and reserves 10% of free margin', () => {
    expect(calculateMarginConstrainedLots({
      requestedLots: 0.05,
      availableFreeMargin: 50,
      marginRequired: 100,
      minimumLots: 0.01,
      maximumLots: 20,
      lotStep: 0.01,
    })).toBe(0.02)
  })

  it('returns zero when the account cannot support its minimum lot', () => {
    expect(calculateMarginConstrainedLots({
      requestedLots: 0.05,
      availableFreeMargin: 1,
      marginRequired: 100,
      minimumLots: 0.01,
      maximumLots: 20,
      lotStep: 0.01,
    })).toBe(0)
  })

  it('never rounds a margin-limited lot above the requested size', () => {
    expect(calculateMarginConstrainedLots({
      requestedLots: 0.057,
      availableFreeMargin: 1000,
      marginRequired: 100,
      minimumLots: 0.01,
      maximumLots: 20,
      lotStep: 0.01,
    })).toBe(0.05)
  })
})

describe('Trade Bot cTrader demo execution', () => {
  it('places one risk-sized demo market order only after quote, exposure and margin checks', async () => {
    const post = createPost()
    const result = await executeTradeBotDemoOrder({ ...input(), post })

    expect(result.trade.status).toBe('open')
    expect(result.trade.providerId).toBe('ctrader')
    expect(result.trade.brokerProtectionConfirmed).toBe(true)
    expect(result.trade.lotSize).toBeGreaterThan(0)
    expect(result.trade.riskAmount).toBeLessThanOrEqual(10.01)
    expect(result.riskPlan.riskRewardRatio).toBeGreaterThanOrEqual(1.5)
    expect(result.marginRequired).toBe(100)
    const actions = vi.mocked(post).mock.calls.map(([body]) => body.action)
    expect(actions).toEqual(['quote', 'account', 'margin', 'placeOrder'])
    const calls = vi.mocked(post).mock.calls
    const placed = calls[calls.length - 1]?.[0]
    expect(placed?.environment).toBe('demo')
    expect(placed?.order).toMatchObject({
      symbol: 'EUR/USD',
      side: 'BUY',
      type: 'MARKET',
      quantityUnit: 'lots',
      stopLoss: expect.any(Number),
      takeProfit: expect.any(Number),
    })
  })

  it('refuses live accounts before making any API request', async () => {
    const post = createPost()
    await expect(executeTradeBotDemoOrder({
      ...input(),
      source: { ...source, environment: 'live' },
      post,
    })).rejects.toThrow(/practice account.*Live accounts are blocked/i)
    expect(post).not.toHaveBeenCalled()
  })

  it('does not stack another position on the same symbol', async () => {
    const post = createPost({ account: { ...validAccount, positions: [{ symbol: 'EURUSD', metadata: {} }] } })
    await expect(executeTradeBotDemoOrder({ ...input(), post })).rejects.toThrow(/open cTrader position already exists/i)
    expect(vi.mocked(post).mock.calls.map(([body]) => body.action)).toEqual(['quote', 'account'])
  })

  it('blocks a stale quote and sends no order', async () => {
    const staleQuote = {
      ...validQuote,
      quote: { ...validQuote.quote, timestamp: new Date(NOW - 30_000).toISOString() },
    }
    const post = createPost({ quote: staleQuote })
    await expect(executeTradeBotDemoOrder({ ...input(), post })).rejects.toThrow(/missing, stale or mismatched/i)
    expect(vi.mocked(post).mock.calls.map(([body]) => body.action)).toEqual(['quote'])
  })

  it('blocks orders that would exceed the allowed cash-risk ceiling', async () => {
    const wideSetup = { ...setup, stopLoss: 1.08, takeProfit: 1.1401 }
    const post = createPost()
    await expect(executeTradeBotDemoOrder({ ...input(), setup: wideSetup, post })).rejects.toThrow(/exceed the risk ceiling/i)
    expect(vi.mocked(post).mock.calls.map(([body]) => body.action)).toEqual(['quote', 'account'])
  })

  it('refuses to place an order when the broker margin remains unaffordable after resizing', async () => {
    const post = createPost({ margin: { ok: true, margin: { buyMargin: 10_000, sellMargin: 10_000 } } })
    await expect(executeTradeBotDemoOrder({ ...input(), post })).rejects.toThrow(/cannot safely support even the broker minimum lot/i)
    expect(vi.mocked(post).mock.calls.map(([body]) => body.action)).toEqual(['quote', 'account', 'margin', 'margin', 'margin'])
  })
  it('automatically reduces risk-sized lots when current free margin is tighter', async () => {
    const post: CTraderApiPost = vi.fn(async (body) => {
      const action = String(body.action)
      if (action === 'quote') return validQuote
      if (action === 'account') {
        return { ok: true, account: { balance: 1_000, freeMargin: 50, currency: 'USD' }, positions: [], orders: [] }
      }
      if (action === 'margin') {
        const required = Number(body.lots) * 2_000
        return { ok: true, margin: { buyMargin: required, sellMargin: required } }
      }
      if (action === 'placeOrder') return filledOrder
      throw new Error('Unexpected action: ' + action)
    })

    const result = await executeTradeBotDemoOrder({ ...input(), post })
    const actions = vi.mocked(post).mock.calls.map(([body]) => body.action)
    expect(actions).toEqual(['quote', 'account', 'margin', 'margin', 'placeOrder'])
    expect(result.riskSizedLotSize).toBeCloseTo(0.05, 8)
    expect(result.lotSizeReducedForMargin).toBe(true)
    expect(result.trade.lotSize).toBeCloseTo(0.02, 8)
    expect(result.marginRequired).toBeCloseTo(40, 8)
    expect(result.marginRequired).toBeLessThanOrEqual(50 * 0.9)
    expect(result.trade.riskAmount).toBeCloseTo(2, 8)
    const calls = vi.mocked(post).mock.calls
    expect(calls[calls.length - 1]?.[0].order).toMatchObject({ quantity: 0.02, quantityUnit: 'lots' })
  })

  it('refuses the order when even the minimum lot exceeds the account margin reserve', async () => {
    const post: CTraderApiPost = vi.fn(async (body) => {
      const action = String(body.action)
      if (action === 'quote') return validQuote
      if (action === 'account') {
        return { ok: true, account: { balance: 1_000, freeMargin: 1, currency: 'USD' }, positions: [], orders: [] }
      }
      if (action === 'margin') {
        const required = Number(body.lots) * 2_000
        return { ok: true, margin: { buyMargin: required, sellMargin: required } }
      }
      if (action === 'placeOrder') return filledOrder
      throw new Error('Unexpected action: ' + action)
    })

    await expect(executeTradeBotDemoOrder({ ...input(), post })).rejects.toThrow(/cannot safely support even the broker minimum lot/i)
    expect(vi.mocked(post).mock.calls.map(([body]) => body.action)).toEqual(['quote', 'account', 'margin'])
  })

  it('uses the user-entered lot when the risk and broker rules allow it', async () => {
    const post = createPost()
    const result = await executeTradeBotDemoOrder({ ...input(), requestedLots: 0.03, post })

    expect(result.requestedLotSize).toBe(0.03)
    expect(result.trade.lotSize).toBe(0.03)
    expect(result.lotSizeReducedForRisk).toBe(false)
    expect(result.riskPlan.estimatedLossAtStop).toBeLessThanOrEqual(10.01)
    const calls = vi.mocked(post).mock.calls
    expect(calls[calls.length - 1]?.[0].order).toMatchObject({ quantity: 0.03, quantityUnit: 'lots' })
  })

  it('reduces an oversized requested lot to the balance-based stop-risk limit', async () => {
    const post = createPost()
    const result = await executeTradeBotDemoOrder({ ...input(), requestedLots: 0.5, post })

    expect(result.requestedLotSize).toBe(0.5)
    expect(result.lotSizeReducedForRisk).toBe(true)
    expect(result.riskSizedLotSize).toBeLessThan(0.5)
    expect(result.trade.lotSize).toBeLessThanOrEqual(result.riskSizedLotSize)
    expect(result.trade.riskAmount).toBeLessThanOrEqual(10.01)
    expect(result.lotAdjustmentReason).toContain('account stop-risk limit')
  })

  it('uses current broker balance and free margin instead of stale UI values', async () => {
    const post = createPost({
      account: { ok: true, account: { balance: 1_000, freeMargin: 5_000, currency: 'USD' }, positions: [], orders: [] },
    })
    const result = await executeTradeBotDemoOrder({
      ...input(),
      accountBalance: 100_000,
      accountFreeMargin: 1,
      post,
    })

    expect(result.trade.riskAmount).toBeLessThanOrEqual(5.01)
    expect(result.trade.lotSize).toBeCloseTo(0.05, 2)
  })

  it('does not submit an order if Stop is pressed while broker margin is loading', async () => {
    let active = true
    const post: CTraderApiPost = vi.fn(async (body) => {
      const action = String(body.action)
      if (action === 'quote') return validQuote
      if (action === 'account') return validAccount
      if (action === 'margin') {
        active = false
        return { ok: true, margin: { buyMargin: 100, sellMargin: 100 } }
      }
      if (action === 'placeOrder') return filledOrder
      throw new Error('Unexpected action: ' + action)
    })

    await expect(executeTradeBotDemoOrder({
      ...input(),
      post,
      shouldContinue: () => active,
    })).rejects.toThrow(/bot was stopped.*no order was sent/i)
    expect(vi.mocked(post).mock.calls.map(([body]) => body.action)).toEqual(['quote', 'account', 'margin'])
  })

})
