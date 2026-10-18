import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, CircleStop, Play, ShieldCheck } from 'lucide-react'
import type { SymbolSpec, Timeframe, TradeOrder } from '../../types'
import type { SetupCandidate } from '../../engine/setup/types'
import { evaluateTradeBotDecision } from '../../engine/bot/tradeBotDecision'
import { tradeBotMarketSourceKey, useTradeBotMarketData, type TradeBotMarketSource } from '../../engine/bot/useTradeBotMarketData'
import { appendTradeBotDecisionTrace, createTradeBotDecisionTraceEntry, type TradeBotDecisionTraceEntry } from '../../engine/bot/tradeBotDecisionTrace'
import { buildTradeBotDiagnosticSnapshot } from '../../engine/bot/tradeBotDiagnostics'
import { advanceTradeBotShadowRecords, appendTradeBotShadowRecord, createTradeBotShadowRecord, type TradeBotShadowRecord } from '../../engine/bot/tradeBotShadowEvaluation'
import { runTradeBotHistoricalReplay, type TradeBotHistoricalReplayResult } from '../../engine/bot/tradeBotHistoricalReplay'
import { executeTradeBotDemoOrder } from '../../engine/bot/tradeBotExecution'
import { formatCurrency, formatPrice } from '../../lib/format'

interface Props {
  symbol: string
  timeframe: Timeframe
  marketSource: TradeBotMarketSource | null
  accountBalance: number
  accountCurrency: string
  symbolSpec: SymbolSpec | null
  symbolSpecError?: string | null
  accountFreeMargin: number
  onTradeOpened: (order: TradeOrder) => void
  onReviewSetup?: (setup?: SetupCandidate | null) => void
}

