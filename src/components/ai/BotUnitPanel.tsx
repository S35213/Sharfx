import React, { useEffect, useMemo, useRef, useState } from 'react'
import { CircleStop, Play, RotateCcw, ShieldCheck } from 'lucide-react'
import type { BotPaperTrade, SymbolSpec, Timeframe } from '../../types'
import type { SignalRadarResult } from '../../engine/bot/signalRadar'
import { getSymbolSpec } from '../../data/mock/symbols'
import {
  assessPaperOpportunity,
  calculatePaperPnl,
  type PaperEngineMode,
  type PaperEngineSettings,
  type PaperOpportunityAssessment,
} from '../../lib/paperTradingEngine'

type RoundStatus = 'idle' | 'monitoring' | 'win' | 'loss' | 'timeout' | 'wait'

interface RoundState {
  number: number
  status: RoundStatus
  direction?: 'BUY' | 'SELL'
  signalTimeframe?: Timeframe
  entryTimeframe?: Timeframe
  entry?: number
  exit?: number
  targetPrice?: number
  stopPrice?: number
  pnl?: number
  expectedProfit?: number
  expectedLoss?: number
  openedAt?: string
}

const UNIT_ROUNDS = 5
const MAX_HOLD_SECONDS = 90
const WAIT_RECHECK_SECONDS = 5
const DEFAULT_LOT_SIZE = 0.1
const DEFAULT_STAKE = 10
const DEFAULT_MULTIPLIER = 100
const DEFAULT_MIN_EXPECTED_PROFIT = 5
const DEFAULT_MIN_RISK_REWARD = 1.5
const DEFAULT_MIN_SIGNAL_STRENGTH = 72
const QUICK_LOTS = [0.01, 0.05, 0.1, 0.25, 0.5, 1]
const QUICK_MULTIPLIERS = [100, 200, 300, 500, 800]
const QUICK_MIN_PROFITS = [2, 5, 10, 20, 50]

const createRounds = (): RoundState[] =>
  Array.from({ length: UNIT_ROUNDS }, (_, index) => ({ number: index + 1, status: 'idle' }))

const displayPnl = (value: number): string => {
  const absolute = Math.abs(value)
  const digits = absolute > 0 && absolute < 0.01 ? 4 : absolute > 0 && absolute < 0.1 ? 3 : 2
  return (value >= 0 ? '+' : '') + value.toFixed(digits)
}

interface Props {
  symbol: string
  currency: string
  radar: SignalRadarResult
  currentPrice: number
  onPaperRoundClosed?: (trade: BotPaperTrade) => void
}

