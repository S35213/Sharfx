import { apiRequestGuard } from '../../server/authSecurity.js'
import { isAdminConfigured, isValidSession } from '../../server/adminAuth.js'

const rest = async (path) => fetch(process.env.SUPABASE_URL + '/rest/v1' + path, {
  headers: {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY,
    Accept: 'application/json',
  },
})

const json = async (response, fallback) => {
  try { return await response.json() } catch { return fallback }
}

const connectionHealth = (row, now = Date.now()) => {
  if (row.state === 'disconnected') return 'offline'
  if (row.expires_at && Number.isFinite(Date.parse(row.expires_at)) && Date.parse(row.expires_at) <= now) return 'expired'
  if (row.state === 'error') return 'degraded'
  if (row.last_seen_at && Number.isFinite(Date.parse(row.last_seen_at)) && now - Date.parse(row.last_seen_at) > 300000) return 'degraded'
  return 'healthy'
}

export default async function handler(req, res) {
  const guard = await apiRequestGuard(req, 'api:admin-overview', 60)
  if (!guard.allowed) return res.status(guard.status).json({ ok: false, error: guard.error, retryAfterSeconds: guard.retryAfterSeconds })
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' })
  if (!isAdminConfigured() || !isValidSession(req)) return res.status(401).json({ ok: false, error: 'Owner authentication required' })

  const derivOAuth = Boolean(process.env.DERIV_APP_ID && process.env.DERIV_APP_SECRET)
  const shafxDatabase = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
  const now = Date.now()
  let connections = []
  let accounts = []
  let auditEvents = []
  let databaseError = null

  if (shafxDatabase) {
    const [connectionResponse, accountResponse, auditResponse] = await Promise.all([
      rest('/shafx_provider_connections?select=id,provider_id,label,environment,state,expires_at,last_seen_at,created_at,updated_at&order=created_at.desc'),
      rest('/shafx_provider_accounts?select=id,connection_id,provider_id,provider_account_id,label,environment,active,last_synced_at&order=created_at.desc'),
      rest('/shafx_provider_audit_events?select=id,connection_id,event_type,severity,created_at&order=created_at.desc&limit=12'),
    ])
    if (!connectionResponse.ok || !accountResponse.ok || !auditResponse.ok) {
      databaseError = 'Provider operations data could not be read from Supabase.'
    } else {
      connections = await json(connectionResponse, [])
      accounts = await json(accountResponse, [])
      auditEvents = await json(auditResponse, [])
    }
  }

  const normalized = Array.isArray(connections) ? connections.map((row) => ({
    id: row.id,
    providerId: row.provider_id,
    label: row.label,
    environment: row.environment,
    state: row.state,
    health: connectionHealth(row, now),
    expiresAt: row.expires_at,
    lastSeenAt: row.last_seen_at,
  })) : []

  const healthCounts = normalized.reduce((acc, row) => {
    acc[row.health] = (acc[row.health] || 0) + 1
    return acc
  }, { healthy: 0, degraded: 0, expired: 0, offline: 0 })

  const providerCounts = normalized.reduce((acc, row) => {
    acc[row.providerId] = (acc[row.providerId] || 0) + 1
    return acc
  }, {})

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
    providerOperations: {
      connectionCount: normalized.length,
      activeAccountCount: Array.isArray(accounts) ? accounts.filter((row) => row.active).length : 0,
      health: healthCounts,
      byProvider: providerCounts,
      connections: normalized.slice(0, 20),
      auditEvents: Array.isArray(auditEvents) ? auditEvents.slice(0, 12) : [],
      databaseError,
    },
    integrations: [
      { name: 'Simulator', status: 'online', detail: 'Simulation-only execution boundary.' },
      { name: 'Deriv', status: derivOAuth ? 'configured' : 'not-configured', detail: derivOAuth ? 'OAuth environment is configured.' : 'OAuth credentials are not detected in this deployment.' },
      { name: 'OANDA', status: 'configured', detail: 'Server-side PAT connection pack is available; external execution remains disabled.' },
      { name: 'Binance', status: 'configured', detail: 'Read-only Spot account and market-data pack is available; external execution remains disabled.' },
      { name: 'cTrader', status: 'planned', detail: 'OAuth/session adapter remains provider-specific and is not yet promoted.' },
      { name: 'Interactive Brokers', status: 'planned', detail: 'Gateway/session adapter remains provider-specific and is not yet promoted.' },
    ],
  })
}