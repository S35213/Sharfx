import { describe, expect, it } from 'vitest'
import {
  tradeBotMarketSourceError,
  tradeBotMarketSourceKey,
  tradeBotFramesForSource,
  type TradeBotMarketState,
} from './useTradeBotMarketData'
import { tradeBotRiskBudget, evaluateTradeBotDecision } from './tradeBotDecision'
import { getSymbolSpec } from '../../data/mock/symbols'
import type { OHLCV } from '../../types'

describe('independent Trade Bot guardrails', () => {
  it('scopes candle state by symbol, provider, account, connection and environment', () => {
    const source = { providerId: 'ctrader', connectionId: 'c1', accountId: 'a1', environment: 'demo' as const }
    const key = tradeBotMarketSourceKey('EUR/USD', source)
    expect(tradeBotMarketSourceKey('GBP/USD', source)).not.toBe(key)
    expect(tradeBotMarketSourceKey('EUR/USD', { ...source, accountId: 'a2' })).not.toBe(key)
    expect(tradeBotMarketSourceKey('EUR/USD', { ...source, environment: 'live' })).not.toBe(key)
    expect(tradeBotMarketSourceKey('EUR/USD', { ...source, providerId: 'deriv' })).not.toBe(key)
  })

  it('refuses live cTrader, Deriv, and incomplete account selections', () => {
    expect(tradeBotMarketSourceError({ providerId: 'ctrader' })).toContain('Connect and select')
    expect(tradeBotMarketSourceError({ providerId: 'ctrader', connectionId: 'c1', accountId: 'a1', environment: 'live' })).toContain('disabled for live')
    expect(tradeBotMarketSourceError({ providerId: 'deriv' })).toContain('practice accounts only')
    expect(tradeBotMarketSourceError({ providerId: 'ctrader', connectionId: 'c1', accountId: 'a1', environment: 'demo' })).toBeNull()
  })

  it('does not leak a different source’s cached frames', () => {
    const oldState: TradeBotMarketState = {
      sourceKey: 'EUR/USD|ctrader|c1|a1|demo',
      frames: { M5: [{ time: 60, open: 1.1, high: 1.2, low: 1, close: 1.15 }] },
      status: 'ready',
      updatedAt: 123,
      quoteTimestamp: 123,
      quoteError: null,
      lastDataChangedAt: 123,
      error: null,
      cycleNumber: 1,
      lastDataChanged: null,
    }
    expect(tradeBotFramesForSource(oldState, 'EUR/USD|ctrader|c2|a1|demo')).toEqual({})
  })

  it('caps per-trade risk at the lower of 0.5% of balance or 10', () => {
    expect(tradeBotRiskBudget(100)).toBe(0.5)
    expect(tradeBotRiskBudget(1000)).toBe(5)
    expect(tradeBotRiskBudget(10000)).toBe(10)
    expect(tradeBotRiskBudget(0)).toBe(0)
    expect(tradeBotRiskBudget(Number.NaN)).toBe(0)
  })

  it('blocks risk sizing when broker-confirmed instrument specs are missing', () => {
    const result = evaluateTradeBotDecision({
      frames: {},
      symbol: 'EUR/USD',
      timeframe: 'M5',
      accountBalance: 1000,
      accountCurrency: 'USD',
      symbolSpec: null,
    })
    expect(result.status).toBe('BLOCKED')
    expect(result.setup).toBeNull()
    expect(result.riskPlan).toBeNull()
    expect(result.reason).toContain('Verified cTrader instrument contract data is unavailable')
  })


  it('produces a scored fallback candidate when structure/liquidity has no executable setup', () => {
    const changes = [0.00010, -0.00009, 0.00006, -0.00009, 0.00006, 0.00010]
    const candles: OHLCV[] = []
    let close = 1.1
    for (let index = 0; index < 90; index += 1) {
      const open = close
      close = open + changes[index % changes.length]
      candles.push({
        time: (index + 1) * 300,
        open,
        close,
        high: Math.max(open, close) + 0.00003,
        low: Math.min(open, close) - 0.00003,
      })
    }
    candles.push({
      time: 91 * 300,
      open: close,
      close: close + 0.00001,
      high: close + 0.00003,
      low: close - 0.00003,
    })

    const result = evaluateTradeBotDecision({
      frames: { M5: candles },
      symbol: 'EUR/USD',
      timeframe: 'M5',
      accountBalance: 1000,
      accountCurrency: 'USD',
      symbolSpec: getSymbolSpec('EUR/USD'),
      requestedLots: 0.01,
    })

    expect(result.status).toBe('READY')
    expect(result.setup?.direction).toBe('BUY')
    expect(result.signalAnalysis?.source).toBe('EMA_MOMENTUM')
    expect(result.signalAnalysis?.score).toBeGreaterThanOrEqual(75)
    expect(result.signalCandleTime).toBe(candles[candles.length - 2]?.time)
    expect(result.riskPlan?.valid).toBe(true)
  })

  it('waits instead of inventing a setup when timeframe candles are missing', () => {
    const symbolSpec = getSymbolSpec('EUR/USD')
    const result = evaluateTradeBotDecision({
      frames: {},
      symbol: 'EUR/USD',
      timeframe: 'M5',
      accountBalance: 1000,
      accountCurrency: 'USD',
      symbolSpec,
    })
    expect(result.status).toBe('WAIT')
    expect(result.setup).toBeNull()
    expect(result.reason).toContain('at least 8 M5 candles')
  })
})
