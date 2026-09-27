import { describe, expect, it, vi } from 'vitest'
import { createDerivCandleHistoryRequest, DERIV_PUBLIC_WS_URL, SHAFX_MARKET_PROXY_WS_URL, getDerivMarketWebSocketUrl, toDerivSymbol } from './DerivPublicMarketFeed'

describe('DerivPublicMarketFeed', () => {
  it('uses the current public WebSocket endpoint for local fallback', () => {
    expect(DERIV_PUBLIC_WS_URL).toBe('wss://api.derivws.com/trading/v1/options/ws/public')
  })

  it('uses the deployed Cloudflare market proxy for production browsers', () => {
    vi.stubGlobal('window', { location: { hostname: 'shafx.vercel.app', protocol: 'https:', host: 'shafx.vercel.app' } })
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
      req_id: 1,
    })
    expect(createDerivCandleHistoryRequest(toDerivSymbol('EUR/USD'), 'M1')).toEqual({
      ticks_history: 'frxEURUSD',
      end: 'latest',
      count: 300,
      style: 'candles',
      granularity: 60,
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
      req_id: 3,
    })
  })

  it('leaves non-forex symbols unchanged', () => {
    expect(toDerivSymbol('1HZ100V')).toBe('1HZ100V')
  })
})
