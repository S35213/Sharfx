import type { ProviderAdapter, ProviderConnection, ProviderQuote } from './types'

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

export async function getQuoteWithFailover(
  candidates: ProviderMarketCandidate[],
  symbol: string,
): Promise<ProviderMarketFailoverResult> {
  const errors: string[] = []
  const attemptedProviderIds: string[] = []

  for (const candidate of candidates) {
    attemptedProviderIds.push(candidate.adapter.descriptor.id)
    if (!candidate.adapter.descriptor.capabilities.marketData || typeof candidate.adapter.getQuote !== 'function') {
      errors.push(candidate.adapter.descriptor.id + ':market-data-not-supported')
      continue
    }

    try {
      const quote = await candidate.adapter.getQuote(candidate.connection, candidate.accountId, symbol)
      return {
        quote,
        providerId: candidate.adapter.descriptor.id,
        connectionId: candidate.connection.connectionId,
        attemptedProviderIds,
      }
    } catch (error) {
      errors.push(candidate.adapter.descriptor.id + ':' + (error instanceof Error ? error.message : 'unknown-error'))
    }
  }

  throw new Error('All market-data providers failed: ' + errors.join(' | '))
}
