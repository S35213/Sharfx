import { describe, expect, it } from 'vitest'
import { buildOAuthAuthorizationUrl, createOAuthState, createPkcePair, exchangeOAuthCode } from './oauth2.js'

describe('generic OAuth2 helpers', () => {
  it('creates a PKCE S256 challenge and state', () => {
    const pair = createPkcePair()
    expect(pair.verifier).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(pair.challenge).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(pair.method).toBe('S256')
    expect(createOAuthState()).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('builds an encoded authorization URL', () => {
    const url = buildOAuthAuthorizationUrl({
      authorizationEndpoint: 'https://provider.example/oauth/authorize',
      clientId: 'client',
      redirectUri: 'https://shafx.example/callback',
      scope: 'accounts read',
      state: 'state',
      codeChallenge: 'challenge',
    })
    expect(url).toContain('response_type=code')
    expect(url).toContain('code_challenge=challenge')
    expect(url).toContain('scope=accounts+read')
  })

  it('exchanges an authorization code through the injected transport', async () => {
    let request
    const payload = await exchangeOAuthCode({
      tokenEndpoint: 'https://provider.example/oauth/token',
      code: 'abc',
      clientId: 'client',
      redirectUri: 'https://shafx.example/callback',
      codeVerifier: 'verifier',
      fetchImpl: async (...args) => {
        request = args
        return new Response(JSON.stringify({ access_token: 'token', expires_in: 3600 }), { status: 200, headers: { 'content-type': 'application/json' } })
      },
    })
    expect(payload.access_token).toBe('token')
    expect(request[0]).toBe('https://provider.example/oauth/token')
  })
})