import type { ProviderAdapter, ProviderConnection, ProviderQuote } from './types'
import { providerTelemetry } from './providerTelemetry'

export interface ProviderMarketCandidate {
  adapter: ProviderAdapter
  connection: ProviderConnection
  accountId?: string
}

export interface ProviderMarketFailoverResult {
  quote: ProviderQuote
  providerId: string
  connectionId: string
  attemptedProviderIds: string[]
}

export async function getQuoteWithFailover(candidates: ProviderMarketCandidate[], symbol: string): Promise<ProviderMarketFailoverResult> {
  const errors: string[] = []
  const attemptedProviderIds: string[] = []

  for (const candidate of candidates) {
    attemptedProviderIds.push(candidate.adapter.descriptor.id)
    if (!candidate.adapter.descriptor.capabilities.marketData || typeof candidate.adapter.getQuote !== 'function') {
      errors.push(candidate.adapter.descriptor.id + ':market-data-not-supported')
      providerTelemetry.record(candidate.adapter.descriptor.id, 'quote_failure', 'market-data-not-supported')
      continue
    }
    try {
      const quote = await candidate.adapter.getQuote(candidate.connection, candidate.accountId, symbol)
      providerTelemetry.record(candidate.adapter.descriptor.id, 'quote_success')
      return { quote, providerId: candidate.adapter.descriptor.id, connectionId: candidate.connection.connectionId, attemptedProviderIds }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown-error'
      errors.push(candidate.adapter.descriptor.id + ':' + message)
      providerTelemetry.record(candidate.adapter.descriptor.id, 'quote_failure', message)
    }
  }

  throw new Error('All market-data providers failed: ' + errors.join(' | '))
}