const json = (res, status, body) => res.status(status).json(body)
const cookie = (req, name) => (req.headers.cookie || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) || null
const supabase = (path, options = {}, service = false) => fetch(`${process.env.SUPABASE_URL}/auth/v1${path}`, { ...options, headers: { apikey: service ? process.env.SUPABASE_SERVICE_ROLE_KEY : process.env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json', ...(options.headers || {}) } })
const rest = (path, options = {}) => fetch(`${process.env.SUPABASE_URL}/rest/v1${path}`, { ...options, headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json', ...(options.headers || {}) } })
const getUser = async (req) => { const token = cookie(req, 'shafx_session'); if (!token) return null; const response = await supabase('/user', { headers: { Authorization: `Bearer ${decodeURIComponent(token)}` } }); return response.ok ? response.json() : null }
const policy = { FREE: { max: 5 }, REGULAR: { max: 100 }, PRO: { max: 500 } }
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) return json(res, 503, { ok: false, error: 'Bot usage service is not configured.' })
  if (req.method !== 'GET' && req.method !== 'POST') return json(res, 405, { ok: false, error: 'Method not allowed' })
  try {
    const user = await getUser(req)
    if (!user) return json(res, 401, { ok: false, error: 'Not signed in' })
    const entitlementResponse = await rest(`/shafx_bot_entitlements?user_id=eq.${encodeURIComponent(user.id)}&select=plan`)
    const entitlementRows = entitlementResponse.ok ? await entitlementResponse.json() : []
    const plan = entitlementRows[0]?.plan === 'PRO' || entitlementRows[0]?.plan === 'REGULAR' ? entitlementRows[0].plan : 'FREE'
    const max = policy[plan].max
    const usageResponse = await rest(`/shafx_bot_usage?user_id=eq.${encodeURIComponent(user.id)}&select=run_id,used_cycle_units`)
    const usageRows = usageResponse.ok ? await usageResponse.json() : []
    const current = usageRows[0] || { run_id: null, used_cycle_units: 0 }
    if (req.method === 'GET') return json(res, 200, { ok: true, plan, runId: current.run_id, usedCycleUnits: current.used_cycle_units, maxCycleUnits: max })
    const body = typeof req.body === 'object' && req.body ? req.body : {}
    const runId = String(body.runId || '').slice(0, 100)
    const units = Number(body.units)
    if (!runId || !Number.isInteger(units) || units < 1 || units > 2) return json(res, 400, { ok: false, error: 'Invalid bot cycle request.' })
    let used = current.used_cycle_units
    if (current.run_id !== runId) used = 0
    if (used + units > max) return json(res, 429, { ok: false, error: `${plan} bot cycle allowance reached.`, plan, usedCycleUnits: used, maxCycleUnits: max })
    const next = used + units
    const update = await rest(`/shafx_bot_usage?user_id=eq.${encodeURIComponent(user.id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ run_id: runId, used_cycle_units: next, updated_at: new Date().toISOString() }) })
    if (!update.ok) return json(res, 503, { ok: false, error: 'Unable to record bot cycle usage.' })
    return json(res, 200, { ok: true, plan, runId, usedCycleUnits: next, maxCycleUnits: max })
  } catch (error) { return json(res, 500, { ok: false, error: error instanceof Error ? error.message : 'Bot usage service failed.' }) }
}
