import { randomUUID } from 'node:crypto'
import {
  getProviderAccount,
  getProviderConnection,
  readProviderSecret,
} from '../providerConnections.js'

const DERIV_API = 'https://api.derivws.com/trading/v1/options'
const PUBLIC_WS = 'wss://api.derivws.com/trading/v1/options/ws/public'
const TIMEFRAMES = [
  ['M1', 60, 1],
  ['M5', 300, 1],
  ['M15', 900, 2],
  ['M30', 1800, 2],
  ['H1', 3600, 3],
  ['H4', 14400, 4],
  ['D1', 86400, 5],
  ['W1', 604800, 6],
]
const ROUND_MAX_MS = 15000
const PROFIT_TARGET = 0.2
const LOSS_LIMIT = -0.1
const MAX_CONCURRENT_RUNS = 50
const MARKET_CACHE_MS = 4000

const state = {
  timer: null,
  active: new Set(),
  workerId: 'render-' + randomUUID(),
  candles: new Map(),
  started: false,
}

const rest = (path, options = {}) => fetch(process.env.SUPABASE_URL + '/rest/v1' + path, {
  ...options,
  headers: {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY,
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  },
})

const rpc = async (name, body) => {
  const response = await rest('/rpc/' + name, {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return { response, data: await response.json().catch(() => null) }
}

const logEvent = async (runId, roundId, eventType, message, metadata = {}, severity = 'info') => {
  try {
    await rest('/shafx_bot_events', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ run_id: runId, round_id: roundId || null, event_type: eventType, severity, message, metadata }),
    })
  } catch {}
}

const updateRun = async (runId, patch) => {
  const response = await rest('/shafx_bot_runs?id=eq.' + encodeURIComponent(runId), {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ ...patch, last_heartbeat_at: new Date().toISOString(), locked_by: state.workerId, locked_until: new Date(Date.now() + 20000).toISOString() }),
  })
  if (!response.ok) throw new Error('Unable to update bot run state.')
}

const updateRound = async (roundId, patch) => {
  const response = await rest('/shafx_bot_rounds?id=eq.' + encodeURIComponent(roundId), {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(patch),
  })
  if (!response.ok) throw new Error('Unable to update bot round state.')
}

const createRound = async (runId, roundNumber) => {
  const response = await rest('/shafx_bot_rounds', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ run_id: runId, round_number: roundNumber, status: 'queued' }),
  })
  const rows = response.ok ? await response.json().catch(() => []) : []
  if (!response.ok || !rows[0]) throw new Error('Unable to create the bot round.')
  return rows[0]
}

const loadRounds = async (runId) => {
  const response = await rest('/shafx_bot_rounds?run_id=eq.' + encodeURIComponent(runId) + '&select=*&order=round_number.asc')
  return response.ok ? await response.json().catch(() => []) : []
}

const wsOpen = async (url, timeoutMs = 10000) => new Promise((resolve, reject) => {
  let socket
  try { socket = new WebSocket(url) } catch (error) { reject(error); return }
  const timer = setTimeout(() => {
    try { socket.close() } catch {}
    reject(new Error('WebSocket connection timed out.'))
  }, timeoutMs)
  socket.addEventListener('open', () => { clearTimeout(timer); resolve(socket) }, { once: true })
  socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('WebSocket connection failed.')) }, { once: true })
})

const sendAndWait = (socket, request, expectedReqId, timeoutMs = 10000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => {
    socket.removeEventListener('message', onMessage)
    reject(new Error('Deriv request timed out.'))
  }, timeoutMs)
  const onMessage = (event) => {
    try {
      const payload = JSON.parse(String(event.data))
      if (Number(payload?.req_id ?? payload?.echo_req?.req_id) !== expectedReqId) return
      clearTimeout(timer)
      socket.removeEventListener('message', onMessage)
      if (payload?.error?.message) reject(new Error(payload.error.message))
      else resolve(payload)
    } catch (error) {
      clearTimeout(timer)
      socket.removeEventListener('message', onMessage)
      reject(error)
    }
  }
  socket.addEventListener('message', onMessage)
  socket.send(JSON.stringify(request))
})

