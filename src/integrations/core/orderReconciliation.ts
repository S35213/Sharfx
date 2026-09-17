import type { ProviderOrderRequest, ProviderOrderResult } from './types'

export type SubmissionOutcome =
  | { kind: 'success'; result: ProviderOrderResult }
  | { kind: 'rejected'; error: Error }
  | { kind: 'transport_error'; error: Error }

export type ReconciliationState = 'accepted' | 'rejected' | 'unknown' | 'reconciled'

export interface ProviderOrderIntent {
  providerId: string
  accountId: string
  environment: 'demo' | 'live'
  clientOrderId: string
  createdAt: string
  request: ProviderOrderRequest
}

export interface ReconciliationResult {
  state: ReconciliationState
  order: ProviderOrderResult | null
  retryAllowed: boolean
  reason: string
}

const randomClientOrderId = (): string => {
  const randomUuid = globalThis.crypto?.randomUUID?.()
  if (randomUuid) return `shafx_${randomUuid.split('-').join('')}`
  return `shafx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`
}

export const ensureClientOrderId = (requested?: string): string => {
  const value = requested?.trim()
  if (value) return value.slice(0, 128)
  return randomClientOrderId()
}

export const createProviderOrderIntent = (
  providerId: string,
  accountId: string,
  environment: 'demo' | 'live',
  request: ProviderOrderRequest,
): ProviderOrderIntent => {
  const clientOrderId = ensureClientOrderId(request.clientOrderId)
  return {
    providerId,
    accountId,
    environment,
    clientOrderId,
    createdAt: new Date().toISOString(),
    request: { ...request, clientOrderId },
  }
}

export const classifySubmission = (outcome: SubmissionOutcome): ReconciliationResult => {
  if (outcome.kind === 'success') {
    return {
      state: outcome.result.status === 'rejected' ? 'rejected' : 'accepted',
      order: outcome.result,
      retryAllowed: outcome.result.status === 'rejected',
      reason: outcome.result.status === 'rejected' ? 'The provider explicitly rejected the order.' : 'The provider acknowledged the order.',
    }
  }

  if (outcome.kind === 'rejected') {
    return {
      state: 'rejected',
      order: null,
      retryAllowed: true,
      reason: outcome.error.message,
    }
  }

  return {
    state: 'unknown',
    order: null,
    retryAllowed: false,
    reason: `The submission result is unknown: ${outcome.error.message}. Reconcile by client order ID before retrying.`,
  }
}

export const reconcileByClientOrderId = (
  intent: ProviderOrderIntent,
  providerOrders: ProviderOrderResult[],
): ReconciliationResult => {
  const match = providerOrders.find((order) => order.clientOrderId === intent.clientOrderId)
  if (!match) {
    return {
      state: 'unknown',
      order: null,
      retryAllowed: false,
      reason: `No provider order was found for client order ID ${intent.clientOrderId}. Do not blindly retry; reconcile again or query the provider directly.`,
    }
  }

  return {
    state: 'reconciled',
    order: match,
    retryAllowed: false,
    reason: `Provider order ${match.providerOrderId} matches client order ID ${intent.clientOrderId}.`,
  }
}
