import { isAdminConfigured, isValidSession } from '../../server/adminAuth.js'

export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' })
  if (!isAdminConfigured() || !isValidSession(req)) return res.status(401).json({ ok: false, error: 'Owner authentication required' })