import { describe, expect, it, vi } from 'vitest'
import { aggregateWeeklyCandles, createDerivCandleHistoryRequest, DERIV_PUBLIC_WS_URL, SHAFX_MARKET_PROXY_WS_URL, getDerivMarketWebSocketUrl, toDerivSymbol } from './DerivPublicMarketFeed'

describe('DerivPublicMarketFeed', () => {
  it('uses the current public WebSocket endpoint for local fallback', () => {
    expect(DERIV_PUBLIC_WS_URL).toBe('wss://api.derivws.com/trading/v1/options/ws/public')
  })

  it('uses the deployed Cloudflare market proxy for production browsers', () => {
    vi.stubGlobal('window', { location: { hostname: 'sharfx.150sharingan2.workers.dev', protocol: 'https:', host: 'sharfx.150sharingan2.workers.dev' } })
    expect(SHAFX_MARKET_PROXY_WS_URL).toBe('wss://sharfx.150sharingan2.workers.dev/api/deriv/public-market')
    expect(getDerivMarketWebSocketUrl()).toBe(SHAFX_MARKET_PROXY_WS_URL)
    vi.unstubAllGlobals()
  })

  it('keeps localhost on the direct Deriv endpoint', () => {
    vi.stubGlobal('window', { location: { hostname: 'localhost', protocol: 'http:', host: 'localhost:5173' } })
    expect(getDerivMarketWebSocketUrl()).toBe(DERIV_PUBLIC_WS_URL)
    vi.unstubAllGlobals()
  })

  it('maps six-character forex pairs to Deriv symbols', () => {
    expect(toDerivSymbol('EURUSD')).toBe('frxEURUSD')
    expect(toDerivSymbol('EUR/USD')).toBe('frxEURUSD')
  })

  it('builds exact one-shot candle history requests without the rejected subscribe field', () => {
    expect(createDerivCandleHistoryRequest('1HZ100V', 'M1')).toEqual({
      ticks_history: '1HZ100V',
      end: 'latest',
      count: 300,
      style: 'candles',
      granularity: 60,
      adjust_start_time: 1,
      req_id: 1,
    })
    expect(createDerivCandleHistoryRequest(toDerivSymbol('EUR/USD'), 'M1')).toEqual({
      ticks_history: 'frxEURUSD',
      end: 'latest',
      count: 300,
      style: 'candles',
      granularity: 60,
      adjust_start_time: 1,
      req_id: 1,
    })
  })

  it('builds a historical candle fallback with the selected granularity', () => {
    expect(createDerivCandleHistoryRequest('frxEURUSD', 'M1', {
      end: 1790325833,
      count: 300,
      reqId: 3,
    })).toEqual({
      ticks_history: 'frxEURUSD',
      end: 1790325833,
      count: 300,
      style: 'candles',
      granularity: 60,
      adjust_start_time: 1,
      req_id: 3,
    })
  })
  it('requests daily candles for W1 and aggregates them client-side', () => {
    expect(createDerivCandleHistoryRequest('frxEURUSD', 'W1')).toEqual({
      ticks_history: 'frxEURUSD',
      end: 'latest',
      count: 2100,
      style: 'candles',
      granularity: 86400,
      adjust_start_time: 1,
      req_id: 1,
    })

    expect(aggregateWeeklyCandles([
      { time: Date.parse('2026-09-21T00:00:00.000Z'), open: 1.1, high: 1.2, low: 1.0, close: 1.15 },
      { time: Date.parse('2026-09-22T00:00:00.000Z'), open: 1.15, high: 1.25, low: 1.1, close: 1.2 },
      { time: Date.parse('2026-09-28T00:00:00.000Z'), open: 1.2, high: 1.3, low: 1.18, close: 1.28 },
    ])).toEqual([
      { time: Date.parse('2026-09-21T00:00:00.000Z'), open: 1.1, high: 1.25, low: 1.0, close: 1.2 },
      { time: Date.parse('2026-09-28T00:00:00.000Z'), open: 1.2, high: 1.3, low: 1.18, close: 1.28 },
    ])
  })


  it('leaves non-forex symbols unchanged', () => {
    expect(toDerivSymbol('1HZ100V')).toBe('1HZ100V')
  })
})

