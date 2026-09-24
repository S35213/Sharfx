import { apiRequestGuard } from '../../server/authSecurity.js'
const json = (res, status, body) => res.status(status).json(body)
const cookie = (req, name) => (req.headers.cookie || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) || null
const supabaseAuth = (path, options = {}) => fetch(`${process.env.SUPABASE_URL}/auth/v1${path}`, { ...options, headers: { apikey: process.env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json', ...(options.headers || {}) } })
const rest = (path, options = {}) => fetch(`${process.env.SUPABASE_URL}/rest/v1${path}`, { ...options, headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json', ...(options.headers || {}) } })
async function currentUser(req) { const token = cookie(req, 'shafx_session'); if (!token) return null; const response = await supabaseAuth('/user', { headers: { Authorization: `Bearer ${decodeURIComponent(token)}` } }); return response.ok ? response.json() : null }
export default async function handler(req, res) {
  const guard = await apiRequestGuard(req, 'api:bot-store', 60)
  if (!guard.allowed) return res.status(guard.status).json({ ok: false, error: guard.error, retryAfterSeconds: guard.retryAfterSeconds })
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'Method not allowed' })
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) return json(res, 503, { ok: false, error: 'SHAFX store is not configured.' })
  try {
    const user = await currentUser(req)
    if (!user) return json(res, 401, { ok: false, error: 'Not signed in' })
    const [catalogResponse, ownedResponse] = await Promise.all([
      rest('/shafx_bot_catalog?active=eq.true&select=slug,name,description,price_kes,grant_plan&order=price_kes.asc'),
      rest(`/shafx_user_bots?user_id=eq.${encodeURIComponent(user.id)}&active=eq.true&select=bot_slug,activated_at,expires_at`),
    ])
    if (!catalogResponse.ok || !ownedResponse.ok) throw new Error('SHAFX bot store database is not ready.')
    return json(res, 200, { ok: true, bots: await catalogResponse.json(), ownedBots: await ownedResponse.json() })
  } catch (error) { return json(res, 500, { ok: false, error: error instanceof Error ? error.message : 'Unable to load the bot store.' }) }
}