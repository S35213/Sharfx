const crypto = require('crypto')
const json = (res, status, body) => res.status(status).json(body)
const rest = (path, options = {}) => fetch(`${process.env.SUPABASE_URL}/rest/v1${path}`, { ...options, headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json', ...(options.headers || {}) } })
const timingSafeEqualHex = (received, expected) => { try { const a = Buffer.from(String(received || ''), 'hex'); const b = Buffer.from(String(expected || ''), 'hex'); return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b) } catch { return false } }
export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Method not allowed' })
  if (!process.env.PAYSTACK_SECRET_KEY || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return json(res, 503, { ok: false, error: 'Webhook is not configured.' })
  try {
    const raw = Buffer.isBuffer(req.rawBody) ? req.rawBody : Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}))
    const expected = crypto.createHmac('sha512', process.env.PAYSTACK_SECRET_KEY).update(raw).digest('hex')
    if (!timingSafeEqualHex(req.headers['x-paystack-signature'], expected)) return json(res, 401, { ok: false, error: 'Invalid webhook signature.' })
    const event = typeof req.body === 'object' && req.body ? req.body : JSON.parse(raw.toString('utf8'))
    if (event.event !== 'charge.success') return json(res, 200, { ok: true, ignored: true })
    const payment = event.data || {}
    const reference = String(payment.reference || '')
    if (!reference) return json(res, 400, { ok: false, error: 'Missing payment reference.' })
    const lookup = await rest(`/shafx_bot_purchases?reference=eq.${encodeURIComponent(reference)}&select=id,user_id,bot_slug,amount_kes,status`)
    if (!lookup.ok) throw new Error('Unable to read SHAFX purchase.')
    const purchase = (await lookup.json())[0]
    if (!purchase) return json(res, 404, { ok: false, error: 'Unknown SHAFX purchase reference.' })
    const expectedAmount = Number(purchase.amount_kes) * 100
    if (Number(payment.amount) !== expectedAmount || String(payment.currency || '').toUpperCase() !== 'KES') return json(res, 400, { ok: false, error: 'Payment amount or currency does not match the SHAFX purchase.' })
    const rpcResponse = await rest('/rpc/activate_shafx_bot_purchase', { method: 'POST', body: JSON.stringify({ p_reference: reference, p_provider_transaction_id: payment.id ? String(payment.id) : null, p_paid_at: payment.paid_at || null, p_payload: payment }) })
    if (!rpcResponse.ok) throw new Error('Unable to activate the SHAFX bot purchase.')
    const result = (await rpcResponse.json())[0]
    if (!result?.ok) return json(res, 409, { ok: false, error: 'Payment received but the SHAFX bot could not be activated.' })
    return json(res, 200, { ok: true, activated: true, botSlug: result.bot_slug })
  } catch (error) { return json(res, 500, { ok: false, error: error instanceof Error ? error.message : 'Webhook processing failed.' }) }
}