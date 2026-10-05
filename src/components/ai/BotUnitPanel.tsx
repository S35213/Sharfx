import React, { useEffect, useMemo, useRef, useState } from 'react'
import { CircleStop, Play, RotateCcw, ShieldCheck } from 'lucide-react'
import type { BotPaperTrade, Timeframe } from '../../types'
import type { SignalRadarResult } from '../../engine/bot/signalRadar'

type RoundStatus = 'idle' | 'monitoring' | 'win' | 'loss' | 'wait'

interface RoundState {
  number: number
  status: RoundStatus
  direction?: 'BUY' | 'SELL'
  signalTimeframe?: Timeframe
  entryTimeframe?: Timeframe
  entry?: number
  exit?: number
  pnl?: number
  openedAt?: string
}

const UNIT_ROUNDS = 5
const ROUND_SECONDS = 10
const DEFAULT_STAKE = 10
const DEFAULT_MULTIPLIER = 100
const QUICK_STAKES = [10, 20, 50, 100, 250, 500]
const QUICK_MULTIPLIERS = [100, 200, 300, 500, 800]

const createRounds = (): RoundState[] =>
  Array.from({ length: UNIT_ROUNDS }, (_, index) => ({ number: index + 1, status: 'idle' }))

const clampLoss = (value: number, stake: number): number => Math.max(-stake, value)

const paperPnl = (
  direction: 'BUY' | 'SELL',
  entry: number,
  exit: number,
  stake: number,
  multiplier: number,
): number => {
  if (![entry, exit, stake, multiplier].every(Number.isFinite) || entry <= 0 || exit <= 0 || stake <= 0 || multiplier <= 0) return 0
  const move = (exit - entry) / entry
  const signedMove = direction === 'BUY' ? move : -move
  return Number(clampLoss(stake * multiplier * signedMove, stake).toFixed(4))
}

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

const roundRoute = (round: RoundState): string => {
  if (!round.direction) return 'WAIT'
  const signal = round.signalTimeframe ?? '—'
  const entry = round.entryTimeframe ?? signal
  return signal === entry ? signal + ' ' + round.direction : signal + ' → ' + entry + ' ' + round.direction
}

