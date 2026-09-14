const json = (res, status, body) => res.status(status).json(body)
const cookie = (req, name) => (req.headers.cookie || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) || null
const supabaseAuth = (path, options = {}) => fetch(`${process.env.SUPABASE_URL}/auth/v1${path}`, { ...options, headers: { apikey: process.env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json', ...(options.headers || {}) } })
const rest = (path, options = {}) => fetch(`${process.env.SUPABASE_URL}/rest/v1${path}`, { ...options, headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json', ...(options.headers || {}) } })
async function currentUser(req) { const token = cookie(req, 'shafx_session'); if (!token) return null; const response = await supabaseAuth('/user', { headers: { Authorization: `Bearer ${decodeURIComponent(token)}` } }); return response.ok ? response.json() : null }
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'Method not allowed' })
  try {
    const user = await currentUser(req); if (!user) return json(res, 401, { ok: false, error: 'Not signed in' })
    const reference = String(req.query.reference || '').trim(); if (!reference) return json(res, 400, { ok: false, error: 'Missing purchase reference.' })
    const response = await rest(`/shafx_bot_purchases?user_id=eq.${encodeURIComponent(user.id)}&reference=eq.${encodeURIComponent(reference)}&select=reference,bot_slug,status,amount_kes,paid_at,activated_at`)
    if (!response.ok) throw new Error('Unable to read purchase status.')
    const purchase = (await response.json())[0]; if (!purchase) return json(res, 404, { ok: false, error: 'Purchase not found.' })
    return json(res, 200, { ok: true, purchase })
  } catch (error) { return json(res, 500, { ok: false, error: error instanceof Error ? error.message : 'Unable to read purchase status.' }) }
}