const crypto = require('crypto')
const json = (res, status, body) => res.status(status).json(body)
const cookie = (req, name) => (req.headers.cookie || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) || null
const supabaseAuth = (path, options = {}) => fetch(`${process.env.SUPABASE_URL}/auth/v1${path}`, { ...options, headers: { apikey: process.env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json', ...(options.headers || {}) } })
const rest = (path, options = {}) => fetch(`${process.env.SUPABASE_URL}/rest/v1${path}`, { ...options, headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json', ...(options.headers || {}) } })
async function currentUser(req) { const token = cookie(req, 'shafx_session'); if (!token) return null; const response = await supabaseAuth('/user', { headers: { Authorization: `Bearer ${decodeURIComponent(token)}` } }); return response.ok ? response.json() : null }
const normalizePhone = (value) => { const raw = String(value || '').replace(/[^\d+]/g, ''); if (/^\+2547\d{8}$/.test(raw)) return raw; if (/^2547\d{8}$/.test(raw)) return `+${raw}`; if (/^07\d{8}$/.test(raw)) return `+254${raw.slice(1)}`; return null }
const reference = () => `SHAFX-${Date.now()}-${crypto.randomBytes(5).toString('hex')}`
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Method not allowed' })
  if (process.env.SHAFX_PAYMENTS_ENABLED !== 'true') return json(res, 503, { ok: false, error: 'SHAFX payments are not enabled yet. Test mode must be configured first.' })
  if (!process.env.PAYSTACK_SECRET_KEY || !process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) return json(res, 503, { ok: false, error: 'SHAFX Paystack integration is not configured.' })
  try {
    const user = await currentUser(req); if (!user) return json(res, 401, { ok: false, error: 'Not signed in' })
    const body = typeof req.body === 'object' && req.body ? req.body : {}
    const botSlug = String(body.botSlug || '').trim()
    const phone = normalizePhone(body.phone)
    if (!botSlug) return json(res, 400, { ok: false, error: 'Select a bot.' })
    if (!phone) return json(res, 400, { ok: false, error: 'Enter a valid Kenyan M-PESA number, for example 0712345678.' })
    const catalogResponse = await rest(`/shafx_bot_catalog?slug=eq.${encodeURIComponent(botSlug)}&active=eq.true&select=slug,name,description,price_kes,grant_plan`)
    if (!catalogResponse.ok) throw new Error('Unable to load the selected bot.')
    const bot = (await catalogResponse.json())[0]
    if (!bot) return json(res, 404, { ok: false, error: 'That bot is not currently available.' })
    const email = String(user.email || '').trim().toLowerCase()
    if (!email) return json(res, 400, { ok: false, error: 'Your SHAFX account does not have an email address.' })
    const ref = reference()
    const purchaseResponse = await rest('/shafx_bot_purchases', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ user_id: user.id, bot_slug: bot.slug, provider: 'paystack', reference: ref, amount_kes: bot.price_kes, phone, email, status: 'pending' }) })
    if (!purchaseResponse.ok) throw new Error('Unable to create the SHAFX purchase record.')
    const amountSubunit = Math.round(Number(bot.price_kes) * 100)
    const paystackResponse = await fetch('https://api.paystack.co/charge', { method: 'POST', headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, amount: String(amountSubunit), currency: 'KES', reference: ref, mobile_money: { phone, provider: 'mpesa' }, metadata: { shafx_user_id: user.id, bot_slug: bot.slug, purchase_reference: ref, custom_fields: [{ display_name: 'SHAFX Bot', variable_name: 'shafx_bot', value: bot.name }, { display_name: 'SHAFX Purchase', variable_name: 'shafx_purchase', value: ref }] } }) })
    const data = await paystackResponse.json().catch(() => ({}))
    if (!paystackResponse.ok || !data.status) {
      await rest(`/shafx_bot_purchases?reference=eq.${encodeURIComponent(ref)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'failed', provider_payload: data }) }).catch(() => {})
      return json(res, 502, { ok: false, error: data.message || 'Paystack could not start the M-PESA payment.' })
    }
    return json(res, 200, { ok: true, reference: ref, status: data.data?.status || 'pay_offline', displayText: data.data?.display_text || 'Please complete authorization on your M-PESA phone.' })
  } catch (error) { return json(res, 500, { ok: false, error: error instanceof Error ? error.message : 'Unable to start the payment.' }) }
}