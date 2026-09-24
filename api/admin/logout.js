import { apiRequestGuard } from '../../server/authSecurity.js'
import { clearSessionCookie } from '../../server/adminAuth.js'

export default async function handler(req, res) {
  const guard = await apiRequestGuard(req, 'api:admin-logout', 60)
  if (!guard.allowed) return res.status(guard.status).json({ ok: false, error: guard.error, retryAfterSeconds: guard.retryAfterSeconds })
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })
  clearSessionCookie(res)
  return res.status(200).json({ ok: true })
}
