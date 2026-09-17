import { isAdminConfigured, isValidSession } from '../../server/adminAuth.js'

export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' })
  if (!isAdminConfigured() || !isValidSession(req)) return res.status(401).json({ ok: false, error: 'Owner authentication required' })

  const derivOAuth = Boolean(process.env.DERIV_APP_ID && process.env.DERIV_APP_SECRET)
  const shafxDatabase = Boolean(process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY))

  return res.status(200).json({
    ok: true,
    platform: 'SHAFX',
    environment: process.env.VERCEL_ENV || 'development',
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID || null,
    commit: process.env.VERCEL_GIT_COMMIT_SHA ? process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 12) : null,
    services: {
      adminAuth: 'online',
      derivOAuth,
      derivMarketData: true,
      shafxDatabase,
    },
    integrations: [
      { name: 'Deriv', status: derivOAuth ? 'configured' : 'not-configured', detail: derivOAuth ? 'OAuth environment is configured.' : 'OAuth credentials are not detected in this deployment.' },
      { name: 'cTrader', status: 'planned', detail: 'Adapter architecture can be added after the SHAFX identity layer.' },
      { name: 'HFM', status: 'requires-approval', detail: 'Requires an approved third-party API/trading integration or broker-provided connection path.' },
    ],
  })
}