export const TradeBotPanel: React.FC<Props> = ({
  symbol, timeframe, marketSource, accountBalance, accountCurrency, symbolSpec, symbolSpecError,
  accountFreeMargin, onTradeOpened, onReviewSetup,
}) => {
  const [running, setRunning] = useState(false)
  const [executionPending, setExecutionPending] = useState(false)
  const [cycleMessage, setCycleMessage] = useState('Stopped. Press Start demo bot to begin monitoring the selected cTrader practice account.')
  const [lastBotIssue, setLastBotIssue] = useState<string | null>(null)
  const runSessionRef = useRef(0)
  const runStartedAtRef = useRef(0)
  const runningScopeKeyRef = useRef<string | null>(null)
  const attemptedSignalRef = useRef<{ key: string; message: string } | null>(null)
  const executionInFlightRef = useRef(false)
  const [decisionTrace, setDecisionTrace] = useState<TradeBotDecisionTraceEntry[]>([])
  const [shadowRecords, setShadowRecords] = useState<TradeBotShadowRecord[]>([])
  const [historicalReplay, setHistoricalReplay] = useState<TradeBotHistoricalReplayResult | null>(null)
  const [replayCostPips, setReplayCostPips] = useState(1.5)
  const market = useTradeBotMarketData(symbol, marketSource, running)
  const decision = useMemo(() => evaluateTradeBotDecision({
    frames: market.frames,
    symbol,
    timeframe,
    accountBalance,
    accountCurrency,
    symbolSpec,
  }), [market.frames, symbol, timeframe, accountBalance, accountCurrency, symbolSpec])

  const diagnostics = useMemo(() => buildTradeBotDiagnosticSnapshot({
    source: marketSource,
    symbol,
    timeframe,
    frames: market.frames,
    marketStatus: market.status,
    marketUpdatedAt: market.updatedAt,
    marketQuoteTimestamp: market.quoteTimestamp,
    marketQuoteError: market.quoteError,
    accountBalance,
    accountCurrency,
    symbolSpec,
    decision,
  }), [
    marketSource?.providerId,
    marketSource?.connectionId,
    marketSource?.accountId,
    marketSource?.environment,
    symbol,
    timeframe,
    market.frames,
    market.status,
    market.updatedAt,
    market.quoteTimestamp,
    market.quoteError,
    accountBalance,
    accountCurrency,
    symbolSpec,
    decision,
  ])
  const diagnosticsTone = diagnostics.summary === 'READY_FOR_REVIEW'
    ? 'text-shafx-success'
    : diagnostics.summary === 'BLOCKED'
      ? 'text-shafx-danger'
      : 'text-shafx-textMuted'
  const traceScopeKey = tradeBotMarketSourceKey(symbol, marketSource) + '|' + timeframe
  const visibleDecisionTrace = useMemo(
    () => decisionTrace.filter((entry) => entry.scopeKey === traceScopeKey).slice(0, 6),
    [decisionTrace, traceScopeKey],
  )

  useEffect(() => {
    if (!running || !market.updatedAt) return
    const currentCandles = market.frames[timeframe] ?? []
    const lastCandle = currentCandles[currentCandles.length - 1]
    const entry = createTradeBotDecisionTraceEntry({
      scopeKey: traceScopeKey,
      symbol,
      timeframe,
      marketUpdatedAt: market.updatedAt,
      candleTime: lastCandle?.time ?? null,
      diagnostics,
    })
    if (!entry) return
    setDecisionTrace((current) => appendTradeBotDecisionTrace(current, entry, 12))
  }, [running, traceScopeKey, symbol, timeframe, market.updatedAt, market.frames, diagnostics])

  useEffect(() => {
    if (!running || !market.updatedAt) return
    const candles = market.frames[timeframe] ?? []
    const lastCandle = candles[candles.length - 1]
    setShadowRecords((current) => {
      const advanced = advanceTradeBotShadowRecords(current, market.frames)
      if (decision.status !== 'READY' || !decision.setup || !lastCandle) return advanced
      const candidate = createTradeBotShadowRecord({
        scopeKey: traceScopeKey,
        symbol,
        timeframe,
        signalCandleTime: lastCandle.time,
        setup: decision.setup,
        riskBudget: decision.riskBudget,
        estimatedLoss: decision.riskPlan?.valid ? decision.riskPlan.estimatedLossAtStop : null,
        estimatedReward: decision.riskPlan?.valid ? decision.riskPlan.estimatedRewardAtTarget : null,
      })
      return candidate ? appendTradeBotShadowRecord(advanced, candidate, 24) : advanced
    })
  }, [running, market.updatedAt, market.frames, timeframe, decision, traceScopeKey, symbol])

  const visibleShadowRecords = useMemo(
    () => shadowRecords.filter((record) => record.scopeKey === traceScopeKey).slice(0, 6),
    [shadowRecords, traceScopeKey],
  )

  const startBlockReason = !marketSource?.providerId
    ? 'Select a market provider and account before starting analysis.'
    : marketSource.providerId !== 'ctrader'
      ? 'Trade Bot requires a cTrader practice account. The Signal Bot can scan supported market-data providers independently.'
      : !marketSource.connectionId || !marketSource.accountId
        ? 'Connect to cTrader and select a specific account.'
        : marketSource.environment !== 'demo'
          ? 'Trade Bot analysis is restricted to cTrader practice/demo accounts. Live accounts remain blocked.'
          : !Number.isFinite(accountBalance) || accountBalance <= 0
            ? 'A positive balance from the selected cTrader practice account is required.'
            : !symbolSpec
              ? (symbolSpecError
                ? 'cTrader instrument lookup failed: ' + symbolSpecError
                : 'Waiting for matching cTrader instrument rules. The bot will stay blocked until the broker supplies valid contract, pip and lot constraints.')
              : null
  const canStart = startBlockReason === null && market.status !== 'unavailable'
  const statusLabel = !running
    ? (startBlockReason ? 'BLOCKED' : 'STOPPED')
    : !symbolSpec
      ? 'BROKER SPECS NEEDED'
      : market.status === 'ready'
        ? 'MONITORING'
        : market.status === 'partial'
          ? 'PARTIAL DATA'
          : market.status === 'loading'
            ? 'LOADING'
            : market.status === 'unavailable'
              ? 'BLOCKED'
              : 'DATA ERROR'
  const statusTone = decision.status === 'READY' && running
    ? 'border-shafx-success/30 bg-shafx-success/10 text-shafx-success'
    : decision.status === 'BLOCKED' || startBlockReason
      ? 'border-shafx-danger/30 bg-shafx-danger/10 text-shafx-danger'
      : 'border-shafx-border bg-shafx-bg text-shafx-textMuted'
  const updatedAt = market.updatedAt ? new Date(market.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'

  const start = (): void => {
    const currentScope = traceScopeKey
    runSessionRef.current += 1
    runningScopeKeyRef.current = currentScope
    runStartedAtRef.current = Date.now()
    setLastBotIssue(null)
    setCycleMessage('Started. Waiting for a fresh completed market-history cycle before making any decision.')
    setRunning(true)
  }
  const stop = (): void => {
    // Invalidate any in-flight preflight. Its next awaited checkpoint must see
    // this new session number and refuse to submit an order.
    runSessionRef.current += 1
    runningScopeKeyRef.current = null
    setRunning(false)
    setCycleMessage(executionInFlightRef.current
      ? 'Stop requested. The current preflight is being cancelled before order submission; wait for it to settle before restarting.'
      : 'Stopped by you. No further demo entries will be attempted.')
  }

  // A running session is pinned to the exact market/timeframe/account the user
  // started. Changing any of these stops it rather than moving an active bot
  // silently onto a new market.
  useEffect(() => {
    if (!running || !runningScopeKeyRef.current || runningScopeKeyRef.current === traceScopeKey) return
    runSessionRef.current += 1
    runningScopeKeyRef.current = null
    setRunning(false)
    setCycleMessage(executionInFlightRef.current
      ? 'Bot stopped because the selected market, timeframe or account changed. Cancelling the previous preflight before any order submission.'
      : 'Bot stopped because the selected market, timeframe or account changed. Press Start demo bot to start a new session.')
  }, [running, traceScopeKey])

  const executionSource = useMemo<TradeBotMarketSource | null>(() => marketSource ? ({
    providerId: marketSource.providerId,
    connectionId: marketSource.connectionId,
    accountId: marketSource.accountId,
    environment: marketSource.environment,
  }) : null, [
    marketSource?.providerId,
    marketSource?.connectionId,
    marketSource?.accountId,
    marketSource?.environment,
  ])

  // "Run" means active demo-only monitoring and guarded automatic entries. We
  // only act on a fresh cycle after the user started this session, and only
  // once per signal candle. A failed preflight is surfaced visibly and is not
  // retried on the same candle, preventing rapid duplicate orders.
  useEffect(() => {
    if (!running) return
    if (runningScopeKeyRef.current !== traceScopeKey) return
    if (market.status === 'loading') {
      setCycleMessage('Fetching a fresh cTrader history snapshot for this monitoring cycle…')
      return
    }
    if (market.status === 'unavailable' || market.status === 'error' || !market.updatedAt) {
      const issue = market.error || 'Waiting for cTrader practice history. No order was sent.'
      setLastBotIssue(issue)
      setCycleMessage('Cycle ' + market.cycleNumber + ': no valid market update. ' + issue)
      return
    }
    if (market.updatedAt < runStartedAtRef.current) {
      setCycleMessage('Waiting for the first market-history cycle started by this Run session. No order was sent.')
      return
    }
    if (market.status !== 'ready' && market.status !== 'partial') {
      setCycleMessage('Cycle ' + market.cycleNumber + ': market history is not ready. No order was sent.')
      return
    }
    // Fresh history HTTP responses are not evidence of a live market. Gate on
    // the timestamp attached to cTrader's actual quote before interpreting setup.
    if (!diagnostics.marketFresh) {
      const freshnessDetail = diagnostics.gates.find((gate) => gate.id === 'freshness')?.detail
        || 'No fresh cTrader quote is available.'
      setLastBotIssue(freshnessDetail)
      setCycleMessage('Cycle ' + market.cycleNumber + ': market quote is stale or unavailable. ' + freshnessDetail + ' No order was sent.')
      return
    }
    if (decision.status !== 'READY' || !decision.setup) {
      setCycleMessage(
        'Cycle ' + market.cycleNumber + ': monitoring ' + timeframe + '; no entry qualified. ' +
        decision.reason + (market.lastDataChanged === false ? ' Candle history was unchanged this cycle.' : ''),
      )
      return
    }
    if (diagnostics.summary !== 'READY_FOR_REVIEW') {
      const heldGates = diagnostics.gates.filter((gate) => !gate.passed)
      const details = heldGates.map((gate) => gate.label + ': ' + gate.detail).join(' | ')
      const reason = details || 'Decision diagnostics did not reach READY_FOR_REVIEW.'
      setLastBotIssue(reason)
      setCycleMessage('Cycle ' + market.cycleNumber + ': setup candidate found but held by checks. ' + reason + ' No order was sent.')
      return
    }
    const lastCandle = market.frames[timeframe]?.[market.frames[timeframe]!.length - 1]
    if (!lastCandle || !Number.isFinite(lastCandle.time) || lastCandle.time <= 0) {
      const issue = 'Signal candle timestamp is missing; no order was sent.'
      setLastBotIssue(issue)
      setCycleMessage('Cycle ' + market.cycleNumber + ': ' + issue)
      return
    }
    const signalKey = [
      traceScopeKey,
      String(lastCandle.time),
      decision.setup.direction,
    ].join('|')
    if (attemptedSignalRef.current?.key === signalKey) {
      setCycleMessage(attemptedSignalRef.current.message)
      return
    }
    if (executionInFlightRef.current) return

    executionInFlightRef.current = true
    setExecutionPending(true)
    const runSession = runSessionRef.current
    const preflightMessage = 'Cycle ' + market.cycleNumber + ': setup qualified. Checking a fresh broker quote, risk sizing, current exposure and free margin before submitting one cTrader DEMO order.'
    attemptedSignalRef.current = { key: signalKey, message: preflightMessage }
    setCycleMessage(preflightMessage)

    void executeTradeBotDemoOrder({
      source: executionSource,
      symbol,
      timeframe,
      signalCandleTime: Number(lastCandle.time),
      setup: decision.setup,
      accountBalance,
      accountFreeMargin,
      accountCurrency,
      symbolSpec,
      shouldContinue: () => runSessionRef.current === runSession && runningScopeKeyRef.current === traceScopeKey,
    }).then((result) => {
      onTradeOpened({ ...result.trade, chartTimeframe: timeframe })
      const message = result.protectionConfirmed
        ? 'DEMO ORDER FILLED: ' + result.trade.type + ' ' + symbol + ' · ' +
          result.trade.lotSize + ' lots · estimated stop risk ' +
          formatCurrency(result.trade.riskAmount ?? 0, accountCurrency) +
          '. cTrader confirmed the broker-side stop loss and take profit.'
        : 'DEMO ORDER FILLED, BUT BROKER PROTECTION IS NOT CONFIRMED. The bot has stopped. Check this position in cTrader now.'
      attemptedSignalRef.current = { key: signalKey, message }
      setLastBotIssue(result.protectionConfirmed ? null : 'Broker-side stop loss/take profit confirmation failed; verify the position directly in cTrader.')
      setCycleMessage(message)
      if (!result.protectionConfirmed) {
        runningScopeKeyRef.current = null
        setRunning(false)
      }
    }).catch((error: unknown) => {
      const reason = error instanceof Error ? error.message : 'Unknown cTrader demo order error.'
      if (runSessionRef.current !== runSession) return
      const message = 'Cycle ' + market.cycleNumber + ': no demo order sent — ' + reason
      attemptedSignalRef.current = { key: signalKey, message }
      setLastBotIssue(reason)
      setCycleMessage(message)
    }).finally(() => {
      executionInFlightRef.current = false
      setExecutionPending(false)
    })
  }, [
    running, traceScopeKey, market.status, market.updatedAt, market.cycleNumber,
    market.error, market.lastDataChanged, market.frames, timeframe, decision,
    diagnostics.summary, diagnostics.marketFresh, diagnostics.gates, executionSource, symbol, accountBalance, accountFreeMargin,
    accountCurrency, symbolSpec, onTradeOpened,
  ])
  const runHistoricalReplay = (): void => {
    if (!symbolSpec || !market.frames[timeframe] || market.frames[timeframe]!.length < 9) return
    const result = runTradeBotHistoricalReplay({
      scopeKey: traceScopeKey,
      symbol,
      timeframe,
      frames: market.frames,
      accountBalance,
      accountCurrency,
      symbolSpec,
      estimatedRoundTripCostPips: replayCostPips,
    })
    setHistoricalReplay(result)
  }
  const canRunHistoricalReplay = Boolean(
    symbolSpec && market.frames[timeframe] && market.frames[timeframe]!.length >= 9 &&
    (market.status === 'ready' || market.status === 'partial'),
  )

  return (
    <section className="space-y-4 rounded-2xl border border-shafx-border bg-shafx-surface p-4 shadow-[0_14px_36px_rgba(0,0,0,.16)]">
      <header className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-shafx-accent" />
            <h3 className="text-sm font-semibold">SHAFX Trade Bot</h3>
            <span className="rounded-md border border-shafx-accent/25 bg-shafx-accent/10 px-2 py-0.5 font-mono text-[8px] font-bold uppercase tracking-[0.14em] text-shafx-accent">INDEPENDENT</span>
          </div>
          <p className="mt-1 text-[9px] leading-4 text-shafx-textMuted">Separate market loader, decision state and risk gate. No Signal Bot output is consumed.</p>
        </div>
        <span className={'rounded-full border px-2 py-1 font-mono text-[8px] font-bold ' + statusTone}>{statusLabel}</span>
      </header>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-shafx-border bg-shafx-bg p-3">
          <span className="block text-[8px] uppercase tracking-[0.12em] text-shafx-textMuted">Selected market</span>
          <strong className="mt-1 block font-mono text-sm">{symbol}</strong>
          <span className="mt-0.5 block text-[8px] text-shafx-textMuted">
            {timeframe} • cTrader {marketSource?.environment === 'demo' ? 'practice' : marketSource?.environment === 'live' ? 'live (blocked)' : 'environment unknown'}
          </span>
        </div>
        <div className="rounded-xl border border-shafx-border bg-shafx-bg p-3">
          <span className="block text-[8px] uppercase tracking-[0.12em] text-shafx-textMuted">Risk ceiling</span>
          <strong className="mt-1 block font-mono text-sm">{formatCurrency(decision.riskBudget, accountCurrency)}</strong>
          <span className="mt-0.5 block text-[8px] text-shafx-textMuted">Lower of 0.5% balance or 10</span>
        </div>
      </div>

      {market.error && <div role="status" className="rounded-lg border border-shafx-warning/25 bg-shafx-warning/[0.06] px-3 py-2 text-[9px] leading-4 text-shafx-textMuted">{market.error}</div>}

      <div className="rounded-xl border border-shafx-border bg-shafx-bg/70 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.13em] text-shafx-textMuted"><ShieldCheck className="h-3.5 w-3.5" /> Independent decision</div>
          <span className="font-mono text-[8px] font-bold text-shafx-accent">{market.updatedAt ? 'Updated ' + updatedAt : 'No data yet'}</span>
        </div>
        <div className="mt-3 rounded-lg border border-shafx-border bg-shafx-bg p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[9px] font-bold">{decision.status}</span>
            <span className="font-mono text-[8px] text-shafx-textMuted">HTF {decision.higherTimeframeBias}</span>
          </div>
          <p className="mt-2 text-[9px] leading-4 text-shafx-textMuted">{decision.reason}</p>
          {decision.setup && (
            <div className="mt-3 grid grid-cols-2 gap-2 text-[9px]">
              <div><span className="block text-shafx-textMuted">Direction</span><b className={decision.setup.direction === 'BUY' ? 'text-shafx-success' : 'text-shafx-danger'}>{decision.setup.direction}</b></div>
              <div><span className="block text-shafx-textMuted">Setup score</span><b>{decision.setup.confidence} / 100</b></div>
              <div><span className="block text-shafx-textMuted">Entry reference</span><b className="font-mono">{formatPrice(decision.setup.entryPrice, (symbolSpec?.pricePrecision ?? 5))}</b></div>
              <div><span className="block text-shafx-textMuted">Risk / reward</span><b className="font-mono">{decision.riskPlan?.riskRewardRatio.toFixed(2) ?? '—'} : 1</b></div>
              <div><span className="block text-shafx-textMuted">Stop loss</span><b className="font-mono">{formatPrice(decision.setup.stopLoss, (symbolSpec?.pricePrecision ?? 5))}</b></div>
              <div><span className="block text-shafx-textMuted">Take profit</span><b className="font-mono">{formatPrice(decision.setup.takeProfit, (symbolSpec?.pricePrecision ?? 5))}</b></div>
            </div>
          )}
        </div>
      </div>

      <section className="rounded-xl border border-shafx-border bg-shafx-bg p-3" aria-live="polite" role="status">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[9px] font-semibold uppercase tracking-[0.13em] text-shafx-textMuted">Bot activity</div>
          <span className="font-mono text-[8px] text-shafx-textMuted">{running ? 'CYCLE ' + String(market.cycleNumber) : 'IDLE'}</span>
        </div>
        <div className="mt-2 flex items-center gap-2">
          {running && (market.status === 'loading' || executionPending)
            ? <Activity className="h-3.5 w-3.5 shrink-0 animate-pulse text-shafx-accent" />
            : <span className={'h-2 w-2 shrink-0 rounded-full ' + (running ? decision.status === 'READY' ? 'bg-shafx-success' : 'bg-shafx-accent' : 'bg-shafx-border')} />}
          <p className="text-[9px] leading-4 text-shafx-text">{cycleMessage}</p>
        </div>
        {running && market.cycleNumber > 0 && (
          <div className="mt-2 text-[8px] leading-4 text-shafx-textMuted">
            {market.lastDataChanged === true
              ? 'New candle snapshot received on the latest cycle.'
              : market.lastDataChanged === false
                ? 'The latest response contained the same candles; rules were still re-evaluated.'
                : 'Waiting for the next candle snapshot comparison.'}
            {market.updatedAt ? ' Last refresh ' + updatedAt + '.' : ''}
          </div>
        )}
      </section>
      {lastBotIssue && (
        <div role="alert" className="rounded-lg border border-shafx-danger/30 bg-shafx-danger/[0.06] px-3 py-2 text-[9px] leading-4 text-shafx-text">
          <div className="font-semibold text-shafx-danger">Last bot issue / held check</div>
          <p className="mt-1 break-words">{lastBotIssue}</p>
          <p className="mt-1 text-shafx-textMuted">This message stays visible until the next time you start a new run or a successful protected fill clears it.</p>
        </div>
      )}

      <details className="rounded-xl border border-shafx-border bg-shafx-bg/70 p-3">
        <summary className="cursor-pointer list-none flex items-center justify-between gap-2 text-[9px] font-semibold uppercase tracking-[0.13em]">
          <span>Decision diagnostics</span>
          <span className={'font-mono ' + diagnosticsTone}>
            {diagnostics.summary === 'READY_FOR_REVIEW' && running ? 'SETUP QUALIFIED · PREFLIGHT' : diagnostics.summary.replace(/_/g, ' ')}
          </span>
        </summary>
        <div className="mt-3 space-y-3 text-[9px]">
          <div className="rounded-lg border border-shafx-border bg-shafx-bg p-3">
            <div className="text-[8px] uppercase tracking-[0.12em] text-shafx-textMuted">Data source scope</div>
            <div className="mt-1 break-words font-mono">{diagnostics.sourceLabel}</div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div><span className="block text-shafx-textMuted">Candle history</span><b>{diagnostics.candleCount} / 8 bars ({timeframe})</b></div>
              <div><span className="block text-shafx-textMuted">Broker quote</span><b>{diagnostics.marketAgeSeconds === null ? 'never' : diagnostics.marketAgeSeconds + 's old'} · {diagnostics.marketFresh ? 'fresh' : 'stale'}</b></div>
              <div><span className="block text-shafx-textMuted">History request</span><b>{diagnostics.marketRefreshAgeSeconds === null ? 'never' : diagnostics.marketRefreshAgeSeconds + 's ago'}</b></div>
              <div><span className="block text-shafx-textMuted">Last candle time</span><b className="font-mono">{diagnostics.lastCandleAt ? new Date(diagnostics.lastCandleAt).toLocaleString() : '—'}</b></div>
              <div><span className="block text-shafx-textMuted">Last candle close</span><b className="font-mono">{diagnostics.lastCandleClose === null ? '—' : formatPrice(diagnostics.lastCandleClose, symbolSpec?.pricePrecision ?? 5)}</b></div>
            </div>
            <div className="mt-2"><span className="text-shafx-textMuted">Frames with at least 8 candles: </span><b>{diagnostics.loadedTimeframes.length ? diagnostics.loadedTimeframes.join(', ') : 'none'}</b></div>
          </div>
          <div className="rounded-lg border border-shafx-border bg-shafx-bg p-3">
            <div className="text-[8px] uppercase tracking-[0.12em] text-shafx-textMuted">Broker contract metadata</div>
            <div className="mt-1">{diagnostics.brokerSpec.available && diagnostics.brokerSpec.matchesSymbol ? 'Verified contract matches ' + symbol : 'Missing or mismatched for ' + symbol}</div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div><span className="block text-shafx-textMuted">Contract size</span><b className="font-mono">{diagnostics.brokerSpec.contractSize ?? '—'}</b></div>
              <div><span className="block text-shafx-textMuted">Pip size</span><b className="font-mono">{diagnostics.brokerSpec.pipSize ?? '—'}</b></div>
              <div><span className="block text-shafx-textMuted">Lot minimum / step</span><b className="font-mono">{diagnostics.brokerSpec.minLotSize ?? '—'} / {diagnostics.brokerSpec.lotStep ?? '—'}</b></div>
              <div><span className="block text-shafx-textMuted">Lot maximum</span><b className="font-mono">{diagnostics.brokerSpec.maxLotSize ?? '—'}</b></div>
            </div>
          </div>
          <div className="rounded-lg border border-shafx-border bg-shafx-bg p-3">
            <div className="text-[8px] uppercase tracking-[0.12em] text-shafx-textMuted">Risk gate</div>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <div><span className="block text-shafx-textMuted">Risk ceiling</span><b>{formatCurrency(diagnostics.riskBudget, accountCurrency)}</b></div>
              <div><span className="block text-shafx-textMuted">Estimated stop loss</span><b>{diagnostics.estimatedLoss === null ? '—' : formatCurrency(diagnostics.estimatedLoss, accountCurrency)}</b></div>
              <div><span className="block text-shafx-textMuted">Estimated target</span><b>{diagnostics.estimatedReward === null ? '—' : formatCurrency(diagnostics.estimatedReward, accountCurrency)}</b></div>
              <div><span className="block text-shafx-textMuted">Planned lot size</span><b>{diagnostics.lots === null ? '—' : diagnostics.lots}</b></div>
              <div><span className="block text-shafx-textMuted">Risk / reward</span><b>{diagnostics.riskRewardRatio === null ? '—' : diagnostics.riskRewardRatio.toFixed(2) + ':1'}</b></div>
              <div><span className="block text-shafx-textMuted">Higher-timeframe bias</span><b>{diagnostics.higherTimeframeBias}</b></div>
            </div>
          </div>
          <div className="space-y-2">
            {diagnostics.gates.map((gate) => (
              <div key={gate.id} className="flex items-start gap-2 border-b border-shafx-border/70 pb-2 last:border-0">
                <span className={'mt-px min-w-10 font-mono font-bold ' + (gate.passed ? 'text-shafx-success' : 'text-shafx-warning')}>{gate.passed ? 'PASS' : 'HOLD'}</span>
                <div className="min-w-0">
                  <div className="font-semibold">{gate.label}</div>
                  <div className="mt-0.5 break-words leading-4 text-shafx-textMuted">{gate.detail}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="rounded-lg border border-shafx-border bg-shafx-bg p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[8px] uppercase tracking-[0.12em] text-shafx-textMuted">Recent analysis cycles</div>
              <span className="font-mono text-[8px] text-shafx-textMuted">{visibleDecisionTrace.length} / 6 · memory only</span>
            </div>
            {visibleDecisionTrace.length === 0 ? (
              <p className="mt-2 leading-4 text-shafx-textMuted">Start demo bot to record real monitoring cycles for this selected account, market and timeframe. The trace clears on page reload and stores no credentials.</p>
            ) : (
              <div className="mt-2 space-y-2">
                {visibleDecisionTrace.map((entry) => (
                  <div key={entry.id} className="border-b border-shafx-border/70 pb-2 last:border-0">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-mono font-bold">{entry.status} · {entry.timeframe}</span>
                      <span className="font-mono text-[8px] text-shafx-textMuted">{new Date(entry.observedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                    </div>
                    <div className="mt-1 text-[8px] text-shafx-textMuted">
                      {entry.candleCount} candles · candle {entry.candleAt ? new Date(entry.candleAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'} · data age {entry.marketAgeSeconds === null ? '—' : entry.marketAgeSeconds + 's'} · HTF {entry.higherTimeframeBias}
                    </div>
                    <div className="mt-1 break-words leading-4 text-shafx-textMuted">{entry.reason}</div>
                    <div className="mt-1 font-mono text-[8px] text-shafx-textMuted">
                      Risk {formatCurrency(entry.riskBudget, accountCurrency)} · RR {entry.riskRewardRatio === null ? '—' : entry.riskRewardRatio.toFixed(2) + ':1'} · lots {entry.lots ?? '—'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {historicalReplay && historicalReplay.records.length >= 0 && (
            <div className="rounded-lg border border-shafx-accent/25 bg-shafx-bg p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[8px] uppercase tracking-[0.12em] text-shafx-accent">Historical replay · {historicalReplay.timeframe}</div>
                <span className="font-mono text-[8px] text-shafx-textMuted">{historicalReplay.candlesReviewed} candles</span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div><span className="block text-shafx-textMuted">READY candidates</span><b>{historicalReplay.readyCandidates}</b></div>
                <div><span className="block text-shafx-textMuted">Target / stop</span><b>{historicalReplay.target} / {historicalReplay.stop}</b></div>
                <div><span className="block text-shafx-textMuted">Ambiguous</span><b>{historicalReplay.ambiguous}</b></div>
                <div><span className="block text-shafx-textMuted">Unresolved</span><b>{historicalReplay.pending}</b></div>
                <div><span className="block text-shafx-textMuted">Net total</span><b>{historicalReplay.netTotalR === null ? '—' : historicalReplay.netTotalR.toFixed(2) + 'R'}</b></div>
                <div><span className="block text-shafx-textMuted">Profit factor</span><b>{historicalReplay.netProfitFactor === null ? '—' : historicalReplay.netProfitFactor.toFixed(2)}</b></div>
                <div><span className="block text-shafx-textMuted">Expectancy</span><b>{historicalReplay.netExpectancyR === null ? '—' : historicalReplay.netExpectancyR.toFixed(2) + 'R/trade'}</b></div>
                <div><span className="block text-shafx-textMuted">Max drawdown</span><b>{historicalReplay.maxDrawdownR === null ? '—' : historicalReplay.maxDrawdownR.toFixed(2) + 'R'}</b></div>
              </div>
              <div className="mt-2 text-[8px] leading-4 text-shafx-textMuted">
                Target hit rate among resolved non-ambiguous samples: {historicalReplay.conservativeTargetRatePercent === null ? 'not available' : historicalReplay.conservativeTargetRatePercent + '%'}.
                Net metrics subtract an assumed {historicalReplay.assumedRoundTripCostPips.toFixed(1)} pip-equivalent round-trip cost. This is not recorded broker spread/commission or proof of profitability.
              </div>
              <div className="mt-3 rounded-lg border border-shafx-border p-3">
                <div className="text-[8px] font-semibold uppercase tracking-[0.12em] text-shafx-accent">Chronological holdout · final 30%</div>
                <div className="mt-1 text-[8px] text-shafx-textMuted">
                  {historicalReplay.outOfSampleStartTime === null ? 'Not enough candles to create a separate holdout segment.' : 'Signals at or after ' + new Date(historicalReplay.outOfSampleStartTime * 1000).toLocaleString() + ' are measured separately.'}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div><span className="block text-shafx-textMuted">Candidates</span><b>{historicalReplay.outOfSample.candidateCount}</b></div>
                  <div><span className="block text-shafx-textMuted">Resolved / ambiguous</span><b>{historicalReplay.outOfSample.resolvedSampleCount} / {historicalReplay.outOfSample.ambiguous}</b></div>
                  <div><span className="block text-shafx-textMuted">Net win rate</span><b>{historicalReplay.outOfSample.netWinRatePercent === null ? '—' : historicalReplay.outOfSample.netWinRatePercent + '%'}</b></div>
                  <div><span className="block text-shafx-textMuted">Net expectancy</span><b>{historicalReplay.outOfSample.netExpectancyR === null ? '—' : historicalReplay.outOfSample.netExpectancyR.toFixed(2) + 'R'}</b></div>
                  <div><span className="block text-shafx-textMuted">Profit factor</span><b>{historicalReplay.outOfSample.netProfitFactor === null ? '—' : historicalReplay.outOfSample.netProfitFactor.toFixed(2)}</b></div>
                  <div><span className="block text-shafx-textMuted">Net total</span><b>{historicalReplay.outOfSample.netTotalR === null ? '—' : historicalReplay.outOfSample.netTotalR.toFixed(2) + 'R'}</b></div>
                  <div><span className="block text-shafx-textMuted">Max drawdown</span><b>{historicalReplay.outOfSample.maxDrawdownR === null ? '—' : historicalReplay.outOfSample.maxDrawdownR.toFixed(2) + 'R'}</b></div>
                  <div><span className="block text-shafx-textMuted">Pending</span><b>{historicalReplay.outOfSample.pending}</b></div>
                </div>
              </div>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-[8px] leading-4 text-shafx-textMuted">
                {historicalReplay.notes.slice(1).map((note) => <li key={note}>{note}</li>)}
              </ul>
            </div>
          )}
          <div className="rounded-lg border border-shafx-border bg-shafx-bg p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[8px] uppercase tracking-[0.12em] text-shafx-textMuted">Shadow outcomes · no orders</div>
              <span className="font-mono text-[8px] text-shafx-textMuted">{visibleShadowRecords.length} / 6 · memory only</span>
            </div>
            {visibleShadowRecords.length === 0 ? (
              <p className="mt-2 leading-4 text-shafx-textMuted">A READY setup is recorded once per candle. Later candles test the planned stop and target; these are hypothetical outcomes, not broker trades or a profitability claim.</p>
            ) : (
              <div className="mt-2 space-y-2">
                {visibleShadowRecords.map((record) => (
                  <div key={record.id} className="border-b border-shafx-border/70 pb-2 last:border-0">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-mono font-bold">{record.direction} · {record.timeframe}</span>
                      <span className={'font-mono text-[8px] font-bold ' + (record.status === 'TARGET' ? 'text-shafx-success' : record.status === 'STOP' ? 'text-shafx-danger' : 'text-shafx-textMuted')}>{record.status}</span>
                    </div>
                    <div className="mt-1 font-mono text-[8px] text-shafx-textMuted">Entry {formatPrice(record.entryPrice, symbolSpec?.pricePrecision ?? 5)} · SL {formatPrice(record.stopLoss, symbolSpec?.pricePrecision ?? 5)} · TP {formatPrice(record.takeProfit, symbolSpec?.pricePrecision ?? 5)}</div>
                    <div className="mt-1 break-words leading-4 text-shafx-textMuted">{record.resolutionNote}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <p className="leading-4 text-shafx-textMuted">When Start demo bot is active on a cTrader practice account, a qualified setup enters broker preflight. The Bot activity message above reports every hold or rejected order; a setup score alone never means an order was filled.</p>
        </div>
      </details>

      <div className="rounded-lg border border-shafx-warning/25 bg-shafx-warning/[0.05] px-3 py-2 text-[9px] leading-4 text-shafx-textMuted">
        Starting this bot enables guarded automatic entries on the selected cTrader PRACTICE account only. Live accounts remain blocked. Every entry must pass fresh-quote, exposure, risk, protection and free-margin checks.
      </div>

      {!running && startBlockReason && (
        <div role="status" className="rounded-lg border border-shafx-danger/25 bg-shafx-danger/[0.05] px-3 py-2 text-[9px] leading-4 text-shafx-textMuted">
          <span className="font-semibold text-shafx-danger">Start blocked: </span>{startBlockReason}
        </div>
      )}

      <label className="block text-[8px] leading-4 text-shafx-textMuted">
        Assumed round-trip execution cost (pip-equivalent; tune per instrument)
        <input
          type="number"
          min="0"
          max="100"
          step="0.1"
          value={replayCostPips}
          onChange={(event) => setReplayCostPips(event.currentTarget.value === '' ? 0 : Math.min(100, Math.max(0, Number(event.currentTarget.value) || 0)))}
          className="mt-1 block min-h-9 w-full rounded-lg border border-shafx-border bg-shafx-bg px-3 font-mono text-xs text-shafx-text"
          aria-label="Assumed round-trip execution cost in pip-equivalent units"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        {!running ? (
          <button type="button" onClick={start} disabled={!canStart || executionPending} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-shafx-accent px-3 text-[9px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">
            <Play className="h-3.5 w-3.5" /> Start demo bot
          </button>
        ) : (
          <button type="button" onClick={stop} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-shafx-danger/35 bg-shafx-danger/10 px-3 text-[9px] font-bold text-shafx-danger">
            <CircleStop className="h-3.5 w-3.5" /> Stop bot
          </button>
        )}
        {decision.status === 'READY' && decision.setup && (
          <button type="button" onClick={() => onReviewSetup?.(decision.setup)} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-shafx-accent/30 px-3 text-[9px] font-bold text-shafx-accent hover:bg-shafx-accent/10">
            Review in trade ticket
          </button>
        )}
        <button type="button" onClick={runHistoricalReplay} disabled={!canRunHistoricalReplay} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-shafx-border px-3 text-[9px] font-bold text-shafx-text disabled:cursor-not-allowed disabled:opacity-40">
          Run historical replay
        </button>
      </div>
      <p className="text-[8px] leading-4 text-shafx-textMuted">Monitoring cycle every 15 seconds • last update {updatedAt} • auto-entry only while you keep this demo bot running</p>
    </section>
  )
}
