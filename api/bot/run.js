import { apiRequestGuard } from '../../server/authSecurity.js'
import { getProviderAccount, getProviderConnection, getShafxUser } from '../../server/providerConnections.js'

const json = (res, status, body) => res.status(status).json(body)
const cookie = (req, name) => (req.headers.cookie || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(name + '='))?.slice(name.length + 1) || null

const rest = (path, options = {}) => fetch(process.env.SUPABASE_URL + '/rest/v1' + path, {
  ...options,
  headers: {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY,
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  },
})

const getPlan = async (userId) => {
  const response = await rest('/shafx_bot_entitlements?user_id=eq.' + encodeURIComponent(userId) + '&select=plan,subscription_status,subscription_ends_at')
  const rows = response.ok ? await response.json().catch(() => []) : []
  const row = rows[0] || {}
  const requested = row.plan === 'PRO' || row.plan === 'REGULAR' ? row.plan : 'FREE'
  if (requested === 'FREE') return 'FREE'
  const status = String(row.subscription_status || '').toLowerCase()
  const ends = row.subscription_ends_at ? new Date(row.subscription_ends_at).getTime() : null
  return (status === 'active' || status === 'trialing') && (ends === null || (Number.isFinite(ends) && ends > Date.now())) ? requested : 'FREE'
}

const mapRound = (row) => ({
  id: row.id,
  round_number: Number(row.round_number),
  status: row.status,
  signal_direction: row.signal_direction,
  signal_strength: row.signal_strength == null ? null : Number(row.signal_strength),
  signal_timeframe: row.signal_timeframe,
  profit: row.profit == null ? null : Number(row.profit),
  contractId: row.contract_id,
})

const mapRun = (row, rounds = []) => ({
  id: row.id,
  userId: row.user_id,
  connectionId: row.connection_id,
  accountRowId: row.account_row_id,
  symbol: row.symbol,
  stake: Number(row.stake),
  multiplierMode: row.multiplier_mode,
  multiplier: row.multiplier == null ? null : Number(row.multiplier),
  plan: row.plan,
  unitNumber: Number(row.unit_number),
  currentRound: Number(row.current_round),
  completedRounds: Number(row.completed_rounds),
  status: row.status,
  totalProfit: Number(row.total_profit || 0),
  totalLoss: Number(row.total_loss || 0),
  netProfit: Number(row.net_profit || 0),
  cancelRequested: Boolean(row.cancel_requested),
  createdAt: row.created_at,
  startedAt: row.started_at,
  completedAt: row.completed_at,
  rounds: rounds.map(mapRound),
})

const getUserOrFail = async (req, res) => {
  const user = await getShafxUser(req, res)
  if (!user) {
    json(res, 401, { ok: false, error: 'Sign in to SHAFX before using Autopilot.' })
    return null
  }
  return user
}

const readRun = async (userId, runId) => {
  const response = await rest('/shafx_bot_runs?id=eq.' + encodeURIComponent(runId) + '&user_id=eq.' + encodeURIComponent(userId) + '&select=*')
  const rows = response.ok ? await response.json().catch(() => []) : []
  const row = rows[0]
  if (!row) return null
  const roundsResponse = await rest('/shafx_bot_rounds?run_id=eq.' + encodeURIComponent(runId) + '&select=id,round_number,status,signal_direction,signal_strength,signal_timeframe,profit,contract_id&order=round_number.asc')
  const rounds = roundsResponse.ok ? await roundsResponse.json().catch(() => []) : []
  return mapRun(row, rounds)
}

