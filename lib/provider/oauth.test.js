import { describe, expect, it } from 'vitest'
import { createAuthorizationUrl, createPkce, exchangeAuthorizationCode, parseSignedState, serializeSignedState } from './oauth.js'

describe('provider-neutral OAuth helpers', () => {
  it('creates S256 PKCE material', () => {
    const first = createPkce()
    expect(first.verifier).toBeTruthy()
    expect(first.challenge).toBeTruthy()
    expect(first.state).toBeTruthy()
    expect(first.challenge).not.toBe(first.verifier)
  })

  it('round-trips signed state with timing-safe verification', async () => {
    const secret = 'x'.repeat(40)
    const state = createPkce()
    const cookie = await serializeSignedState({ ...state, secret })
    const parsed = await parseSignedState(cookie, { secret })
    expect(parsed.state).toBe(state.state)
    expect(parsed.verifier).toBe(state.verifier)
  })

  it('creates provider-specific authorization URLs', () => {
    const url = createAuthorizationUrl({
      authorizationUrl: 'https://provider.example/oauth/authorize',
      clientId: 'client-1',
      redirectUri: 'https://shafx.example/callback',
      scope: 'accounts',
      state: 'state-1',
      challenge: 'challenge-1',
    })
    expect(url).toContain('response_type=code')
    expect(url).toContain('code_challenge_method=S256')
    expect(url).toContain('client_id=client-1')
  })

  it('rejects unsuccessful token exchanges', async () => {
    const previous = globalThis.fetch
    globalThis.fetch = async () => new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 })
    await expect(exchangeAuthorizationCode({
      tokenUrl: 'https://provider.example/oauth/token',
      code: 'code',
      verifier: 'verifier',
      clientId: 'client',
      redirectUri: 'https://shafx.example/callback',
    })).rejects.toThrow('OAuth token exchange failed.')
    globalThis.fetch = previous
  })
})
