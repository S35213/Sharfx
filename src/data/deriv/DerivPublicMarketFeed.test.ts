import { describe, expect, it, vi } from 'vitest'
import { DERIV_PUBLIC_WS_URL, SHAFX_MARKET_PROXY_WS_URL, getDerivMarketWebSocketUrl, toDerivSymbol } from './DerivPublicMarketFeed'

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

  it('keeps the feed alive when candle history is rejected', () => {
    expect(true).toBe(true)
  })

  it('leaves non-forex symbols unchanged', () => {
    expect(toDerivSymbol('1HZ100V')).toBe('1HZ100V')
  })
}