export default async function handler(req, res) {
  const guard = await apiRequestGuard(req, 'api:bot-run', 60)
  if (!guard.allowed) return json(res, guard.status, { ok: false, error: guard.error, retryAfterSeconds: guard.retryAfterSeconds })
  res.setHeader('Cache-Control', 'no-store')

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return json(res, 503, { ok: false, error: 'Bot execution service is not configured.' })
  }

  try {
    const user = await getUserOrFail(req, res)
    if (!user) return

    if (req.method === 'GET') {
      const requestedRunId = typeof req.query?.runId === 'string' ? req.query.runId : ''
      if (requestedRunId) {
        const run = await readRun(user.id, requestedRunId)
        return run ? json(res, 200, { ok: true, run }) : json(res, 404, { ok: false, error: 'Bot run not found.' })
      }

      const symbol = typeof req.query?.symbol === 'string' ? req.query.symbol.trim().toUpperCase() : ''
      const activeFilter = "user_id=eq." + encodeURIComponent(user.id) + "&status=in.(queued,scanning,waiting,buying,open,closing,cancel_requested)&select=*&order=created_at.desc&limit=1"
      const response = await rest('/shafx_bot_runs?' + activeFilter + (symbol ? '&symbol=eq.' + encodeURIComponent(symbol) : ''))
      const rows = response.ok ? await response.json().catch(() => []) : []
      if (!rows[0]) return json(res, 200, { ok: true, run: null })
      const run = await readRun(user.id, rows[0].id)
      return json(res, 200, { ok: true, run })
    }

    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Method not allowed' })
    const body = typeof req.body === 'object' && req.body ? req.body : {}
    const action = String(body.action || '')

    if (action === 'stop') {
      const runId = String(body.runId || '')
      if (!runId) return json(res, 400, { ok: false, error: 'Bot run ID is required.' })
      const existing = await readRun(user.id, runId)
      if (!existing) return json(res, 404, { ok: false, error: 'Bot run not found.' })
      const response = await rest('/shafx_bot_runs?id=eq.' + encodeURIComponent(runId) + '&user_id=eq.' + encodeURIComponent(user.id), {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ cancel_requested: true, status: 'cancel_requested', next_action_at: new Date().toISOString() }),
      })
      if (!response.ok) return json(res, 503, { ok: false, error: 'Unable to stop the bot run.' })
      const rows = await response.json().catch(() => [])
      const run = await readRun(user.id, rows[0]?.id || runId)
      return json(res, 200, { ok: true, run })
    }

    if (action !== 'start') return json(res, 400, { ok: false, error: 'Unknown bot run action.' })

    const connectionId = String(body.connectionId || '')
    const accountId = String(body.accountId || '')
    const symbol = String(body.symbol || '').trim().toUpperCase()
    const stake = Number(body.stake)
    const multiplierMode = body.multiplierMode === 'manual' ? 'manual' : 'auto'
    const multiplier = multiplierMode === 'manual' ? Number(body.multiplier) : null

    if (!connectionId || !accountId) return json(res, 400, { ok: false, error: 'Connect a Deriv account before starting Autopilot.' })
    if (!symbol) return json(res, 400, { ok: false, error: 'Select a market before starting Autopilot.' })
    if (!Number.isFinite(stake) || stake < 10 || stake > 2000) return json(res, 400, { ok: false, error: 'Stake must be between 10 and 2,000 ' + 'account-currency units.' })
    if (multiplierMode === 'manual' && (!Number.isFinite(multiplier) || multiplier <= 0 || multiplier > 10000)) return json(res, 400, { ok: false, error: 'Enter a valid manual multiplier.' })

    const connection = await getProviderConnection(user.id, connectionId, true)
    if (!connection || connection.provider_id !== 'deriv' || connection.state !== 'connected') return json(res, 400, { ok: false, error: 'The selected Deriv connection is not ready.' })
    const account = await getProviderAccount(user.id, connection.id, accountId)
    if (!account || !account.active || account.provider_id !== 'deriv') return json(res, 400, { ok: false, error: 'The selected Deriv account is not available.' })
    if (account.environment !== 'demo') return json(res, 400, { ok: false, error: 'Autopilot is demo-only during SHAFX testing.' })

    const plan = await getPlan(user.id)
    const activeResponse = await rest('/shafx_bot_runs?user_id=eq.' + encodeURIComponent(user.id) + '&account_row_id=eq.' + encodeURIComponent(account.id) + '&status=in.(queued,scanning,waiting,buying,open,closing,cancel_requested)&select=id&limit=1')
    const activeRows = activeResponse.ok ? await activeResponse.json().catch(() => []) : []
    if (activeRows[0]) {
      const run = await readRun(user.id, activeRows[0].id)
      return json(res, 409, { ok: false, error: 'This Deriv demo account already has an Autopilot Unit running.', run })
    }

    const insert = await rest('/shafx_bot_runs', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        user_id: user.id,
        connection_id: connection.id,
        account_row_id: account.id,
        symbol,
        stake,
        multiplier_mode: multiplierMode,
        multiplier,
        plan,
        unit_number: 1,
        current_round: 0,
        completed_rounds: 0,
        status: 'queued',
        next_action_at: new Date().toISOString(),
        metadata: { source: 'shafx_bot_room', createdBy: user.id },
      }),
    })
    if (!insert.ok) {
      const data = await insert.json().catch(() => ({}))
      return json(res, 409, { ok: false, error: data?.message || 'Unable to start the Autopilot Unit.' })
    }
    const rows = await insert.json().catch(() => [])
    const run = await readRun(user.id, rows[0]?.id)
    return json(res, 200, { ok: true, run })
  } catch (error) {
    return json(res, 500, { ok: false, error: error instanceof Error ? error.message : 'Bot run service failed.' })
  }
}
