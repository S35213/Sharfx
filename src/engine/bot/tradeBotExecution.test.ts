import { describe, expect, it, vi } from 'vitest'
import type { SymbolSpec } from '../../types'
import type { SetupCandidate } from '../setup/types'
import type { CTraderApiPost } from './tradeBotExecution'
import { executeTradeBotDemoOrder } from './tradeBotExecution'

const NOW = Date.parse('2026-10-16T19:30:00.000Z')
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
  if (action === 'reconcile') return (overrides.reconcile ?? { ok: true, positions: [], orders: [] }) as Record<string, unknown>
  if (action === 'margin') return (overrides.margin ?? { ok: true, margin: { buyMargin: 100, sellMargin: 100 } }) as Record<string, unknown>
  if (action === 'placeOrder') return (overrides.placeOrder ?? filledOrder) as Record<string, unknown>
  throw new Error('Unexpected action: ' + action)
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
    expect(actions).toEqual(['quote', 'reconcile', 'margin', 'placeOrder'])
    const placed = vi.mocked(post).mock.calls.at(-1)?.[0]
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
    const post = createPost({ reconcile: { ok: true, positions: [{ symbol: 'EURUSD', metadata: {} }] } })
    await expect(executeTradeBotDemoOrder({ ...input(), post })).rejects.toThrow(/open cTrader position already exists/i)
    expect(vi.mocked(post).mock.calls.map(([body]) => body.action)).toEqual(['quote', 'reconcile'])
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
    const wideSetup = { ...setup, stopLoss: 1.09, takeProfit: 1.1201 }
    const post = createPost()
    await expect(executeTradeBotDemoOrder({ ...input(), setup: wideSetup, post })).rejects.toThrow(/exceed the risk ceiling/i)
    expect(vi.mocked(post).mock.calls.map(([body]) => body.action)).toEqual(['quote', 'reconcile'])
  })

  it('blocks orders when the broker margin exceeds free margin', async () => {
    const post = createPost({ margin: { ok: true, margin: { buyMargin: 10_000, sellMargin: 10_000 } } })
    await expect(executeTradeBotDemoOrder({ ...input(), post })).rejects.toThrow(/exceeds current free margin/i)
    expect(vi.mocked(post).mock.calls.map(([body]) => body.action)).toEqual(['quote', 'reconcile', 'margin'])
  })
})
