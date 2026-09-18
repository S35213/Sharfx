import { describe, expect, it } from 'vitest'
import { collectProviderHealthAlerts } from './providerHealthAlerts'

const base = {
  id: 'c1', providerId: 'oanda', label: 'Demo', environment: 'demo' as const, state: 'connected' as const,
  authMethod: 'api_key' as const, expiresAt: null, lastSeenAt: '2026-09-18T09:00:00.000Z',
  metadata: {}, createdAt: '2026-09-18T08:00:00.000Z', updatedAt: '2026-09-18T09:00:00.000Z', accounts: [],
}
describe('collectProviderHealthAlerts', () => {
  it('returns no alert for a healthy connection', () => {
    expect(collectProviderHealthAlerts([base], Date.parse('2026-09-18T09:01:00.000Z'))).toEqual([])
  })
  it('returns critical alerts for expiry and disconnect states', () => {
    const alerts = collectProviderHealthAlerts([{ ...base, expiresAt: '2026-09-18T08:59:00.000Z' }], Date.parse('2026-09-18T09:00:00.000Z'))
    expect(alerts[0]).toMatchObject({ severity: 'critical', status: 'expired' })
  })
})
