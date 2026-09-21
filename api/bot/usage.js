const json = (res, status, body) => res.status(status).json(body)
const cookie = (req, name) => (req.headers.cookie || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) || null
const supabase = (path, options = {}) => fetch(`${process.env.SUPABASE_URL}/auth/v1${path}`, { ...options, headers: { apikey: process.env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json', ...(options.headers || {}) } })
const rest = (path, options = {}) => fetch(`${process.env.SUPABASE_URL}/rest/v1${path}`, { ...options, headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json', ...(options.headers || {}) } })
const setSessionCookies = (res, session) => res.setHeader('Set-Cookie', [
  `shafx_session=${encodeURIComponent(session.access_token)}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=3600`,
  `shafx_refresh=${encodeURIComponent(session.refresh_token)}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=2592000`,
])
const getUser = async (req, res) => {
  const accessToken = cookie(req, 'shafx_session')
  if (accessToken) {
    const decoded = decodeURIComponent(accessToken)
    const response = await supabase('/user', { headers: { Authorization: `Bearer ${decoded}` } })
    if (response.ok) return response.json()
  }

  const refreshToken = cookie(req, 'shafx_refresh')
  if (!refreshToken) return null
  const response = await supabase('/token?grant_type=refresh_token', {
    method: 'POST',
    body: JSON.stringify({ refresh_token: decodeURIComponent(refreshToken) }),
  })
  if (!response.ok) return null
  const session = await response.json()
  if (!session.access_token || !session.refresh_token || !session.user) return null
  setSessionCookies(res, session)
  return session.user
}
const normalizeEntitlement = (row) => {
  const requested = row?.plan === 'PRO' || row?.plan === 'REGULAR' ? row.plan : 'FREE'
  if (requested === 'FREE') return 'FREE'
  const status = String(row?.subscription_status || '').toLowerCase()
  const endsAt = row?.subscription_ends_at ? new Date(row.subscription_ends_at).getTime() : null
  const activeStatus = status === 'active' || status === 'trialing'
  return activeStatus && (endsAt === null || Number.isFinite(endsAt) && endsAt > Date.now()) ? requested : 'FREE'
}
const policy = { FREE: { max: 5 }, REGULAR: { max: 15 }, PRO: { max: null } }
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) return json(res, 503, { ok: false, error: 'Bot usage service is not configured.' })
  if (req.method !== 'GET' && req.method !== 'POST') return json(res, 405, { ok: false, error: 'Method not allowed' })
  try {
    const user = await getUser(req, res)
    if (!user) return json(res, 401, { ok: false, error: 'Not signed in' })

    const usageResponse = await rest(`/shafx_bot_usage?user_id=eq.${encodeURIComponent(user.id)}&select=run_id,used_cycle_units,current_unit_round,usage_day`)
    const usageRows = usageResponse.ok ? await usageResponse.json() : []
    const current = usageRows[0] || { run_id: null, used_cycle_units: 0, current_unit_round: 0, usage_day: null }
    const entitlementResponse = await rest(`/shafx_bot_entitlements?user_id=eq.${encodeURIComponent(user.id)}&select=plan,subscription_status,subscription_ends_at`)
    const entitlementRows = entitlementResponse.ok ? await entitlementResponse.json() : []
    const plan = normalizeEntitlement(entitlementRows[0])
    const max = policy[plan].max
    const today = new Date().toISOString().slice(0, 10)
    const isCurrentBotVersion = String(current.run_id || '').startsWith('v2-')
    const usedCycleUnits = current.usage_day === today && isCurrentBotVersion ? Number(current.used_cycle_units) || 0 : 0
    const currentUnitRound = current.usage_day === today && isCurrentBotVersion ? Number(current.current_unit_round) || 0 : 0

    if (req.method === 'GET') {
      return json(res, 200, {
        ok: true,
        plan,
        runId: isCurrentBotVersion ? current.run_id : null,
        usedCycleUnits,
        maxCycleUnits: max,
        currentUnitRound,
        usageDay: today,
      })
    }

    const body = typeof req.body === 'object' && req.body ? req.body : {}
    const runId = String(body.runId || '').slice(0, 100)
    if (!runId.startsWith('v3-')) return json(res, 400, { ok: false, error: 'Invalid bot session.' })

    const rpc = await rest('/rpc/consume_shafx_bot_round', { method: 'POST', body: JSON.stringify({ p_user_id: user.id, p_run_id: runId }) })
    const rows = await rpc.json().catch(() => [])
    if (!rpc.ok || !Array.isArray(rows) || !rows[0]) return json(res, 503, { ok: false, error: 'Unable to record bot round.' })
    const result = rows[0]
    if (!result.ok) return json(res, 429, { ok: false, error: `${result.plan} bot daily allowance reached.`, plan: result.plan, usedCycleUnits: result.used_cycle_units, maxCycleUnits: result.max_cycle_units, currentUnitRound: result.round_number, completedUnit: false, usageDay: result.usage_day })
    return json(res, 200, { ok: true, plan: result.plan, runId, usedCycleUnits: result.used_cycle_units, maxCycleUnits: result.max_cycle_units, currentUnitRound: result.round_number, completedUnit: result.completed_unit, usageDay: result.usage_day })
  } catch (error) {
    return json(res, 500, { ok: false, error: error instanceof Error ? error.message : 'Bot usage service failed.' })
  }
}
