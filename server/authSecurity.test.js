import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearLoginFailures, loginGuard, signupGuard } from './authSecurity.js'

const request = () => ({
  headers: {
    'x-forwarded-for': '203.0.113.10',
    'user-agent': 'SHAFX-test',
  },
})

const restoreEnv = () => {
  process.env.SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test'
}

afterEach(() => {
  vi.restoreAllMocks()
  restoreEnv()
})

describe('authSecurity durable limiter', () => {
  it('fails closed when the durable limiter is unavailable', async () => {
    restoreEnv()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('database unavailable')))

    const result = await loginGuard(request())

    expect(result.allowed).toBe(false)
    expect(result.status).toBe(503)
  })

  it('uses the Supabase RPC for signup limits', async () => {
    restoreEnv()
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([{
      blocked: false,
      attempt_count: 1,
      retry_after_seconds: 900,
    }]), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await signupGuard(request(), {
      email: 'student@example.com',
      password: 'StrongPassword!123',
    })

    expect(result.allowed).toBe(true)
    expect(fetchMock).toHaveBeenCalledOnce()
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.p_limit).toBe(5)
    expect(body.p_window_seconds).toBe(900)
    expect(body.p_reset).toBe(false)
  })

  it('resets the login-failure bucket through the RPC', async () => {
    restoreEnv()
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([{
      blocked: false,
      attempt_count: 0,
      retry_after_seconds: 900,
    }]), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    await clearLoginFailures(request())

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.p_reset).toBe(true)
    expect(body.p_limit).toBe(8)
  })
})
