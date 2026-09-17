import { clearSessionCookie } from '../../server/adminAuth.js'

export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })
  clearSessionCookie(res)
  return res.status(200).json({ ok: true })
}