const requestTradingWsUrl = async (token, accountId) => {
  const response = await fetch(DERIV_API + '/accounts/' + encodeURIComponent(accountId) + '/otp', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token },
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || typeof data?.data?.url !== 'string') {
    throw new Error(typeof data?.message === 'string' ? data.message : 'Unable to obtain Deriv trading WebSocket.')
  }
  return data.data.url
}

const toDerivSymbol = (symbol) => {
  const normalized = String(symbol || '').replace('/', '').toUpperCase()
  return normalized.length === 6 ? 'frx' + normalized : normalized
}

const fetchCandles = async (symbol, timeframe, granularity) => {
  const key = symbol + ':' + timeframe
  const cached = state.candles.get(key)
  if (cached && Date.now() - cached.at < MARKET_CACHE_MS) return cached.candles

  const socket = await wsOpen(PUBLIC_WS, 6000)
  try {
    const payload = await sendAndWait(socket, {
      ticks_history: toDerivSymbol(symbol),
      end: 'latest',
      count: timeframe === 'W1' ? 120 : 120,
      style: 'candles',
      granularity,
      adjust_start_time: 1,
      req_id: 1,
    }, 1, 8000)
    const candles = (payload.candles || []).map((row) => ({
      time: Number(row.epoch) * 1000,
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
    })).filter((row) => [row.time, row.open, row.high, row.low, row.close].every(Number.isFinite))
    state.candles.set(key, { at: Date.now(), candles })
    return candles
  } finally {
    try { socket.close() } catch {}
  }
}

const scanMarket = async (symbol) => {
  const rows = await Promise.all(TIMEFRAMES.map(async ([timeframe, granularity, weight]) => {
    try {
      const candles = await fetchCandles(symbol, timeframe, granularity)
      if (candles.length < 12) return null
      const recent = candles.slice(-12)
      const closes = recent.map((row) => row.close)
      const average = closes.reduce((sum, value) => sum + value, 0) / closes.length
      const last = closes[closes.length - 1]
      const previous = closes[closes.length - 4]
      const slope = last - previous
      const trend = last > average ? 1 : last < average ? -1 : 0
      const momentum = slope > 0 ? 1 : slope < 0 ? -1 : 0
      const score = trend + momentum
      return { timeframe, weight, last, score, candles }
    } catch {
      return null
    }
  }))

  const valid = rows.filter(Boolean)
  const directional = valid.filter((row) => row.score !== 0)
  if (directional.length < 3) return { direction: 'WAIT', strength: 0, timeframe: null, snapshot: valid.map(({ timeframe, last, score }) => ({ timeframe, last, score })) }

  const bullish = directional.filter((row) => row.score > 0).reduce((sum, row) => sum + row.weight * Math.abs(row.score), 0)
  const bearish = directional.filter((row) => row.score < 0).reduce((sum, row) => sum + row.weight * Math.abs(row.score), 0)
  const total = bullish + bearish
  const difference = bullish - bearish
  const direction = difference > 0 ? 'BUY' : difference < 0 ? 'SELL' : 'WAIT'
  const strength = Math.round(55 + Math.min(45, Math.abs(difference) / Math.max(1, total) * 45))
  const best = directional.slice().sort((a, b) => Math.abs(b.score) * b.weight - Math.abs(a.score) * a.weight)[0]

  return {
    direction,
    strength,
    timeframe: best?.timeframe ?? null,
    snapshot: valid.map(({ timeframe, last, score, weight }) => ({ timeframe, last, score, weight })),
  }
}

const acceptedMultipliers = (message) => {
  const match = String(message || '').match(/accepts?\s+([0-9,\s]+)/i)
  if (!match) return []
  return [...match[1].matchAll(/\d+(?:\.\d+)?/g)].map((item) => Number(item[0])).filter((value) => Number.isFinite(value) && value > 0)
}

