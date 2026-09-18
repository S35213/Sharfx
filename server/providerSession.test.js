import { describe, expect, it } from 'vitest'
import { providerSessionNeedsRefresh, refreshProviderSession } from './providerSession.js'

describe('provider session lifecycle', () => {
  it('refreshes expired sessions before they are used', () => {
    expect(providerSessionNeedsRefresh({ accessToken: 'x', refreshToken: 'r', expiresAtMs: 10 }, 100)).toBe(true)
    expect(providerSessionNeedsRefresh({ accessToken: 'x', expiresAtMs: 100000 }, 100)).toBe(false)
  })

  it('preserves the previous refresh token when the provider rotates only the access token', async () => {
    const next = await refreshProviderSession({
      session: { accessToken: 'old', refreshToken: 'refresh', expiresAtMs: 1 },
      refresh: async (refreshToken) => ({ accessToken: refreshToken + '-next', expiresAtMs: 2000 }),
    })
    expect(next).toEqual({ accessToken: 'refresh-next', refreshToken: 'refresh', expiresAtMs: 2000 })
  })
})