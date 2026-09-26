import { describe, expect, it } from 'vitest'
import { DERIV_PUBLIC_WS_URL, toDerivSymbol } from './DerivPublicMarketFeed'

describe('DerivPublicMarketFeed', () => {
  it('uses the current public WebSocket endpoint', () => {
    expect(DERIV_PUBLIC_WS_URL).toBe('wss://ws.binaryws.com/websockets/v3')
  })

  it('maps six-character forex pairs to Deriv symbols', () => {
    expect(toDerivSymbol('EURUSD')).toBe('frxEURUSD')
    expect(toDerivSymbol('EUR/USD')).toBe('frxEURUSD')
  })

  it('leaves non-forex symbols unchanged', () => {
    expect(toDerivSymbol('1HZ100V')).toBe('1HZ100V')
  })
})