const requestProposal = async (socket, symbol, direction, stake, multiplier, currency, reqId) => {
  const base = {
    proposal: 1,
    amount: stake,
    basis: 'stake',
    contract_type: direction === 'BUY' ? 'MULTUP' : 'MULTDOWN',
    currency,
    multiplier,
    underlying_symbol: toDerivSymbol(symbol),
    duration_unit: 's',
    subscribe: 1,
    req_id: reqId,
  }
  return sendAndWait(socket, base, reqId)
}

const openMultiplier = async ({ token, accountId, symbol, direction, stake, requestedMultiplier, currency }) => {
  const wsUrl = await requestTradingWsUrl(token, accountId)
  const socket = await wsOpen(wsUrl)
  try {
    const balanceResponse = await sendAndWait(socket, { balance: 1, req_id: 1 }, 1)
    const balance = Number(balanceResponse?.balance?.balance)
    if (Number.isFinite(balance) && balance < stake) throw new Error('Insufficient Deriv balance for the selected stake.')

    const accepted = []
    const candidates = requestedMultiplier ? [requestedMultiplier, 10, 5, 2, 1] : [10, 5, 2, 1]
    let proposal = null
    let error = null

    for (const candidate of [...new Set(candidates.filter((value) => Number.isFinite(value) && value > 0))]) {
      try {
        proposal = await requestProposal(socket, symbol, direction, stake, candidate, currency, 10 + accepted.length)
        break
      } catch (err) {
        error = err
        const found = acceptedMultipliers(err instanceof Error ? err.message : String(err))
        accepted.push(...found)
        if (found.length) break
      }
    }

    if (!proposal) {
      if (accepted.length) {
        for (const candidate of [...new Set(accepted)].sort((a, b) => Math.abs(a - 10) - Math.abs(b - 10))) {
          try {
            proposal = await requestProposal(socket, symbol, direction, stake, candidate, currency, 30 + accepted.length)
            break
          } catch (err) { error = err }
        }
      }
    }

    if (!proposal) throw error || new Error('Deriv did not return a proposal.')
    const id = String(proposal?.proposal?.id || '')
    const ask = Number(proposal?.proposal?.ask_price ?? proposal?.proposal?.display_value)
    if (!id || !Number.isFinite(ask) || ask <= 0) throw new Error('Deriv returned an incomplete proposal.')

    const buy = await sendAndWait(socket, { buy: id, price: ask, req_id: 99 }, 99)
    const contractId = String(buy?.buy?.contract_id || '')
    const entryPrice = Number(buy?.buy?.start_spot ?? buy?.buy?.start_spot_display_value ?? proposal?.proposal?.spot ?? 0)
    if (!contractId) throw new Error('Deriv did not return a contract ID.')

    return { contractId, entryPrice, multiplier: Number(buy?.buy?.multiplier ?? proposal?.proposal?.multiplier ?? requestedMultiplier ?? 10) }
  } finally {
    try { socket.close() } catch {}
  }
}

const closeContractAt = async ({ token, accountId, contractId }) => {
  const wsUrl = await requestTradingWsUrl(token, accountId)
  const socket = await wsOpen(wsUrl)
  try {
    const response = await sendAndWait(socket, { sell: Number(contractId), price: 0, req_id: 1 }, 1)
    const soldFor = Number(response?.sell?.sold_for ?? response?.sell?.sell_price ?? 0)
    const buyPrice = Number(response?.sell?.buy_price ?? 0)
    const profit = Number.isFinite(soldFor) && Number.isFinite(buyPrice) ? Number((soldFor - buyPrice).toFixed(2)) : 0
    return { profit, soldFor, buyPrice, exitPrice: soldFor }
  } finally {
    try { socket.close() } catch {}
  }
}