export const BotUnitPanel: React.FC<Props> = ({ symbol, currency, radar, currentPrice, onPaperRoundClosed }) => {
  const [rounds, setRounds] = useState<RoundState[]>(createRounds)
  const [running, setRunning] = useState(false)
  const [activeRound, setActiveRound] = useState(0)
  const [secondsLeft, setSecondsLeft] = useState(ROUND_SECONDS)
  const [entry, setEntry] = useState<number | null>(null)
  const [direction, setDirection] = useState<'BUY' | 'SELL' | null>(null)
  const [signalTimeframe, setSignalTimeframe] = useState<Timeframe | null>(null)
  const [entryTimeframe, setEntryTimeframe] = useState<Timeframe | null>(null)
  const [paperStake, setPaperStake] = useState(String(DEFAULT_STAKE))
  const [paperMultiplier, setPaperMultiplier] = useState(String(DEFAULT_MULTIPLIER))
  const timerRef = useRef<number | null>(null)
  const settledRoundRef = useRef(0)

  const stakeValue = Number(paperStake)
  const multiplierValue = Number(paperMultiplier)
  const safeStake = Number.isFinite(stakeValue) && stakeValue > 0 ? stakeValue : DEFAULT_STAKE
  const safeMultiplier = Number.isFinite(multiplierValue) && multiplierValue > 0 ? multiplierValue : DEFAULT_MULTIPLIER

  const totalPnl = useMemo(
    () => Number(rounds.reduce((sum, round) => sum + (round.pnl ?? 0), 0).toFixed(4)),
    [rounds],
  )

  const completed = rounds.filter((round) => ['win', 'loss', 'wait'].includes(round.status)).length
  const wins = rounds.filter((round) => round.status === 'win').length
  const losses = rounds.filter((round) => round.status === 'loss').length
  const botPlan = radar.botPlan

  const clearTimer = (): void => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current)
    timerRef.current = null
  }

  const beginRound = (roundNumber: number): void => {
    const opportunity = radar.botPlan.opportunity
    const nextDirection = opportunity?.direction ?? null
    const nextSignalTimeframe = radar.botPlan.analysisTimeframe
    const nextEntryTimeframe = radar.botPlan.entryTimeframe
    const nextEntry = Number.isFinite(currentPrice) && currentPrice > 0 ? currentPrice : null
    const openedAt = new Date().toISOString()

    setActiveRound(roundNumber)
    setSecondsLeft(ROUND_SECONDS)
    setEntry(nextEntry)
    setDirection(nextDirection)
    setSignalTimeframe(nextSignalTimeframe)
    setEntryTimeframe(nextEntryTimeframe)
    setRounds((current) => current.map((round) => round.number === roundNumber
      ? {
          ...round,
          status: nextDirection && nextEntry ? 'monitoring' : 'wait',
          direction: nextDirection ?? undefined,
          signalTimeframe: nextSignalTimeframe ?? undefined,
          entryTimeframe: nextEntryTimeframe ?? undefined,
          entry: nextEntry ?? undefined,
          pnl: undefined,
          exit: undefined,
          openedAt,
        }
      : round))
  }

  const startUnit = (): void => {
    if (!Number.isFinite(stakeValue) || stakeValue < 1 || !Number.isFinite(multiplierValue) || multiplierValue < 1) return
    clearTimer()
    settledRoundRef.current = 0
    setRounds(createRounds())
    setRunning(true)
    beginRound(1)
  }

  const stopUnit = (): void => {
    clearTimer()
    setRunning(false)
    setSecondsLeft(ROUND_SECONDS)
  }

  const resetUnit = (): void => {
    stopUnit()
    settledRoundRef.current = 0
    setRounds(createRounds())
    setActiveRound(0)
    setEntry(null)
    setDirection(null)
    setSignalTimeframe(null)
    setEntryTimeframe(null)
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
    if (!running || activeRound <= 0 || secondsLeft > 0 || settledRoundRef.current === activeRound) return

    settledRoundRef.current = activeRound
    const currentEntry = entry
    const currentDirection = direction
    const pnl = currentEntry && currentDirection
      ? paperPnl(currentDirection, currentEntry, currentPrice, safeStake, safeMultiplier)
      : 0
    const nextStatus: RoundStatus = currentDirection
      ? pnl > 0 ? 'win' : pnl < 0 ? 'loss' : 'wait'
      : 'wait'
    const closedAt = new Date().toISOString()

    setRounds((current) => current.map((round) => round.number === activeRound
      ? { ...round, status: nextStatus, exit: currentPrice, pnl }
      : round))

    onPaperRoundClosed?.({
      id: 'bot-paper-' + Date.now() + '-' + activeRound,
      symbol,
      round: activeRound,
      direction: currentDirection,
      signalTimeframe,
      entryTimeframe,
      entry: currentEntry,
      exit: Number.isFinite(currentPrice) && currentPrice > 0 ? currentPrice : null,
      stake: safeStake,
      multiplier: safeMultiplier,
      pnl,
      status: nextStatus,
      openTime: rounds.find((round) => round.number === activeRound)?.openedAt ?? closedAt,
      closeTime: closedAt,
    })

    if (activeRound >= UNIT_ROUNDS) {
      clearTimer()
      setRunning(false)
      return
    }

    const nextRound = activeRound + 1
    const timeout = window.setTimeout(() => beginRound(nextRound), 150)
    return () => window.clearTimeout(timeout)
  }, [activeRound, currentPrice, direction, entry, entryTimeframe, onPaperRoundClosed, radar.botPlan, rounds, safeMultiplier, safeStake, secondsLeft, signalTimeframe, symbol, running])

  useEffect(() => () => clearTimer(), [])

  return (
    <section className="rounded-2xl border border-shafx-border bg-shafx-surface p-4 shadow-[0_14px_36px_rgba(0,0,0,.14)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-shafx-accent" />
            <h4 className="text-sm font-semibold">SHAFX 5-Round Unit</h4>
            <span className="rounded-md border border-shafx-success/25 bg-shafx-success/10 px-2 py-0.5 font-mono text-[7px] font-bold tracking-[0.12em] text-shafx-success">PAPER TEST</span>
            <span className="rounded-md border border-shafx-accent/25 bg-shafx-accent/10 px-2 py-0.5 font-mono text-[7px] font-bold tracking-[0.12em] text-shafx-accent">FAST ADAPTIVE</span>
          </div>
          <p className="mt-1 max-w-[600px] text-[9px] leading-4 text-shafx-textMuted">
            Scans all available timeframes. It does not blindly trade M1: higher-timeframe structure selects the setup, then a faster timeframe is used only for the entry trigger.
          </p>
        </div>
        <div className="text-right">
          <div className="font-mono text-[8px] text-shafx-textMuted">ROUND</div>
          <div className="mt-0.5 font-mono text-lg font-bold">{activeRound || '—'} / {UNIT_ROUNDS}</div>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-shafx-border bg-shafx-bg/70 p-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div>
            <span className="block text-[7px] uppercase tracking-[0.12em] text-shafx-textMuted">Paper stake • {currency}</span>
            <input
              aria-label="Bot paper stake"
              type="number"
              min="1"
              max="2000"
              step="1"
              value={paperStake}
              onChange={(event) => setPaperStake(event.target.value)}
              className="mt-1 w-full rounded-lg border border-shafx-border bg-shafx-surface px-2 py-2 font-mono text-xs outline-none focus:border-shafx-accent"
            />
            <div className="mt-1 flex gap-1 overflow-x-auto">
              {QUICK_STAKES.map((value) => (
                <button key={value} type="button" onClick={() => setPaperStake(String(value))} className={'border px-1.5 py-1 font-mono text-[7px] ' + (Number(paperStake) === value ? 'border-shafx-accent/40 bg-shafx-accent/10 text-shafx-accent' : 'border-shafx-border text-shafx-textMuted')}>
                  {value}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="block text-[7px] uppercase tracking-[0.12em] text-shafx-textMuted">Multiplier</span>
            <select aria-label="Bot paper multiplier" value={paperMultiplier} onChange={(event) => setPaperMultiplier(event.target.value)} className="mt-1 w-full rounded-lg border border-shafx-border bg-shafx-surface px-2 py-2 font-mono text-xs outline-none focus:border-shafx-accent">
              {QUICK_MULTIPLIERS.map((value) => <option key={value} value={value}>{value}×</option>)}
            </select>
          </div>
          <div>
            <span className="block text-[7px] uppercase tracking-[0.12em] text-shafx-textMuted">Max paper loss</span>
            <div className="mt-1 rounded-lg border border-shafx-border bg-shafx-surface px-2 py-2 font-mono text-xs">{currency} {safeStake.toFixed(2)}</div>
            <div className="mt-1 text-[7px] text-shafx-textMuted">Loss is capped at the selected paper stake.</div>
          </div>
          <div>
            <span className="block text-[7px] uppercase tracking-[0.12em] text-shafx-textMuted">Exposure</span>
            <div className="mt-1 rounded-lg border border-shafx-border bg-shafx-surface px-2 py-2 font-mono text-xs">{(safeStake * safeMultiplier).toFixed(0)}×</div>
            <div className="mt-1 text-[7px] text-shafx-textMuted">Paper calculation is before any live Deriv commission.</div>
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
              <div className="mt-2 min-h-8 font-mono text-[8px] font-semibold">{roundRoute(round)}</div>
              <div className="mt-1 font-mono text-[8px] tabular-nums">{round.pnl !== undefined ? displayPnl(round.pnl) : '—'}</div>
            </div>
          )
        })}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-xl border border-shafx-border bg-shafx-bg p-2.5">
          <span className="block text-[7px] uppercase tracking-[0.12em] text-shafx-textMuted">State</span>
          <strong className="mt-1 block text-[10px]">{running ? 'RUNNING' : completed === UNIT_ROUNDS ? 'COMPLETE' : 'READY'}</strong>
        </div>
        <div className="rounded-xl border border-shafx-border bg-shafx-bg p-2.5">
          <span className="block text-[7px] uppercase tracking-[0.12em] text-shafx-textMuted">Win / Loss</span>
          <strong className="mt-1 block font-mono text-[10px]">{wins} / {losses}</strong>
        </div>
        <div className="rounded-xl border border-shafx-border bg-shafx-bg p-2.5">
          <span className="block text-[7px] uppercase tracking-[0.12em] text-shafx-textMuted">Paper Net</span>
          <strong className={'mt-1 block font-mono text-[10px] ' + (totalPnl >= 0 ? 'text-shafx-success' : 'text-shafx-danger')}>{displayPnl(totalPnl)}</strong>
        </div>
        <div className="rounded-xl border border-shafx-border bg-shafx-bg p-2.5">
          <span className="block text-[7px] uppercase tracking-[0.12em] text-shafx-textMuted">Round clock</span>
          <strong className="mt-1 block font-mono text-[10px]">{running ? secondsLeft + 's' : '10s'}</strong>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-shafx-border bg-shafx-bg/70 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[8px] font-semibold uppercase tracking-[0.13em] text-shafx-textMuted">Current paper decision</div>
            <div className="mt-1 font-mono text-[10px] font-semibold">{direction ? roundRoute({ number: activeRound, status: 'monitoring', direction, signalTimeframe: signalTimeframe ?? undefined, entryTimeframe: entryTimeframe ?? undefined }) : 'WAIT — scanning the strongest SHAFX setup'}</div>
          </div>
          {entry && <div className="font-mono text-[8px] text-shafx-textMuted">Entry {entry.toFixed(5)}</div>}
        </div>
        <div className="mt-2 text-[8px] leading-4 text-shafx-textMuted">
          The five-round unit is a paper test. It never sends a broker order. Its live Deriv counterpart will still be governed by the manual proposal/confirmation path.
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        {!running ? (
          <button type="button" onClick={startUnit} className="flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-shafx-accent px-3 text-[9px] font-bold text-white hover:bg-shafx-accent/90">
            <Play className="h-3.5 w-3.5" />
            START 5-ROUND PAPER UNIT
          </button>
        ) : (
          <button type="button" onClick={stopUnit} className="flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-shafx-danger/30 bg-shafx-danger/10 px-3 text-[9px] font-bold text-shafx-danger">
            <CircleStop className="h-3.5 w-3.5" />
            STOP UNIT
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
