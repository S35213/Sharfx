const WS_URL = 'wss://api.derivws.com/trading/v1/options/ws/public'
const SYMBOL = 'frxEURUSD'

const waitForMessage = (socket, predicate, label, timeoutMs = 10000) => new Promise((resolve, reject) => {
  let timer = setTimeout(() => {
    socket.removeEventListener('message', onMessage)
    reject(new Error(label + ' timed out'))
  }, timeoutMs)

  const onMessage = (event) => {
    try {
      const payload = JSON.parse(String(event.data))
      if (!predicate(payload)) return
      clearTimeout(timer)
      socket.removeEventListener('message', onMessage)
      if (payload.error?.message) reject(new Error(label + ': ' + payload.error.message))
      else resolve(payload)
    } catch {
      // Ignore unrelated malformed frames.
    }
  }

  socket.addEventListener('message', onMessage)
})

const openSocket = async () => {
  const socket = new WebSocket(WS_URL)
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      try { socket.close() } catch {}
      reject(new Error('Deriv public WebSocket open timed out'))
    }, 10000)
    socket.addEventListener('open', () => {
      clearTimeout(timer)
      resolve()
    }, { once: true })
    socket.addEventListener('error', () => {
      clearTimeout(timer)
      reject(new Error('Deriv public WebSocket failed to open'))
    }, { once: true })
  })
  return socket
}

const candlesRequest = (reqId, granularity, count) => ({
  ticks_history: SYMBOL,
  end: 'latest',
  count,
  style: 'candles',
  granularity,
  adjust_start_time: 1,
  req_id: reqId,
})

const socket = await openSocket()

try {
  socket.send(JSON.stringify({ active_symbols: 'brief', req_id: 100 }))
  const symbols = await waitForMessage(socket, (payload) => payload.req_id === 100 && (payload.msg_type === 'active_symbols' || payload.error), 'active_symbols')
  if (!Array.isArray(symbols.active_symbols) || !symbols.active_symbols.some((row) => String(row.symbol || row.underlying_symbol || '').toLowerCase() === SYMBOL.toLowerCase())) {
    throw new Error('EUR/USD is not present in Deriv active symbols')
  }

  for (const [reqId, granularity, label] of [
    [101, 60, 'M1'],
    [102, 3600, 'H1'],
    [103, 86400, 'D1'],
  ]) {
    socket.send(JSON.stringify(candlesRequest(reqId, granularity, 120)))
    const response = await waitForMessage(
      socket,
      (payload) => Number(payload.req_id) === reqId && (payload.msg_type === 'candles' || payload.error),
      label + ' candles',
    )
    const candles = Array.isArray(response.candles) ? response.candles : []
    if (!candles.length) throw new Error(label + ' returned no candles')
    const last = candles[candles.length - 1]
    const values = [last.epoch, last.open, last.high, last.low, last.close].map(Number)
    if (values.some((value) => !Number.isFinite(value))) throw new Error(label + ' returned invalid OHLC data')
  }

  console.log('DERIV_PUBLIC_SMOKE_PASS: active EUR/USD + M1/H1/D1 candles verified')
} finally {
  try { socket.close() } catch {}
}
