import { randomUUID } from 'node:crypto'

const BASE_URL = process.env.SHAFX_LOADTEST_URL || 'https://shafx.vercel.app'
const TEST_EMAIL = String(process.env.SHAFX_TEST_EMAIL || '').trim().toLowerCase()
const TEST_PASSWORD = String(process.env.SHAFX_TEST_PASSWORD || '')

if (!TEST_EMAIL || !TEST_PASSWORD) {
  throw new Error('SHAFX_TEST_EMAIL and SHAFX_TEST_PASSWORD are required. The production load test never creates accounts because signup would send transactional email.')
}

const request = async (path, options = {}) => {
  const response = await fetch(`${BASE_URL}${path}`, { redirect: 'manual', ...options })
  const body = await response.json().catch(() => ({}))
  return { response, body }
}

const extractSessionCookie = (response) => {
  const cookies = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : []
  return cookies.find((value) => value.startsWith('shafx_session='))?.split(';', 1)[0] || null
}

const login = async () => {
  const { response, body } = await request('/api/auth?action=login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'SHAFX-auth-load-test/1.1' },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  })
  if (!response.ok) throw new Error(`Login failed (${response.status}): ${body.error || 'unknown error'}`)
  const cookie = extractSessionCookie(response)
  if (!cookie) throw new Error('Login succeeded but no SHAFX session cookie was issued.')
  return cookie
}

const postUsage = async (cookie, units, runId) => {
  const started = performance.now()
  try {
    const { response, body } = await request('/api/bot/usage', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie, 'user-agent': 'SHAFX-auth-load-test/1.1' },
      body: JSON.stringify({ units, runId }),
    })
    return { status: response.status, body, ms: performance.now() - started }
  } catch (error) {
    return { status: 0, body: {}, ms: performance.now() - started, error: error instanceof Error ? error.message : String(error) }
  }
}

const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

console.log(`SHAFX authenticated quota concurrency test: ${BASE_URL}`)
console.log(`Dedicated pre-confirmed test identity: ${TEST_EMAIL}`)
console.log('Safety rule: this test performs login only and never calls signup, so it cannot generate confirmation emails.')

const cookie = await login()
const me = await request('/api/auth?action=me', { headers: { cookie, 'user-agent': 'SHAFX-auth-load-test/1.1' } })
assert(me.response.status === 200 && me.body.ok === true, `Authenticated /me failed: ${me.response.status} ${JSON.stringify(me.body)}`)
assert(me.body.user?.botPlan === 'FREE', `Expected isolated account to start as FREE, got ${me.body.user?.botPlan}`)

const started = performance.now()
const results = await Promise.all(Array.from({ length: 20 }, (_, index) => postUsage(cookie, 1, `auth-load-${randomUUID()}-${index}`)))
const elapsed = performance.now() - started
const success = results.filter((result) => result.status === 200)
const limited = results.filter((result) => result.status === 429)
const unexpected = results.filter((result) => ![200, 429].includes(result.status))

console.log(JSON.stringify({
  test: '20 concurrent 1-unit bot cycles for FREE account',
  elapsedMs: Math.round(elapsed),
  success: success.length,
  rateLimited: limited.length,
  unexpected: unexpected.length,
  statuses: results.reduce((map, result) => { const key = String(result.status); map[key] = (map[key] || 0) + 1; return map }, {}),
  maxReportedUsage: Math.max(...success.map((result) => Number(result.body.usedCycleUnits || 0)), 0),
}))

assert(success.length === 5, `Quota race detected or quota mismatch: expected exactly 5 successful 1-unit cycles, got ${success.length}`)
assert(limited.length === 15, `Expected exactly 15 rate-limited requests, got ${limited.length}`)
assert(unexpected.length === 0, `Unexpected statuses/errors: ${JSON.stringify(unexpected.slice(0, 3))}`)
assert(Math.max(...success.map((result) => Number(result.body.usedCycleUnits || 0))) === 5, 'Final reported usage did not reach exactly 5 units.')

console.log('PASS: authenticated quota enforcement is atomic under 20-way concurrency for FREE.')
console.log('Note: this test uses a dedicated pre-confirmed test account and does not certify REGULAR/PRO throughput.')
