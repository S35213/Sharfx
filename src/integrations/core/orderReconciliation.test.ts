import { describe, expect, it } from 'vitest'
import type { ProviderOrderResult } from './types'
import { classifySubmission, createProviderOrderIntent, ensureClientOrderId, reconcileByClientOrderId } from './orderReconciliation'

const request = {
  symbol: 'EURUSD',
  side: 'BUY' as const,
  quantity: 0.1,
  quantityUnit: 'base' as const,
  type: 'MARKET' as const,
}

describe('order reconciliation', () => {
  it('preserves a provided client order id', () => {
    expect(ensureClientOrderId(' my-order ')).toBe('my-order')
  })

  it('creates an intent with one reusable client order id', () => {
    const intent = createProviderOrderIntent('demo-provider', 'acct-1', 'demo', request)
    expect(intent.clientOrderId).toMatch(/^shafx_/)
    expect(intent.request.clientOrderId).toBe(intent.clientOrderId)
  })

  it('treats a transport failure as unknown and blocks blind retry', () => {
    const result = classifySubmission({ kind: 'transport_error', error: new Error('socket closed') })
    expect(result.state).toBe('unknown')
    expect(result.retryAllowed).toBe(false)
  })

  it('allows retry only after an explicit provider rejection', () => {
    const result = classifySubmission({ kind: 'rejected', error: new Error('insufficient margin') })
    expect(result.state).toBe('rejected')
    expect(result.retryAllowed).toBe(true)
  })

  it('reconciles an uncertain submission by client order id', () => {
    const intent = createProviderOrderIntent('demo-provider', 'acct-1', 'demo', { ...request, clientOrderId: 'shafx_known' })
    const remote: ProviderOrderResult[] = [{
      providerOrderId: 'provider-77',
      clientOrderId: 'shafx_known',
      symbol: 'EURUSD',
      side: 'BUY',
      quantity: 0.1,
      status: 'accepted',
    }]

    const result = reconcileByClientOrderId(intent, remote)
    expect(result.state).toBe('reconciled')
    expect(result.retryAllowed).toBe(false)
    expect(result.order?.providerOrderId).toBe('provider-77')
  })

  it('does not authorize a blind retry when reconciliation finds nothing', () => {
    const intent = createProviderOrderIntent('demo-provider', 'acct-1', 'demo', { ...request, clientOrderId: 'shafx_missing' })
    const result = reconcileByClientOrderId(intent, [])
    expect(result.state).toBe('unknown')
    expect(result.retryAllowed).toBe(false)
  })
})
