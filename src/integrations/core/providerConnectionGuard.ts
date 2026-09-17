import type { ProviderAdapter, ProviderConnection } from './types'

export interface ProviderConnectionGuardResult {
  allowed: boolean
  reason?: string
}

export const validateProviderConnection = (
  adapter: ProviderAdapter,
  connection: ProviderConnection,
  expectedEnvironment?: 'demo' | 'live',
): ProviderConnectionGuardResult => {
  if (connection.providerId !== adapter.descriptor.id) {
    return { allowed: false, reason: 'The connection belongs to a different provider.' }
  }
  if (connection.state === 'expired') {
    return { allowed: false, reason: 'The provider connection has expired.' }
  }
  if (connection.state === 'disconnected') {
    return { allowed: false, reason: 'The provider connection is disconnected.' }
  }
  if (connection.expiresAt) {
    const expiresAt = Date.parse(connection.expiresAt)
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      return { allowed: false, reason: 'The provider connection is expired.' }
    }
  }
  if (expectedEnvironment && connection.environment !== expectedEnvironment) {
    return { allowed: false, reason: `The connection environment must be ${expectedEnvironment}.` }
  }
  return { allowed: true }
}
