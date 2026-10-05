import React, { useEffect, useMemo, useRef, useState } from 'react'
import { CircleStop, Play, RotateCcw, ShieldCheck } from 'lucide-react'
import type { Timeframe } from '../../types'
import type { SignalRadarResult } from '../../engine/bot/signalRadar'

type RoundStatus = 'idle' | 'monitoring' | 'win' | 'loss' | 'wait'

interface RoundState {
  number: number
  status: RoundStatus
  direction?: 'BUY' | 'SELL'
  timeframe?: Timeframe
  entry?: number
  exit?: number
  pnl?: number
}

const UNIT_ROUNDS = 5
const ROUND_SECONDS = 10
const PAPER_STAKE = 10
const PAPER_MULTIPLIER = 100

const createRounds = (): RoundState[] =>
  Array.from({ length: UNIT_ROUNDS }, (_, index) => ({ number: index + 1, status: 'idle' }))

const clampLoss = (value: number): number => Math.max(-PAPER_STAKE, value)

const paperPnl = (direction: 'BUY' | 'SELL', entry: number, exit: number): number => {
  if (!Number.isFinite(entry) || entry <= 0 || !Number.isFinite(exit) || exit <= 0) return 0
  const move = (exit - entry) / entry
  const signedMove = direction === 'BUY' ? move : -move
  return Number(clampLoss(PAPER_STAKE * PAPER_MULTIPLIER * signedMove).toFixed(4))
}

interface Props {
  radar: SignalRadarResult
  currentPrice: number
}

export const BotUnitPanel: React.FC<Props> = ({ radar, currentPrice }) => {
  const [rounds, setRounds] = useState<RoundState[]>(createRounds)
  const [running, setRunning] = useState(false)
  const [activeRound, setActiveRound] = useState(0)
  const [secondsLeft, setSecondsLeft] = useState(ROUND_SECONDS)
  const [entry, setEntry] = useState<number | null>(null)
  const [direction, setDirection] = useState<'BUY' | 'SELL' | null>(null)
  const [timeframe, setTimeframe] = useState<Timeframe | null>(null)
  const timerRef = useRef<number | null>(null)

  const totalPnl = useMemo(
    () => Number(rounds.reduce((sum, round) => sum + (round.pnl ?? 0), 0).toFixed(4)),
    [rounds],
  )

  const completed = rounds.filter((round) => ['win', 'loss', 'wait'].includes(round.status)).length
  const wins = rounds.filter((round) => round.status === 'win').length
  const losses = rounds.filter((round) => round.status === 'loss').length

  const clearTimer = (): void => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current)
    timerRef.current = null
  }

  const beginRound = (roundNumber: number): void => {
    const opportunity = radar.opportunities[0] ?? null
    const nextDirection = opportunity?.direction ?? null
    const nextTimeframe = opportunity?.timeframe ?? null
    const nextEntry = Number.isFinite(currentPrice) && currentPrice > 0 ? currentPrice : null

    setActiveRound(roundNumber)
    setSecondsLeft(ROUND_SECONDS)
    setEntry(nextEntry)
    setDirection(nextDirection)
    setTimeframe(nextTimeframe)
    setRounds((current) => current.map((round) => round.number === roundNumber
      ? {
          ...round,
          status: nextDirection && nextEntry ? 'monitoring' : 'wait',
          direction: nextDirection ?? undefined,
          timeframe: nextTimeframe ?? undefined,
          entry: nextEntry ?? undefined,
          pnl: undefined,
          exit: undefined,
        }
      : round))
  }

  const startUnit = (): void => {
    clearTimer()
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
    setRounds(createRounds())
    setActiveRound(0)
    setEntry(null)
    setDirection(null)
    setTimeframe(null)
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
    if (!running || activeRound <= 0 || secondsLeft > 0) return

    const currentEntry = entry
    const currentDirection = direction

    if (currentEntry && currentDirection) {
      const pnl = paperPnl(currentDirection, currentEntry, currentPrice)
      setRounds((current) => current.map((round) => round.number === activeRound
        ? {
            ...round,
            status: pnl > 0 ? 'win' : pnl < 0 ? 'loss' : 'wait',
            exit: currentPrice,
            pnl,
          }
        : round))
    }

    if (activeRound >= UNIT_ROUNDS) {
      clearTimer()
      setRunning(false)
      return
    }

    const nextRound = activeRound + 1
    const timeout = window.setTimeout(() => beginRound(nextRound), 150)
    return () => window.clearTimeout(timeout)
  }, [activeRound, currentPrice, direction, entry, running, secondsLeft])

  useEffect(() => () => clearTimer(), [])

  return (
    <section className="rounded-2xl border border-shafx-border bg-shafx-surface p-4 shadow-[0_14px_36px_rgba(0,0,0,.14)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-shafx-accent" />
            <h4 className="text-sm font-semibold">SHAFX 5-Round Unit</h4>
            <span className="rounded-md border border-shafx-success/25 bg-shafx-success/10 px-2 py-0.5 font-mono text-[7px] font-bold tracking-[0.12em] text-shafx-success">PAPER TEST</span>
          </div>
          <p className="mt-1 max-w-[520px] text-[9px] leading-4 text-shafx-textMuted">
            Same scan → decision → monitor → result rhythm as the rebuilt bot, but this preview never sends a broker order.
          </p>
        </div>
        <div className="text-right">
          <div className="font-mono text-[8px] text-shafx-textMuted">ROUND</div>
          <div className="mt-0.5 font-mono text-lg font-bold">{activeRound || '—'} / {UNIT_ROUNDS}</div>
        </div>
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
              <div className="mt-2 min-h-8 font-mono text-[8px] font-semibold">
                {round.direction ? round.direction + ' ' + (round.timeframe ?? '') : 'WAIT'}
              </div>
              <div className="mt-1 font-mono text-[8px] tabular-nums">
                {round.pnl !== undefined ? (round.pnl >= 0 ? '+' : '') + round.pnl.toFixed(4) : '—'}
              </div>
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
          <strong className={'mt-1 block font-mono text-[10px] ' + (totalPnl >= 0 ? 'text-shafx-success' : 'text-shafx-danger')}>{totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(4)}</strong>
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
            <div className="mt-1 font-mono text-[10px] font-semibold">
              {direction ? direction + ' • ' + (timeframe ?? '—') : 'WAIT — scanning the strongest SHAFX setup'}
            </div>
          </div>
          {entry && <div className="font-mono text-[8px] text-shafx-textMuted">Entry {entry.toFixed(5)}</div>}
        </div>
        <div className="mt-2 text-[8px] leading-4 text-shafx-textMuted">
          Paper calculation uses the same multiplier relationship for demonstration: stake × multiplier × percentage move. The live Deriv contract P/L remains broker-authoritative.
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
