import { describe, expect, it } from 'vitest'
import {
  signalBotFramesForSource,
  signalBotMarketSourceError,
  signalBotMarketSourceKey,
  signalBotFramesSignature,
  type SignalBotMarketDataState,
  type SignalBotMarketSource,
} from './useSignalBotMarketData'

const candles = [{ time: 60, open: 1.1, high: 1.2, low: 1.0, close: 1.15 }]

describe('Signal Bot provider isolation', () => {
  it('scopes histories by symbol, provider, connection, account and environment', () => {
    const source: SignalBotMarketSource = {
      providerId: 'ctrader',
      connectionId: 'connection-a',
      accountId: 'account-a',
      environment: 'demo',
    }
    const original = signalBotMarketSourceKey('EUR/USD', source)
    expect(signalBotMarketSourceKey('GBP/USD', source)).not.toBe(original)
    expect(signalBotMarketSourceKey('EUR/USD', { ...source, accountId: 'account-b' })).not.toBe(original)
    expect(signalBotMarketSourceKey('EUR/USD', { ...source, environment: 'live' })).not.toBe(original)
    expect(signalBotMarketSourceKey('EUR/USD', { ...source, providerId: 'deriv' })).not.toBe(original)
  })

  it('detects whether a fresh scan returned changed candle data', () => {
    const originalFrames = {
      M1: [
        { time: 60, open: 1.1, high: 1.2, low: 1.0, close: 1.15 },
        { time: 120, open: 1.15, high: 1.21, low: 1.14, close: 1.2 },
      ],
    }
    const sameFrames = {
      M1: originalFrames.M1.map((candle) => ({ ...candle })),
    }
    const changedFrames = {
      M1: [
        ...originalFrames.M1.slice(0, -1),
        { ...originalFrames.M1[1], close: 1.205 },
      ],
    }

    expect(signalBotFramesSignature(sameFrames)).toBe(signalBotFramesSignature(originalFrames))
    expect(signalBotFramesSignature(changedFrames)).not.toBe(signalBotFramesSignature(originalFrames))
  })

  it('never returns cached candles for a different provider/account source key', () => {
    const oldState: SignalBotMarketDataState = {
      sourceKey: 'EUR/USD|deriv|no-connection|no-account|no-environment',
      frames: { M5: candles },
      status: 'ready',
      updatedAt: 123,
      error: null,
    }
    expect(signalBotFramesForSource(oldState, 'EUR/USD|ctrader|connection-a|account-a|demo')).toEqual({})
    expect(signalBotFramesForSource(oldState, oldState.sourceKey)).toEqual({ M5: candles })
  })

  it('refuses to substitute another broker when cTrader account details are missing', () => {
    expect(signalBotMarketSourceError({ providerId: 'ctrader' })).toContain('Connect and select a cTrader account')
    expect(signalBotMarketSourceError({ providerId: 'unknown-provider' })).toContain('No other provider will be substituted')
    expect(signalBotMarketSourceError({ providerId: 'deriv' })).toBeNull()
  })
})
