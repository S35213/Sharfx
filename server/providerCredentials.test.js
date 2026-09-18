import { describe, expect, it } from 'vitest'
import { validateCredentialFields } from './providerCredentials.js'

describe('generic provider credential validation', () => {
  it('reports required fields generically', () => {
    const result = validateCredentialFields([
      { key: 'apiKey', required: true },
      { key: 'apiSecret', required: true },
    ], { apiKey: 'key' })
    expect(result).toEqual({ valid: false, missing: ['apiSecret'] })
  })
})