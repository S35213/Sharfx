const BASE_URL = String(process.env.SHAFX_LOADTEST_URL || '').trim()
if (!BASE_URL) throw new Error('SHAFX_LOADTEST_URL must be set explicitly; refusing to load-test a production host by default.')
const TARGETS = [10, 25, 50]
const ROUTES = [
  { name: 'home', path: '/', expected: [200] },
  // Vercel maps api/auth.js to /api/auth; auth actions are query parameters.
  { name: 'auth-me', path: '/api/auth?action=me', expected: [401] },
  { name: 'bot-usage', path: '/api/bot/usage', expected: [401] },
]

const percentile = (values, p) => {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return sorted[index]
}

async function hit(path) {
  const started = performance.now()
  try {
    const response = await fetch(`${BASE_URL}${path}`, { redirect: 'manual' })
    return { status: response.status, ms: performance.now() - started }
  } catch (error) {
    return { status: 0, ms: performance.now() - started, error: error instanceof Error ? error.message : String(error) }
  }
}

async function runRoute(route, concurrency) {
  const started = performance.now()
  const results = await Promise.all(Array.from({ length: concurrency }, () => hit(route.path)))
  const elapsed = performance.now() - started
  const latencies = results.map((result) => result.ms)
  const counts = results.reduce((map, result) => {
    const key = String(result.status)
    map[key] = (map[key] || 0) + 1
    return map
  }, {})
  const failures = results.filter((result) => !route.expected.includes(result.status) || result.error)
  return {
    route: route.name,
    concurrency,
    elapsedMs: Math.round(elapsed),
    rps: Math.round((concurrency / Math.max(elapsed, 1)) * 1000),
    p50Ms: Math.round(percentile(latencies, 50)),
    p95Ms: Math.round(percentile(latencies, 95)),
    p99Ms: Math.round(percentile(latencies, 99)),
    statusCounts: counts,
    failures: failures.length,
    sampleError: failures[0]?.error || null,
  }
}

console.log(`SHAFX explicit-target concurrency test: ${BASE_URL}`)
console.log('Unauthenticated routes are used so the test never consumes a real user quota or needs credentials.')

for (const concurrency of TARGETS) {
  console.log(`\n=== ${concurrency} concurrent requests ===`)
  for (const route of ROUTES) {
    const result = await runRoute(route, concurrency)
    console.log(JSON.stringify(result))
    if (result.failures > 0) process.exitCode = 1
  }
}

console.log('\nLoad test complete. This validates public/auth rejection paths under concurrency; it does not certify authenticated-user quota throughput or 10,000-user readiness.')
