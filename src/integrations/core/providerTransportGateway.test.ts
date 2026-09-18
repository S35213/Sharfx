import { describe, expect, it } from 'vitest'
import type { FixSessionSettings } from './providerTransport'
import type { CustomProviderGateway, FixGatewayContract } from './providerTransport'

describe('provider gateway contracts', () => {
  it('keeps FIX session settings explicit and provider-neutral', () => {
    const settings: FixSessionSettings = {
      host: 'fix.example',
      port: 5001,
      senderCompId: 'SHAFX',
      targetCompId: 'BROKER',
    }
    expect(settings.targetCompId).toBe('BROKER')
  })

  it('allows proprietary gateway implementations behind one contract', async () => {
    const gateway: CustomProviderGateway = {
      providerId: 'custom',
      connect: async () => ({ connectionId: 'c1' }),
      disconnect: async () => undefined,
      request: async <T>() => ({ ok: true } as T),
      health: async () => ({ ok: true }),
    }
    await expect(gateway.health('c1')).resolves.toEqual({ ok: true })
  })

  it('models FIX transport lifecycle without coupling core to a FIX vendor library', async () => {
    const gateway: FixGatewayContract = {
      connect: async () => ({ sessionId: 'fix-1' }),
      send: async () => undefined,
      disconnect: async () => undefined,
      health: async () => ({ ok: true }),
    }
    await expect(gateway.connect({
      host: 'fix.example',
      port: 5001,
      senderCompId: 'SHAFX',
      targetCompId: 'BROKER',
    })).resolves.toEqual({ sessionId: 'fix-1' })
  })
})