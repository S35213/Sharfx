import React, { useEffect, useMemo, useRef, useState } from 'react'
import { CircleStop, Play, RotateCcw, ShieldCheck } from 'lucide-react'
import type { BotPaperTrade, Timeframe } from '../../types'
import type { SignalRadarResult } from '../../engine/bot/signalRadar'
import { calculateMultiplierPnl } from '../../lib/derivMultiplierAccounting'

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
  targetAmount?: number
  stopAmount?: number
  openedAt?: string
}

const UNIT_ROUNDS = 5
const ROUND_SECONDS = 15
const DEFAULT_STAKE = 10
const DEFAULT_MULTIPLIER = 100
const QUICK_STAKES = [10, 20, 50, 100, 250, 500, 1000, 2000]
const QUICK_MULTIPLIERS = [100, 200, 300, 500, 800]
const DEFAULT_TAKE_PROFIT_RATIO = 0.5
const DEFAULT_STOP_LOSS_RATIO = 0.4

const createRounds = (): RoundState[] =>
  Array.from({ length: UNIT_ROUNDS }, (_, index) => ({ number: index + 1, status: 'idle' }))

const targetReached = (pnl: number, targetAmount: number, stopAmount: number): boolean =>
  pnl >= targetAmount || pnl <= -Math.abs(stopAmount)

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
  const [scanCount, setScanCount] = useState(0)
  const [entry, setEntry] = useState<number | null>(null)
  const [direction, setDirection] = useState<'BUY' | 'SELL' | null>(null)
  const [signalTimeframe, setSignalTimeframe] = useState<Timeframe | null>(null)
  const [entryTimeframe, setEntryTimeframe] = useState<Timeframe | null>(null)
  const [paperStake, setPaperStake] = useState(String(DEFAULT_STAKE))
  const [paperMultiplier, setPaperMultiplier] = useState(String(DEFAULT_MULTIPLIER))
  const timerRef = useRef<number | null>(null)
  const settledRoundRef = useRef(0)
  const roundOpenedAtRef = useRef<Record<number, string>>({})

  const stakeValue = Number(paperStake)
  const multiplierValue = Number(paperMultiplier)
  const safeStake = Number.isFinite(stakeValue) && stakeValue > 0 ? stakeValue : DEFAULT_STAKE
  const safeMultiplier = Number.isFinite(multiplierValue) && multiplierValue > 0 ? multiplierValue : DEFAULT_MULTIPLIER
  const safeTargetRatio = DEFAULT_TAKE_PROFIT_RATIO
  const safeStopRatio = DEFAULT_STOP_LOSS_RATIO
  const targetAmount = Number((safeStake * safeTargetRatio).toFixed(2))
  const stopAmount = Number((safeStake * safeStopRatio).toFixed(2))

  const latestRadarRef = useRef(radar)
  const latestPriceRef = useRef(currentPrice)
  const latestStakeRef = useRef(safeStake)
  const latestMultiplierRef = useRef(safeMultiplier)
  const latestEntryRef = useRef(entry)
  const latestDirectionRef = useRef(direction)
  const latestSignalTimeframeRef = useRef(signalTimeframe)
  const latestEntryTimeframeRef = useRef(entryTimeframe)
  const latestCallbackRef = useRef(onPaperRoundClosed)
  const latestTargetAmountRef = useRef(targetAmount)
  const latestStopAmountRef = useRef(stopAmount)
  useEffect(() => { latestRadarRef.current = radar }, [radar])
  useEffect(() => { latestPriceRef.current = currentPrice }, [currentPrice])
  useEffect(() => { latestStakeRef.current = safeStake }, [safeStake])
  useEffect(() => { latestMultiplierRef.current = safeMultiplier }, [safeMultiplier])
  useEffect(() => { latestEntryRef.current = entry }, [entry])
  useEffect(() => { latestDirectionRef.current = direction }, [direction])
  useEffect(() => { latestSignalTimeframeRef.current = signalTimeframe }, [signalTimeframe])
  useEffect(() => { latestEntryTimeframeRef.current = entryTimeframe }, [entryTimeframe])
  useEffect(() => { latestCallbackRef.current = onPaperRoundClosed }, [onPaperRoundClosed])
  useEffect(() => { latestTargetAmountRef.current = targetAmount }, [targetAmount])
  useEffect(() => { latestStopAmountRef.current = stopAmount }, [stopAmount])

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
    const plan = latestRadarRef.current.botPlan
    const opportunity = plan.opportunity
    const nextDirection = opportunity?.direction ?? null
    const nextSignalTimeframe = plan.analysisTimeframe
    const nextEntryTimeframe = plan.entryTimeframe
    const nextEntry = Number.isFinite(latestPriceRef.current) && latestPriceRef.current > 0 ? latestPriceRef.current : null
    const openedAt = new Date().toISOString()
    roundOpenedAtRef.current[roundNumber] = openedAt

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
          targetAmount,
          stopAmount,
          openedAt,
        }
      : round))
  }

  const startUnit = (): void => {
    if (!Number.isFinite(stakeValue) || stakeValue < 1 || !Number.isFinite(multiplierValue) || multiplierValue < 1) return
    clearTimer()
    settledRoundRef.current = 0
    setScanCount(0)
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
    setScanCount(0)
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
    if (!running || activeRound <= 0) return

    const currentEntry = latestEntryRef.current
    const currentDirection = latestDirectionRef.current
    const livePrice = latestPriceRef.current
    const stake = latestStakeRef.current
    const multiplier = latestMultiplierRef.current
    const target = latestTargetAmountRef.current
    const stop = latestStopAmountRef.current
    const signalTf = latestSignalTimeframeRef.current
    const entryTf = latestEntryTimeframeRef.current
    const pnl = currentEntry && currentDirection
      ? calculateMultiplierPnl({ direction: currentDirection, entryPrice: currentEntry, currentPrice: livePrice, stake, multiplier })
      : 0

    // 15 seconds is the scan interval, not the forced close time. Keep the
    // paper position alive until its dollar target/stop is reached.
    if (currentDirection && currentEntry && targetReached(pnl, target, stop)) {
      if (settledRoundRef.current === activeRound) return
      settledRoundRef.current = activeRound
      const nextStatus: RoundStatus = pnl > 0 ? 'win' : pnl < 0 ? 'loss' : 'wait'
      const closedAt = new Date().toISOString()

      setRounds((current) => current.map((round) => round.number === activeRound
        ? { ...round, status: nextStatus, exit: livePrice, pnl }
        : round))

      latestCallbackRef.current?.({
        id: 'bot-paper-' + Date.now() + '-' + activeRound,
        symbol,
        round: activeRound,
        direction: currentDirection,
        signalTimeframe: signalTf,
        entryTimeframe: entryTf,
        entry: currentEntry,
        exit: Number.isFinite(livePrice) && livePrice > 0 ? livePrice : null,
        stake,
        multiplier,
        pnl,
        status: nextStatus,
        openTime: roundOpenedAtRef.current[activeRound] ?? closedAt,
        closeTime: closedAt,
      })

      if (activeRound >= UNIT_ROUNDS) {
        clearTimer()
        setRunning(false)
        return
      }

      const nextRound = activeRound + 1
      window.setTimeout(() => {
        if (!running) return
        beginRound(nextRound)
      }, 100)
      return
    }

    if (secondsLeft <= 0) {
      const refreshedPlan = latestRadarRef.current.botPlan
      const stillAligned = Boolean(currentDirection && refreshedPlan.opportunity?.direction === currentDirection)

      if (!currentDirection || !currentEntry || !stillAligned) {
        if (settledRoundRef.current === activeRound) return
        settledRoundRef.current = activeRound
        const closedAt = new Date().toISOString()
        const nextStatus: RoundStatus = currentDirection && pnl > 0 ? 'win' : currentDirection && pnl < 0 ? 'loss' : 'wait'

        setRounds((current) => current.map((round) => round.number === activeRound
          ? { ...round, status: nextStatus, exit: currentDirection ? livePrice : undefined, pnl: currentDirection ? pnl : 0 }
          : round))

        latestCallbackRef.current?.({
          id: 'bot-paper-' + Date.now() + '-' + activeRound,
          symbol,
          round: activeRound,
          direction: currentDirection,
          signalTimeframe: signalTf,
          entryTimeframe: entryTf,
          entry: currentEntry,
          exit: currentDirection && Number.isFinite(livePrice) && livePrice > 0 ? livePrice : null,
          stake,
          multiplier,
          pnl: currentDirection ? pnl : 0,
          status: nextStatus,
          openTime: roundOpenedAtRef.current[activeRound] ?? closedAt,
          closeTime: closedAt,
        })

        if (activeRound >= UNIT_ROUNDS) {
          clearTimer()
          setRunning(false)
          return
        }

        const nextRound = activeRound + 1
        window.setTimeout(() => {
          if (!running) return
          beginRound(nextRound)
        }, 100)
        return
      }

      // Still aligned: keep the same paper position open. Every 15-second
      // interval is a real re-scan, and we surface the live P/L so the bot
      // visibly updates instead of looking frozen while the round remains open.
      setScanCount((value) => value + 1)
      setRounds((current) => current.map((round) => round.number === activeRound
        ? { ...round, pnl }
        : round))
      setSecondsLeft(ROUND_SECONDS)
    }
  }, [activeRound, currentPrice, running, secondsLeft])

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
            Scans all available timeframes. It does not blindly trade M1: higher-timeframe structure selects the setup, then a faster timeframe is used only for the entry trigger. Each scan cycle runs for 15 seconds and is re-evaluated before the next round.
          </p>
        </div>
        <div className="text-right">
          <div className="font-mono text-[8px] text-shafx-textMuted">ROUND</div>
          <div className="mt-0.5 font-mono text-lg font-bold">{activeRound || '—'} / {UNIT_ROUNDS}</div>
          <div className="mt-1 font-mono text-[7px] text-shafx-textMuted">RE-SCAN #{scanCount}</div>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-shafx-border bg-shafx-bg/70 p-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div>
            <span className="block text-[7px] uppercase tracking-[0.12em] text-shafx-textMuted">Paper stake • {currency}</span>
            <input
              aria-label="Bot paper stake"
              type="number"
              min="10"
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
        <div className="mt-2 grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-shafx-success/20 bg-shafx-success/[0.04] p-2">
            <span className="block text-[7px] uppercase tracking-[0.12em] text-shafx-textMuted">Fast target</span>
            <div className="mt-1 font-mono text-[10px] font-semibold text-shafx-success">{currency} +{targetAmount.toFixed(2)}</div>
            <div className="mt-0.5 text-[7px] text-shafx-textMuted">{Math.round(safeTargetRatio * 100)}% of stake</div>
          </div>
          <div className="rounded-lg border border-shafx-danger/20 bg-shafx-danger/[0.04] p-2">
            <span className="block text-[7px] uppercase tracking-[0.12em] text-shafx-textMuted">Fast stop</span>
            <div className="mt-1 font-mono text-[10px] font-semibold text-shafx-danger">−{currency} {stopAmount.toFixed(2)}</div>
            <div className="mt-0.5 text-[7px] text-shafx-textMuted">{Math.round(safeStopRatio * 100)}% of stake</div>
          </div>
          <div className="rounded-lg border border-shafx-border bg-shafx-bg p-2">
            <span className="block text-[7px] uppercase tracking-[0.12em] text-shafx-textMuted">Live P/L</span>
            <div className={'mt-1 font-mono text-[10px] font-semibold ' + (direction && entry ? (calculateMultiplierPnl({ direction, entryPrice: entry, currentPrice, stake: safeStake, multiplier: safeMultiplier }) >= 0 ? 'text-shafx-success' : 'text-shafx-danger') : 'text-shafx-textMuted')}>
              {direction && entry ? displayPnl(calculateMultiplierPnl({ direction, entryPrice: entry, currentPrice, stake: safeStake, multiplier: safeMultiplier })) : '—'}
            </div>
            <div className="mt-0.5 text-[7px] text-shafx-textMuted">Updates with market ticks</div>
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
          <strong className="mt-1 block font-mono text-[10px]">{running ? secondsLeft + 's' : '15s'}</strong>
          <span className="mt-0.5 block text-[7px] text-shafx-textMuted">re-scan interval</span>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-shafx-border bg-shafx-bg/70 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[8px] font-semibold uppercase tracking-[0.13em] text-shafx-textMuted">Current paper decision</div>
            <div className="mt-1 font-mono text-[10px] font-semibold">{direction ? 'HOLDING • ' + roundRoute({ number: activeRound, status: 'monitoring', direction, signalTimeframe: signalTimeframe ?? undefined, entryTimeframe: entryTimeframe ?? undefined }) : 'WAIT — scanning the strongest SHAFX setup'}</div>
          </div>
          {entry && <div className="font-mono text-[8px] text-shafx-textMuted">Entry {entry.toFixed(5)}</div>}
        </div>
        <div className="mt-2 text-[8px] leading-4 text-shafx-textMuted">
          The five-round unit is a paper test. It never sends a broker order. It uses the same percentage-move × multiplier × stake formula as a Deriv Multiplier calculation. The 15-second clock is only a re-scan interval; the paper trade stays open until its fast dollar target/stop is reached.
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
