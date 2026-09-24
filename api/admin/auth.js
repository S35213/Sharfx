import { apiRequestGuard } from '../../server/authSecurity.js'
import { createSession, isAdminConfigured, keyMatches, setSessionCookie } from '../../server/adminAuth.js'

export default async function handler(req, res) {
  const guard = await apiRequestGuard(req, 'api:admin-auth', 20)
  if (!guard.allowed) return res.status(guard.status).json({ ok: false, error: guard.error, retryAfterSeconds: guard.retryAfterSeconds })
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })
  if (!isAdminConfigured()) return res.status(503).json({ ok: false, error: 'Owner console is not configured yet' })

  let body = req.body
  if (typeof body === 'string') {
    try { body = JSON.parse(body) } catch { body = null }
  }

  if (!keyMatches(body?.key)) {
    return res.status(401).json({ ok: false, error: 'Invalid owner access key' })
  }

  setSessionCookie(res, createSession())
  return res.status(200).json({ ok: true })
}
