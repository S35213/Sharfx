import { describe, expect, it } from 'vitest'
import { assertProviderExecutionEnabled, executeProviderOrder, ProviderExecutionDisabledError } from './providerExecutionGateway.js'

describe('server provider execution gate', () => {
  it('blocks external execution unless a release gate is explicitly supplied', () => {
    expect(() => assertProviderExecutionEnabled({ descriptor: { executionMode: 'external' } })).toThrow(ProviderExecutionDisabledError)
  })

  it('has no accidental live execution implementation', async () => {
    await expect(executeProviderOrder()).rejects.toThrow('disabled')
  })
})