export const BotUnitPanel: React.FC<Props> = ({ symbol, currency, radar, currentPrice, onPaperRoundClosed }) => {
  const symbolSpec = useMemo<SymbolSpec>(() => getSymbolSpec(symbol), [symbol])
  const [rounds, setRounds] = useState<RoundState[]>(createRounds)
  const [running, setRunning] = useState(false)
  const [activeRound, setActiveRound] = useState(0)
  const [secondsLeft, setSecondsLeft] = useState(WAIT_RECHECK_SECONDS)
  const [entry, setEntry] = useState<number | null>(null)
  const [direction, setDirection] = useState<'BUY' | 'SELL' | null>(null)
  const [signalTimeframe, setSignalTimeframe] = useState<Timeframe | null>(null)
  const [entryTimeframe, setEntryTimeframe] = useState<Timeframe | null>(null)
  const [paperMode, setPaperMode] = useState<PaperEngineMode>('SHAFX_STANDARD')
  const [paperLotSize, setPaperLotSize] = useState(String(DEFAULT_LOT_SIZE))
  const [paperStake, setPaperStake] = useState(String(DEFAULT_STAKE))
  const [paperMultiplier, setPaperMultiplier] = useState(String(DEFAULT_MULTIPLIER))
  const [minExpectedProfit, setMinExpectedProfit] = useState(String(DEFAULT_MIN_EXPECTED_PROFIT))
  const [minRiskReward, setMinRiskReward] = useState(String(DEFAULT_MIN_RISK_REWARD))
  const [minSignalStrength, setMinSignalStrength] = useState(String(DEFAULT_MIN_SIGNAL_STRENGTH))
  const timerRef = useRef<number | null>(null)
  const settledRoundRef = useRef(0)
  const roundOpenedAtRef = useRef<Record<number, string>>({})
  const activeSettingsRef = useRef<PaperEngineSettings | null>(null)
  const activeTargetAmountRef = useRef(0)
  const activeStopAmountRef = useRef(0)

  const safeLotSize = Math.min(
    symbolSpec.maxLotSize,
    Math.max(symbolSpec.minLotSize, Number.isFinite(Number(paperLotSize)) ? Number(paperLotSize) : DEFAULT_LOT_SIZE),
  )
  const safeStake = Math.max(1, Number.isFinite(Number(paperStake)) ? Number(paperStake) : DEFAULT_STAKE)
  const safeMultiplier = Math.max(1, Number.isFinite(Number(paperMultiplier)) ? Number(paperMultiplier) : DEFAULT_MULTIPLIER)
  const safeMinProfit = Math.max(0, Number.isFinite(Number(minExpectedProfit)) ? Number(minExpectedProfit) : DEFAULT_MIN_EXPECTED_PROFIT)
  const safeMinRR = Math.max(0.1, Number.isFinite(Number(minRiskReward)) ? Number(minRiskReward) : DEFAULT_MIN_RISK_REWARD)
  const safeMinSignal = Math.min(100, Math.max(0, Number.isFinite(Number(minSignalStrength)) ? Number(minSignalStrength) : DEFAULT_MIN_SIGNAL_STRENGTH))

  const settings = useMemo<PaperEngineSettings>(() => ({
    mode: paperMode,
    accountCurrency: currency,
    lotSize: safeLotSize,
    stake: safeStake,
    multiplier: safeMultiplier,
    minExpectedProfit: safeMinProfit,
    minRiskReward: safeMinRR,
    minSignalStrength: safeMinSignal,
  }), [currency, paperMode, safeLotSize, safeMinProfit, safeMinRR, safeMinSignal, safeStake, safeMultiplier])

  const currentAssessment = useMemo<PaperOpportunityAssessment>(
    () => assessPaperOpportunity(radar, currentPrice, symbolSpec, settings),
    [currentPrice, radar, settings, symbolSpec],
  )

  const latestRadarRef = useRef(radar)
  const latestPriceRef = useRef(currentPrice)
  const latestSettingsRef = useRef(settings)
  const latestCallbackRef = useRef(onPaperRoundClosed)
  useEffect(() => { latestRadarRef.current = radar }, [radar])
  useEffect(() => { latestPriceRef.current = currentPrice }, [currentPrice])
  useEffect(() => { latestSettingsRef.current = settings }, [settings])
  useEffect(() => { latestCallbackRef.current = onPaperRoundClosed }, [onPaperRoundClosed])

  const totalPnl = useMemo(
    () => Number(rounds.reduce((sum, round) => sum + (round.pnl ?? 0), 0).toFixed(4)),
    [rounds],
  )
  const wins = rounds.filter((round) => round.status === 'win').length
  const losses = rounds.filter((round) => round.status === 'loss').length
  const timeouts = rounds.filter((round) => round.status === 'timeout').length
  const tradedRounds = wins + losses + timeouts
  const allRoundsTraded = tradedRounds === UNIT_ROUNDS
  const botPlan = radar.botPlan

  const clearTimer = (): void => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current)
    timerRef.current = null
  }

  const beginRound = (roundNumber: number): void => {
    const nextAssessment = assessPaperOpportunity(
      latestRadarRef.current,
      latestPriceRef.current,
      symbolSpec,
      latestSettingsRef.current,
    )
    const qualifies = nextAssessment.decision === 'TRADE'
      && nextAssessment.direction !== null
      && nextAssessment.entryPrice !== null
      && nextAssessment.targetPrice !== null
      && nextAssessment.stopPrice !== null

    if (qualifies) {
      const openedAt = new Date().toISOString()
      const entrySettings = { ...latestSettingsRef.current }
      activeSettingsRef.current = entrySettings
      activeTargetAmountRef.current = nextAssessment.expectedProfit
      activeStopAmountRef.current = nextAssessment.expectedLoss
      roundOpenedAtRef.current[roundNumber] = openedAt
      setSecondsLeft(MAX_HOLD_SECONDS)
      setEntry(nextAssessment.entryPrice)
      setDirection(nextAssessment.direction)
      setSignalTimeframe(nextAssessment.opportunity?.timeframe ?? null)
      setEntryTimeframe(latestRadarRef.current.botPlan.entryTimeframe)
    } else {
      activeSettingsRef.current = null
      activeTargetAmountRef.current = 0
      activeStopAmountRef.current = 0
      setSecondsLeft(WAIT_RECHECK_SECONDS)
      setEntry(null)
      setDirection(null)
      setSignalTimeframe(null)
      setEntryTimeframe(null)
    }

    setActiveRound(roundNumber)
    setRounds((current) => current.map((round) => round.number === roundNumber
      ? {
          ...round,
          status: qualifies ? 'monitoring' : 'wait',
          direction: qualifies ? nextAssessment.direction ?? undefined : undefined,
          signalTimeframe: qualifies ? nextAssessment.opportunity?.timeframe : undefined,
          entryTimeframe: qualifies ? latestRadarRef.current.botPlan.entryTimeframe ?? undefined : undefined,
          entry: qualifies ? nextAssessment.entryPrice ?? undefined : undefined,
          exit: undefined,
          targetPrice: qualifies ? nextAssessment.targetPrice ?? undefined : undefined,
          stopPrice: qualifies ? nextAssessment.stopPrice ?? undefined : undefined,
          pnl: undefined,
          expectedProfit: qualifies ? nextAssessment.expectedProfit : undefined,
          expectedLoss: qualifies ? nextAssessment.expectedLoss : undefined,
          openedAt: qualifies ? roundOpenedAtRef.current[roundNumber] : undefined,
        }
      : round))
  }

  const startUnit = (): void => {
    clearTimer()
    settledRoundRef.current = 0
    setRounds(createRounds())
    setRunning(true)
    beginRound(1)
  }

  const stopUnit = (): void => {
    clearTimer()
    setRunning(false)
    setSecondsLeft(WAIT_RECHECK_SECONDS)
  }

  const resetUnit = (): void => {
    stopUnit()
    settledRoundRef.current = 0
    activeSettingsRef.current = null
    setRounds(createRounds())
    setActiveRound(0)
    setEntry(null)
    setDirection(null)
    setSignalTimeframe(null)
    setEntryTimeframe(null)
    setTargetPrice(null)
    setStopPrice(null)
  }

  useEffect(() => {
    if (!running) return
    clearTimer()
    timerRef.current = window.setInterval(() => {
      setSecondsLeft((current) => Math.max(0, current - 1))
    }, 1000)
    return clearTimer
  }, [activeRound, running])

  useEffect(() => {
    if (!running || activeRound <= 0) return
    const currentEntry = entry
    const currentDirection = direction
    const livePrice = currentPrice
    const positionSettings = activeSettingsRef.current
    const targetAmount = activeTargetAmountRef.current
    const stopAmount = activeStopAmountRef.current

    const settleRound = (status: 'win' | 'loss' | 'timeout', exitPrice: number, roundPnl: number): void => {
      if (settledRoundRef.current === activeRound) return
      settledRoundRef.current = activeRound
      const closedAt = new Date().toISOString()
      const roundSettings = positionSettings ?? latestSettingsRef.current

      setRounds((current) => current.map((round) => round.number === activeRound
        ? { ...round, status, exit: exitPrice, pnl: roundPnl }
        : round))

      latestCallbackRef.current?.({
        id: 'bot-paper-' + Date.now() + '-' + activeRound,
        symbol,
        round: activeRound,
        direction: currentDirection,
        signalTimeframe,
        entryTimeframe,
        entry: currentEntry,
        exit: exitPrice,
        stake: roundSettings.mode === 'DERIV_MULTIPLIER' ? roundSettings.stake : 0,
        multiplier: roundSettings.mode === 'DERIV_MULTIPLIER' ? roundSettings.multiplier : 0,
        paperMode: roundSettings.mode,
        lotSize: roundSettings.mode === 'SHAFX_STANDARD' ? roundSettings.lotSize : undefined,
        expectedProfit: targetAmount,
        expectedLoss: stopAmount,
        pnl: roundPnl,
        status,
        openTime: roundOpenedAtRef.current[activeRound] ?? closedAt,
        closeTime: closedAt,
      })

      if (activeRound >= UNIT_ROUNDS) {
        clearTimer()
        setRunning(false)
        return
      }

      beginRound(activeRound + 1)
    }

    if (currentDirection && currentEntry && positionSettings) {
      const livePnl = calculatePaperPnl({
        mode: positionSettings.mode,
        direction: currentDirection,
        entryPrice: currentEntry,
        currentPrice: livePrice,
        settings: positionSettings,
        symbolSpec,
      })

      if (livePnl >= Math.max(targetAmount, 0.01)) {
        settleRound('win', livePrice, livePnl)
        return
      }
      if (livePnl <= -Math.abs(stopAmount)) {
        settleRound('loss', livePrice, livePnl)
        return
      }

      if (secondsLeft <= 0) {
        settleRound('timeout', livePrice, livePnl)
        return
      }
    }

    if (!currentDirection && secondsLeft <= 0) {
      if (tradedRounds >= UNIT_ROUNDS) {
        clearTimer()
        setRunning(false)
        return
      }
      beginRound(activeRound)
    }
  }, [activeRound, currentPrice, direction, entry, entryTimeframe, running, secondsLeft, signalTimeframe, symbol, symbolSpec, tradedRounds])

  useEffect(() => () => clearTimer(), [])

  const decisionLabel = currentAssessment.decision === 'TRADE' ? 'TRADE' : 'WAIT'
  const expectedText = currentAssessment.expectedProfit > 0
    ? currency + ' +' + currentAssessment.expectedProfit.toFixed(2)
    : '—'

  return (
    <section className="rounded-2xl border border-shafx-border bg-shafx-surface p-4 shadow-[0_14px_36px_rgba(0,0,0,.14)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-shafx-accent" />
            <h4 className="text-sm font-semibold">SHAFX Smart Trade Engine</h4>
            <span className="rounded-md border border-shafx-success/25 bg-shafx-success/10 px-2 py-0.5 font-mono text-[7px] font-bold tracking-[0.12em] text-shafx-success">PAPER ONLY</span>
            <span className="rounded-md border border-shafx-accent/25 bg-shafx-accent/10 px-2 py-0.5 font-mono text-[7px] font-bold tracking-[0.12em] text-shafx-accent">OPPORTUNITY FIRST</span>
          </div>
          <p className="mt-1 max-w-[680px] text-[9px] leading-4 text-shafx-textMuted">
            SHAFX does not enter just because a direction exists. It checks signal strength, target room, expected profit and reward-to-risk first. Weak or tiny opportunities stay in WAIT and do not consume a trade round.
          </p>
        </div>
        <div className="text-right">
          <div className="font-mono text-[8px] text-shafx-textMuted">TRADE SLOTS</div>
          <div className="mt-0.5 font-mono text-lg font-bold">{tradedRounds} / {UNIT_ROUNDS}</div>
        </div>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-[1.2fr_1fr]">
        <div className="rounded-xl border border-shafx-border bg-shafx-bg/70 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[7px] uppercase tracking-[0.12em] text-shafx-textMuted">Paper engine</span>
            <span className="font-mono text-[8px] text-shafx-accent">{paperMode === 'SHAFX_STANDARD' ? 'LOT-BASED' : 'MULTIPLIER'}</span>
          </div>
          <select
            aria-label="Paper engine"
            value={paperMode}
            onChange={(event) => setPaperMode(event.target.value as PaperEngineMode)}
            className="mt-1 w-full rounded-lg border border-shafx-border bg-shafx-surface px-2 py-2 font-mono text-xs outline-none focus:border-shafx-accent"
          >
            <option value="SHAFX_STANDARD">SHAFX STANDARD — Forex-style lots</option>
            <option value="DERIV_MULTIPLIER">DERIV MULTIPLIER — actual percentage model</option>
          </select>

          {paperMode === 'SHAFX_STANDARD' ? (
            <div className="mt-2">
              <span className="block text-[7px] uppercase tracking-[0.12em] text-shafx-textMuted">Paper lot size</span>
              <input aria-label="Bot paper lot size" type="number" min={symbolSpec.minLotSize} max={symbolSpec.maxLotSize} step={symbolSpec.lotStep} value={paperLotSize} onChange={(event) => setPaperLotSize(event.target.value)} className="mt-1 w-full rounded-lg border border-shafx-border bg-shafx-surface px-2 py-2 font-mono text-xs outline-none focus:border-shafx-accent" />
              <div className="mt-1 flex gap-1 overflow-x-auto">
                {QUICK_LOTS.map((value) => (
                  <button key={value} type="button" onClick={() => setPaperLotSize(String(value))} className={'border px-1.5 py-1 font-mono text-[7px] ' + (Math.abs(Number(paperLotSize) - value) < 0.00001 ? 'border-shafx-accent/40 bg-shafx-accent/10 text-shafx-accent' : 'border-shafx-border text-shafx-textMuted')}>{value.toFixed(2)}</button>
                ))}
              </div>
              <div className="mt-1 text-[7px] text-shafx-textMuted">Conventional price-move × contract-size × lot calculation. Simulation only.</div>
            </div>
          ) : (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="border border-shafx-border bg-shafx-surface px-2 py-2">
                <span className="block text-[7px] uppercase tracking-[0.12em] text-shafx-textMuted">Stake</span>
                <input aria-label="Bot paper stake" type="number" min="1" max="2000" step="1" value={paperStake} onChange={(event) => setPaperStake(event.target.value)} className="mt-1 w-full bg-transparent font-mono text-[10px] outline-none" />
              </label>
              <label className="border border-shafx-border bg-shafx-surface px-2 py-2">
                <span className="block text-[7px] uppercase tracking-[0.12em] text-shafx-textMuted">Multiplier</span>
                <select aria-label="Bot paper multiplier" value={paperMultiplier} onChange={(event) => setPaperMultiplier(event.target.value)} className="mt-1 w-full bg-transparent font-mono text-[10px] outline-none">{QUICK_MULTIPLIERS.map((value) => <option key={value} value={value}>{value}×</option>)}</select>
              </label>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-shafx-border bg-shafx-bg/70 p-3">
          <div className="text-[7px] uppercase tracking-[0.12em] text-shafx-textMuted">Opportunity filters</div>
          <label className="mt-2 block text-[7px] text-shafx-textMuted">Minimum expected profit</label>
          <select aria-label="Minimum expected profit" value={minExpectedProfit} onChange={(event) => setMinExpectedProfit(event.target.value)} className="mt-1 w-full rounded-lg border border-shafx-border bg-shafx-surface px-2 py-2 font-mono text-[10px]">{QUICK_MIN_PROFITS.map((value) => <option key={value} value={value}>{currency} {value.toFixed(2)}+</option>)}</select>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="border border-shafx-border bg-shafx-surface px-2 py-2">
              <span className="block text-[7px] text-shafx-textMuted">Minimum R:R</span>
              <select aria-label="Minimum risk reward" value={minRiskReward} onChange={(event) => setMinRiskReward(event.target.value)} className="mt-1 w-full bg-transparent font-mono text-[10px]">{[1, 1.5, 2, 2.5, 3].map((value) => <option key={value} value={value}>{value.toFixed(1)} : 1</option>)}</select>
            </label>
            <label className="border border-shafx-border bg-shafx-surface px-2 py-2">
              <span className="block text-[7px] text-shafx-textMuted">Signal floor</span>
              <select aria-label="Minimum signal strength" value={minSignalStrength} onChange={(event) => setMinSignalStrength(event.target.value)} className="mt-1 w-full bg-transparent font-mono text-[10px]">{[65, 70, 72, 75, 80, 85].map((value) => <option key={value} value={value}>{value}/100</option>)}</select>
            </label>
          </div>
        </div>
      </div>

      <div className={'mt-3 rounded-xl border p-3 ' + (currentAssessment.decision === 'TRADE' ? 'border-shafx-success/35 bg-shafx-success/[0.05]' : 'border-shafx-warning/30 bg-shafx-warning/[0.05]')}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[7px] uppercase tracking-[0.13em] text-shafx-textMuted">Current SHAFX decision</div>
            <div className={'mt-1 font-mono text-base font-bold ' + (currentAssessment.decision === 'TRADE' ? 'text-shafx-success' : 'text-shafx-warning')}>{decisionLabel}</div>
            <div className="mt-1 max-w-[620px] text-[8px] leading-4 text-shafx-textMuted">{currentAssessment.reason}</div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-right text-[8px]">
            <div><span className="block text-shafx-textMuted">Expected</span><b className="mt-1 block font-mono text-shafx-success">{expectedText}</b></div>
            <div><span className="block text-shafx-textMuted">R:R</span><b className="mt-1 block font-mono">{currentAssessment.riskReward > 0 ? currentAssessment.riskReward.toFixed(2) + ' : 1' : '—'}</b></div>
            <div><span className="block text-shafx-textMuted">Move</span><b className="mt-1 block font-mono">{currentAssessment.targetMovePips !== null ? currentAssessment.targetMovePips.toFixed(1) + ' pips' : '—'}</b></div>
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-shafx-border bg-shafx-bg/70 p-3">
        <div className="grid grid-cols-3 gap-2 text-[8px]">
          <div><span className="block text-shafx-textMuted">Signal TF</span><b className="mt-1 block font-mono text-[10px]">{botPlan.analysisTimeframe ?? '—'}</b></div>
          <div><span className="block text-shafx-textMuted">Entry TF</span><b className="mt-1 block font-mono text-[10px] text-shafx-accent">{botPlan.entryTimeframe ?? '—'}</b></div>
          <div><span className="block text-shafx-textMuted">Direction</span><b className={'mt-1 block text-[10px] ' + (botPlan.opportunity?.direction === 'BUY' ? 'text-shafx-success' : botPlan.opportunity?.direction === 'SELL' ? 'text-shafx-danger' : 'text-shafx-textMuted')}>{botPlan.opportunity?.direction ?? 'WAIT'}</b></div>
        </div>
        <div className="mt-2 text-[8px] leading-4 text-shafx-textMuted">{botPlan.reason}</div>
      </div>

      <div className="mt-4 grid grid-cols-5 gap-1.5">
        {rounds.map((round) => {
          const active = round.number === activeRound && running
          const tone = round.status === 'win'
            ? 'border-shafx-success/45 bg-shafx-success/10 text-shafx-success'
            : round.status === 'loss'
              ? 'border-shafx-danger/45 bg-shafx-danger/10 text-shafx-danger'
              : round.status === 'timeout'
                ? 'border-shafx-warning/45 bg-shafx-warning/10 text-shafx-warning'
                : round.status === 'monitoring'
                  ? 'border-shafx-accent/45 bg-shafx-accent/10 text-shafx-accent'
                  : round.status === 'wait'
                    ? 'border-shafx-warning/35 bg-shafx-warning/10 text-shafx-warning'
                    : 'border-shafx-border bg-shafx-bg text-shafx-textMuted'
          return (
            <div key={round.number} className={'rounded-xl border p-2.5 ' + tone + (active ? ' ring-1 ring-shafx-accent/40' : '')}>
              <div className="flex items-center justify-between">
                <span className="font-mono text-[8px] font-bold">R{round.number}</span>
                <span className="text-[7px] uppercase">{round.status === 'monitoring' ? 'LIVE' : round.status}</span>
              </div>
              <div className="mt-2 min-h-8 font-mono text-[8px] font-semibold">{round.direction ? (round.signalTimeframe ?? '—') + ' ' + round.direction : 'WAIT — hunting a worthwhile setup'}</div>
              <div className="mt-1 font-mono text-[8px] tabular-nums">{round.pnl !== undefined ? displayPnl(round.pnl) : '—'}</div>
            </div>
          )
        })}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-xl border border-shafx-border bg-shafx-bg p-2.5">
          <span className="block text-[7px] uppercase tracking-[0.12em] text-shafx-textMuted">State</span>
          <strong className="mt-1 block text-[10px]">{running ? (currentAssessment.decision === 'TRADE' ? 'READY / RUNNING' : 'WAITING') : allRoundsTraded ? 'COMPLETE' : 'READY'}</strong>
        </div>
        <div className="rounded-xl border border-shafx-border bg-shafx-bg p-2.5">
          <span className="block text-[7px] uppercase tracking-[0.12em] text-shafx-textMuted">Win / Loss</span>
          <strong className="mt-1 block font-mono text-[10px]">{wins} / {losses}</strong>
          <span className="mt-0.5 block text-[7px] text-shafx-textMuted">{timeouts} timeout</span>
        </div>
        <div className="rounded-xl border border-shafx-border bg-shafx-bg p-2.5">
          <span className="block text-[7px] uppercase tracking-[0.12em] text-shafx-textMuted">Paper Net</span>
          <strong className={'mt-1 block font-mono text-[10px] ' + (totalPnl >= 0 ? 'text-shafx-success' : 'text-shafx-danger')}>{displayPnl(totalPnl)}</strong>
        </div>
        <div className="rounded-xl border border-shafx-border bg-shafx-bg p-2.5">
          <span className="block text-[7px] uppercase tracking-[0.12em] text-shafx-textMuted">Clock</span>
          <strong className="mt-1 block font-mono text-[10px]">{running ? secondsLeft + 's' : '5s scan / 90s max hold'}</strong>
          <span className="mt-0.5 block text-[7px] text-shafx-textMuted">{direction ? 'Target/stop can close earlier.' : 'Weak setups do not consume a trade slot.'}</span>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-shafx-border bg-shafx-bg/70 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[8px] font-semibold uppercase tracking-[0.13em] text-shafx-textMuted">Current paper position</div>
            <div className="mt-1 font-mono text-[10px] font-semibold">
              {direction && entry
                ? 'HOLDING • ' + (signalTimeframe ?? '—') + ' ' + direction
                : currentAssessment.decision === 'TRADE'
                  ? 'READY — qualified opportunity'
                  : 'WAIT — SHAFX is filtering out low-value setups'}
            </div>
          </div>
          {entry && <div className="font-mono text-[8px] text-shafx-textMuted">Entry {entry.toFixed(5)}</div>}
        </div>
        <div className="mt-2 text-[8px] leading-4 text-shafx-textMuted">
          SHAFX STANDARD is a simulation using conventional Forex-style lot P/L. DERIV MULTIPLIER mode is also paper-only and uses the real percentage-move × multiplier × stake formula. Neither mode places a broker order. Live Deriv execution remains in the separate Manual Trade ticket.
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        {!running ? (
          <button type="button" onClick={startUnit} className="flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-shafx-accent px-3 text-[9px] font-bold text-white hover:bg-shafx-accent/90">
            <Play className="h-3.5 w-3.5" />
            START SMART 5-SLOT PAPER RUN
          </button>
        ) : (
          <button type="button" onClick={stopUnit} className="flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-shafx-danger/30 bg-shafx-danger/10 px-3 text-[9px] font-bold text-shafx-danger">
            <CircleStop className="h-3.5 w-3.5" />
            STOP RUN
          </button>
        )}
        <button type="button" onClick={resetUnit} className="min-h-10 rounded-xl border border-shafx-border px-3 text-[9px] font-semibold text-shafx-textMuted hover:text-shafx-text">
          <RotateCcw className="mr-1.5 inline-block h-3.5 w-3.5" />
          RESET
        </button>
      </div>
    </section>
  )
}