const monitorContract = async ({ token, accountId, contractId, stake, startedAt }) => {
  const wsUrl = await requestTradingWsUrl(token, accountId)
  const socket = await wsOpen(wsUrl)
  let latest = { profit: 0, currentSpot: undefined, status: 'open' }
  let done = false
  const deadline = Date.now() + ROUND_MAX_MS

  const closeWithSell = async () => {
    if (done) return
    done = true
    try { socket.close() } catch {}
    return closeContractAt({ token, accountId, contractId })
  }

  try {
    const requestId = 7
    socket.send(JSON.stringify({ proposal_open_contract: 1, contract_id: Number(contractId), subscribe: 1, req_id: requestId }))
    await new Promise((resolve) => {
      const timer = setInterval(() => {
        if (done || Date.now() >= deadline) {
          clearInterval(timer)
          resolve()
        }
      }, 250)
      socket.addEventListener('message', (event) => {
        try {
          const payload = JSON.parse(String(event.data))
          if (Number(payload?.echo_req?.req_id ?? payload?.req_id) !== requestId) return
          const contract = payload?.proposal_open_contract
          if (!contract) return
          latest = {
            profit: Number(contract.profit ?? 0),
            currentSpot: Number(contract.current_spot ?? contract.exit_spot ?? NaN),
            status: String(contract.status || 'open'),
          }
          if (latest.profit >= stake * PROFIT_TARGET || latest.profit <= stake * LOSS_LIMIT || contract.is_sold) {
            clearInterval(timer)
            resolve()
          }
        } catch {}
      })
    })
    const result = await closeWithSell()
    return { ...result, latest }
  } finally {
    clearInterval
  }
}

const processRun = async (run) => {
  const connection = await getProviderConnection(run.user_id, run.connection_id, true)
  if (!connection || connection.state !== 'connected' || connection.provider_id !== 'deriv') throw new Error('Deriv connection is not available.')
  const account = await getProviderAccount(run.user_id, run.connection_id, run.account_row_id).catch(() => null)
  if (!account || !account.active || account.environment !== 'demo') throw new Error('Autopilot requires an active Deriv demo account.')
  const token = await readProviderSecret(connection.credential_ref)
  const rounds = await loadRounds(run.id)

  if (run.cancel_requested || run.status === 'cancel_requested') {
    const open = rounds.find((round) => round.status === 'open')
    if (open?.contract_id) {
      await closeContractAt({ token, accountId: account.provider_account_id, contractId: open.contract_id }).catch(() => undefined)
      await updateRound(open.id, { status: 'stopped', closed_at: new Date().toISOString() }).catch(() => undefined)
    }
    await updateRun(run.id, { status: 'stopped', completed_at: new Date().toISOString(), cancel_requested: true })
    await logEvent(run.id, null, 'unit_stopped', 'SHAFX Autopilot unit stopped by user.')
    return
  }

  let round = rounds.find((item) => item.round_number === Math.max(1, run.current_round)) || rounds.find((item) => ['queued','scanning','waiting','buying','open','closing'].includes(item.status))
  if (!round) round = await createRound(run.id, Math.min(5, run.current_round + 1))
  if (round.status === 'open' && round.contract_id) {
    const result = await monitorContract({ token, accountId: account.provider_account_id, contractId: round.contract_id, stake: run.stake, startedAt: round.opened_at })
    const profit = Number(result?.profit ?? result?.latest?.profit ?? 0)
    const win = profit >= 0
    await updateRound(round.id, { status: win ? 'won' : 'loss', profit, exit_price: result.exitPrice ?? result.latest?.currentSpot ?? null, closed_at: new Date().toISOString(), max_profit: Math.max(Number(round.max_profit || 0), Number(result.latest?.profit || 0)), max_loss: Math.min(Number(round.max_loss || 0), Number(result.latest?.profit || 0)) })
    const nextCompleted = Number(run.completed_rounds || 0) + 1
    const nextNet = Number(run.net_profit || 0) + profit
    await updateRun(run.id, {
      completed_rounds: nextCompleted,
      current_round: nextCompleted,
      total_profit: Number(run.total_profit || 0) + (profit > 0 ? profit : 0),
      total_loss: Number(run.total_loss || 0) + (profit < 0 ? Math.abs(profit) : 0),
      net_profit: nextNet,
      status: nextCompleted >= 5 ? 'completed' : 'scanning',
      next_action_at: new Date(Date.now() + (nextCompleted >= 5 ? 0 : 1200)).toISOString(),
      completed_at: nextCompleted >= 5 ? new Date().toISOString() : null,
      last_error: null,
    })
    await logEvent(run.id, round.id, win ? 'round_won' : 'round_loss', 'Round ' + round.round_number + ' completed.', { profit })
    return
  }

  await updateRun(run.id, { status: 'scanning', next_action_at: new Date().toISOString() })
  const signal = await scanMarket(run.symbol)
  if (signal.direction === 'WAIT' || signal.strength < 62) {
    await updateRound(round.id, { status: 'waiting', signal_direction: 'WAIT', signal_strength: signal.strength, signal_snapshot: signal.snapshot, next_check_at: new Date(Date.now() + 2500).toISOString() })
    await updateRun(run.id, { status: 'waiting', next_action_at: new Date(Date.now() + 2500).toISOString() })
    return
  }

  await updateRound(round.id, {
    status: 'buying',
    signal_direction: signal.direction,
    signal_strength: signal.strength,
    signal_timeframe: signal.timeframe,
    signal_snapshot: signal.snapshot,
    stake: run.stake,
    next_check_at: null,
  })
  await updateRun(run.id, { status: 'buying' })
  try {
    const opened = await openMultiplier({
      token,
      accountId: account.provider_account_id,
      symbol: run.symbol,
      direction: signal.direction,
      stake: Number(run.stake),
      requestedMultiplier: run.multiplier_mode === 'manual' ? Number(run.multiplier) : null,
      currency: account.currency,
    })
    await updateRound(round.id, { status: 'open', contract_id: opened.contractId, proposal_id: null, multiplier: opened.multiplier, entry_price: opened.entryPrice, opened_at: new Date().toISOString(), next_check_at: new Date().toISOString(), error_message: null })
    await updateRun(run.id, { status: 'open', started_at: run.started_at || new Date().toISOString(), current_round: round.round_number, next_action_at: new Date().toISOString(), last_error: null })
    await logEvent(run.id, round.id, 'round_opened', 'Deriv contract opened by SHAFX Autopilot.', { contractId: opened.contractId, multiplier: opened.multiplier, signal: signal.direction, strength: signal.strength })
  } catch (error) {
    await updateRound(round.id, { status: 'failed', error_message: error instanceof Error ? error.message : String(error), closed_at: new Date().toISOString() })
    await updateRun(run.id, { status: 'failed', last_error: error instanceof Error ? error.message : String(error), completed_at: new Date().toISOString() })
    await logEvent(run.id, round.id, 'round_failed', error instanceof Error ? error.message : String(error), {}, 'error')
  }
}

