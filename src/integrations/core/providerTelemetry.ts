export type ProviderTelemetryMetric =
  | 'quote_success'
  | 'quote_failure'
  | 'market_stream_error'
  | 'account_stream_error'
  | 'stale_data'

export interface ProviderTelemetrySnapshot {
  providerId: string
  metrics: Record<ProviderTelemetryMetric, number>
  lastError?: string
  lastEventAt?: number
}

const emptyMetrics = (): Record<ProviderTelemetryMetric, number> => ({
  quote_success: 0,
  quote_failure: 0,
  market_stream_error: 0,
  account_stream_error: 0,
  stale_data: 0,
})

class ProviderTelemetry {
  private readonly providers = new Map<string, ProviderTelemetrySnapshot>()

  record(providerId: string, metric: ProviderTelemetryMetric, detail?: string, at = Date.now()): void {
    const current = this.providers.get(providerId) || { providerId, metrics: emptyMetrics() }
    current.metrics[metric] += 1
    current.lastEventAt = at
    if (detail) current.lastError = detail
    this.providers.set(providerId, current)
  }

  get(providerId: string): ProviderTelemetrySnapshot | undefined {
    const value = this.providers.get(providerId)
    return value ? { providerId, metrics: { ...value.metrics }, lastError: value.lastError, lastEventAt: value.lastEventAt } : undefined
  }

  list(): ProviderTelemetrySnapshot[] {
    return [...this.providers.values()].map((value) => ({ providerId: value.providerId, metrics: { ...value.metrics }, lastError: value.lastError, lastEventAt: value.lastEventAt }))
  }

  reset(providerId?: string): void {
    if (providerId) this.providers.delete(providerId)
    else this.providers.clear()
  }
}

export const providerTelemetry = new ProviderTelemetry()