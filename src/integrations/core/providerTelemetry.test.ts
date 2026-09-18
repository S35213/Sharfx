import { describe, expect, it } from 'vitest'
import { providerTelemetry } from './providerTelemetry'

describe('providerTelemetry', () => {
  it('records provider metrics independently', () => {
    providerTelemetry.reset()
    providerTelemetry.record('oanda', 'quote_success')
    providerTelemetry.record('oanda', 'quote_failure', 'timeout')
    providerTelemetry.record('binance', 'quote_success')
    expect(providerTelemetry.get('oanda')?.metrics.quote_success).toBe(1)
    expect(providerTelemetry.get('oanda')?.metrics.quote_failure).toBe(1)
    expect(providerTelemetry.get('binance')?.metrics.quote_success).toBe(1)
  })
})