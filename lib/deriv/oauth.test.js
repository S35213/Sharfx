import { describe, expect, it } from 'vitest'
import { createAuthorizationUrl, createPkce } from './oauth.js'

describe('Deriv OAuth compatibility wrapper', () => {
  it('creates the Deriv S256 authorization URL through provider-neutral helpers', () => {
    const previous = process.env.SHAFX_DERIV_SESSION_SECRET
    process.env.SHAFX_DERIV_SESSION_SECRET = 'x'.repeat(40)
    const pkce = createPkce()
    const url = createAuthorizationUrl('https://shafx.example', 'client-1', 'account', pkce.state, pkce.challenge)
    expect(url).toContain('auth.deriv.com/oauth2/auth')
    expect(url).toContain('code_challenge_method=S256')
    if (previous === undefined) delete process.env.SHAFX_DERIV_SESSION_SECRET
    else process.env.SHAFX_DERIV_SESSION_SECRET = previous
  })
})