const claim = async () => {
  const { response, data } = await rpc('claim_shafx_bot_run', { p_worker: state.workerId })
  if (!response.ok || !Array.isArray(data) || !data[0]) return null
  return data[0]
}

const tick = async () => {
  if (!state.started || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return
  while (state.active.size < MAX_CONCURRENT_RUNS) {
    const run = await claim()
    if (!run) break
    if (state.active.has(run.id)) continue
    state.active.add(run.id)
    void processRun(run)
      .catch(async (error) => {
        try {
          await updateRun(run.id, { status: 'failed', last_error: error instanceof Error ? error.message : String(error), completed_at: new Date().toISOString() })
          await logEvent(run.id, null, 'worker_failure', error instanceof Error ? error.message : String(error), {}, 'error')
        } catch {}
      })
      .finally(() => state.active.delete(run.id))
  }
}

export const startBotWorker = () => {
  if (state.started) return
  state.started = true
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log('SHAFX_BOT_WORKER_DISABLED: missing Supabase server credentials')
    return
  }
  console.log('SHAFX_BOT_WORKER_STARTED: concurrency ' + MAX_CONCURRENT_RUNS)
  state.timer = setInterval(() => { void tick() }, 750)
  void tick()
}

export const stopBotWorker = () => {
  if (state.timer) clearInterval(state.timer)
  state.timer = null
  state.started = false
}
