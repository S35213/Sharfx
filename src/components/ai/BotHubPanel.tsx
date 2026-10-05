import { useEffect, useMemo, useState } from 'react'
import { ArrowDownRight, ArrowUpRight, Bot, CircleDot, Pause, Play, Radar, ShieldCheck, Square } from 'lucide-react'
import { useMultiTimeframeCandles } from '../../engine/agent/loadMultiTimeframe'
import { buildSignalRadar, RADAR_TIMEFRAMES, type SignalRadarOpportunity } from '../../engine/bot/signalRadar'
import type { OHLCV, SymbolSpec, Timeframe } from '../../types'
import type { SetupCandidate } from '../../engine/setup/types'

interface BotRunRound {
  round_number: number
  status: string
  signal_direction?: 'BUY' | 'SELL' | 'WAIT' | null
  signal_strength?: number | null
  signal_timeframe?: string | null
  profit?: number | null
}

interface BotRun {
  id: string
  symbol: string
  stake: number
  multiplierMode: 'auto' | 'manual'
  multiplier: number | null
  currentRound: number
  completedRounds: number
  status: string
  totalProfit: number
  totalLoss: number
  netProfit: number
  rounds: BotRunRound[]
}

interface Props {
  symbol: string
  timeframe: Timeframe
  candles: OHLCV[]
  currentPrice: number
  accountBalance: number
  accountCurrency: string
  derivConnectionId?: string
  derivAccountId?: string
  derivEnvironment?: 'demo' | 'live'
  symbolSpec?: SymbolSpec | null
  onReviewSetup?: (setup?: SetupCandidate | null) => void
  scanM1Candles?: OHLCV[]
}

type Tab = 'radar' | 'autopilot'

const directionLabel = (direction: 'BUY' | 'SELL'): string => direction === 'BUY' ? 'BUY UP' : 'SELL DOWN'

const StatusPill = ({ state }: { state: string }) => {
  const live = ['open', 'buying', 'scanning', 'waiting', 'closing'].includes(state)
  return <span className={'rounded-full border px-2 py-1 font-mono text-[7px] font-bold uppercase tracking-[0.13em] ' + (live ? 'border-shafx-accent/30 bg-shafx-accent/10 text-shafx-accent' : 'border-shafx-border bg-shafx-bg text-shafx-textMuted')}>{state.replaceAll('_', ' ')}</span>
}

function SignalCore({ opportunity }: { opportunity: SignalRadarOpportunity | null }) {
  const strength = opportunity?.signalStrength ?? 0
  return (
    <div className="relative mx-auto h-28 w-28 shrink-0">
      <div className="absolute inset-0 rounded-full border border-shafx-border bg-shafx-bg shadow-[0_0_0_10px_rgba(255,255,255,.015)]" />
      <div
        className="absolute inset-1 rounded-full"
        style={{ background: 'conic-gradient(#3b82f6 ' + strength + '%, rgba(255,255,255,.06) 0)' }}
      />
      <div className="absolute inset-[8px] rounded-full bg-[#080c12] ring-1 ring-inset ring-white/5">
        <div className="flex h-full flex-col items-center justify-center text-center">
          {opportunity ? (
            <>
              {opportunity.direction === 'BUY' ? <ArrowUpRight className="mb-0.5 h-4 w-4 text-shafx-success" /> : <ArrowDownRight className="mb-0.5 h-4 w-4 text-shafx-danger" />}
              <div className="font-mono text-lg font-black tabular-nums">{strength}</div>
              <div className="font-mono text-[7px] font-bold uppercase tracking-[0.14em] text-shafx-textMuted">{opportunity.timeframe}</div>
            </>
          ) : (
            <>
              <Radar className="mb-1 h-5 w-5 text-shafx-textMuted" />
              <div className="font-mono text-[8px] font-bold uppercase tracking-[0.14em] text-shafx-textMuted">SCANNING</div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export function BotHubPanel({
  symbol,
  timeframe,
  candles,
  currentPrice,
  accountBalance,
  accountCurrency,
  derivConnectionId = '',
  derivAccountId = '',
  derivEnvironment = 'demo',
  symbolSpec = null,
  onReviewSetup,
  scanM1Candles = [],
}: Props) {
  const [tab, setTab] = useState<Tab>('radar')
  const [stake, setStake] = useState('10')
  const [multiplierMode, setMultiplierMode] = useState<'auto' | 'manual'>('auto')
  const [multiplier, setMultiplier] = useState('10')
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe | null>(null)
  const [run, setRun] = useState<BotRun | null>(null)
  const [busy, setBusy] = useState(false)
  const frames = useMultiTimeframeCandles(symbol, timeframe, candles, scanM1Candles, 0)
  const radar = useMemo(() => buildSignalRadar(frames, symbol, currentPrice), [currentPrice, frames, symbol])
  const selectedOpportunity = radar.opportunities.find((item) => item.timeframe === selectedTimeframe) ?? radar.opportunities[0] ?? null
  const accountReady = Number.isFinite(accountBalance) && accountBalance > 0 && Boolean(derivConnectionId && derivAccountId)
  const runActive = Boolean(run && !['completed', 'stopped', 'failed'].includes(run.status))

  useEffect(() => {
    let cancelled = false
    const loadActive = async (): Promise<void> => {
      if (!derivConnectionId || !derivAccountId) return
      try {
        const response = await fetch('/api/bot/run?active=1&symbol=' + encodeURIComponent(symbol), { credentials: 'same-origin', cache: 'no-store' })
        const data = await response.json().catch(() => ({}))
        if (!cancelled && response.ok && data?.ok && data.run) setRun(data.run as BotRun)
      } catch {}
    }
    void loadActive()
    return () => { cancelled = true }
  }, [derivAccountId, derivConnectionId, symbol])

  useEffect(() => {
    if (!run?.id) return
    if (['completed', 'stopped', 'failed'].includes(run.status)) return
    let cancelled = false
    const poll = async (): Promise<void> => {
      try {
        const response = await fetch('/api/bot/run?runId=' + encodeURIComponent(run.id), { credentials: 'same-origin', cache: 'no-store' })
        const data = await response.json().catch(() => ({}))
        if (!cancelled && response.ok && data?.ok && data.run) setRun(data.run as BotRun)
      } catch {}
    }
    const timer = window.setInterval(() => { void poll() }, 1500)
    void poll()
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [run?.id, run?.status])

  const review = (opportunity: SignalRadarOpportunity): void => {
    setSelectedTimeframe(opportunity.timeframe)
    onReviewSetup?.(opportunity.setup)
  }

  const startRun = async (): Promise<void> => {
    if (!accountReady || runActive || busy) return
    const stakeValue = Number(stake)
    const multiplierValue = Number(multiplier)
    if (!Number.isFinite(stakeValue) || stakeValue < 10 || stakeValue > 2000) return
    if (multiplierMode === 'manual' && (!Number.isFinite(multiplierValue) || multiplierValue <= 0)) return

    setBusy(true)
    try {
      const response = await fetch('/api/bot/run', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start',
          connectionId: derivConnectionId,
          accountId: derivAccountId,
          symbol,
          stake: stakeValue,
          multiplierMode,
          multiplier: multiplierMode === 'manual' ? multiplierValue : null,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (response.ok && data?.ok && data.run) {
        setRun(data.run as BotRun)
        setTab('autopilot')
      }
    } finally {
      setBusy(false)
    }
  }

  const stopRun = async (): Promise<void> => {
    if (!run?.id || busy) return
    setBusy(true)
    try {
      const response = await fetch('/api/bot/run', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop', runId: run.id }),
      })
      const data = await response.json().catch(() => ({}))
      if (response.ok && data?.ok && data.run) setRun(data.run as BotRun)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-3 rounded-2xl border border-shafx-border bg-[#090D13] p-3 shadow-[0_18px_48px_rgba(0,0,0,.22)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <div className="mt-0.5 rounded-xl border border-shafx-accent/20 bg-shafx-accent/10 p-2"><Bot className="h-4 w-4 text-shafx-accent" /></div>
          <div className="min-w-0">
            <div className="flex items-center gap-2"><h3 className="truncate text-sm font-semibold">SHAFX Bot Room</h3><span className="rounded-full border border-shafx-success/20 bg-shafx-success/10 px-2 py-1 font-mono text-[7px] font-bold text-shafx-success">DERIV NATIVE</span></div>
            <p className="mt-1 text-[8px] leading-4 text-shafx-textMuted">Two independent tools share one market brain: Radar explains the market; Autopilot owns a five-round execution unit.</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 rounded-xl border border-shafx-border bg-shafx-bg px-2 py-1.5"><CircleDot className="h-3 w-3 text-shafx-success" /><span className="font-mono text-[7px] font-bold uppercase tracking-[0.12em] text-shafx-textMuted">{derivEnvironment.toUpperCase()}</span></div>
      </div>

      <div className="grid grid-cols-2 gap-1 rounded-xl border border-shafx-border bg-shafx-bg p-1">
        {([
          ['radar', 'SIGNAL RADAR', Radar],
          ['autopilot', 'AUTOPILOT UNIT', Bot],
        ] as const).map(([value, label, Icon]) => (
          <button key={value} type="button" onClick={() => setTab(value)} className={'flex min-h-10 items-center justify-center gap-2 rounded-lg text-[8px] font-bold tracking-[0.12em] ' + (tab === value ? 'bg-shafx-accent text-white shadow-sm' : 'text-shafx-textMuted hover:bg-white/[0.03]')}>
            <Icon className="h-3.5 w-3.5" />{label}
          </button>
        ))}
      </div>

      {tab === 'radar' ? (
        <>
          <div className="rounded-2xl border border-shafx-border bg-gradient-to-b from-white/[0.035] to-transparent p-3">
            <div className="grid grid-cols-[auto_1fr] items-center gap-4">
              <SignalCore opportunity={selectedOpportunity} />
              <div className="min-w-0">
                <div className="font-mono text-[7px] font-bold uppercase tracking-[0.16em] text-shafx-textMuted">LIVE MARKET RADAR</div>
                <div className="mt-1 truncate text-sm font-semibold">{symbol}</div>
                <div className="mt-1 flex flex-wrap gap-1.5 text-[8px]">
                  <span className="rounded-full border border-shafx-border bg-shafx-bg px-2 py-1 font-mono">{radar.scanned.length}/{RADAR_TIMEFRAMES.length} TF</span>
                  <span className="rounded-full border border-shafx-border bg-shafx-bg px-2 py-1 font-mono">ALIGN {radar.alignment}%</span>
                  <span className="rounded-full border border-shafx-border bg-shafx-bg px-2 py-1 font-mono">{radar.dominantBias ?? 'MIXED'}</span>
                </div>
                <p className="mt-2 text-[8px] leading-4 text-shafx-textMuted">Strength is a SHAFX rule score, not a guaranteed win probability.</p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            {radar.opportunities.map((opportunity, index) => (
              <div key={opportunity.timeframe} className={'rounded-xl border p-3 ' + (selectedTimeframe === opportunity.timeframe ? 'border-shafx-accent/40 bg-shafx-accent/[0.06]' : 'border-shafx-border bg-shafx-bg')}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2"><span className="font-mono text-[8px] font-bold text-shafx-textMuted">0{index + 1}</span><b className="font-mono text-xs">{opportunity.timeframe}</b><StatusPill state={opportunity.state} /></div>
                  <b className={opportunity.direction === 'BUY' ? 'font-mono text-xs text-shafx-success' : 'font-mono text-xs text-shafx-danger'}>{opportunity.signalStrength}</b>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-[8px]">
                  <div><span className="block text-shafx-textMuted">Direction</span><b>{directionLabel(opportunity.direction)}</b></div>
                  <div><span className="block text-shafx-textMuted">Structure</span><b>{opportunity.structure}</b></div>
                  <div><span className="block text-shafx-textMuted">HTF</span><b>{opportunity.higherTimeframeAligned ? 'Aligned' : 'Mixed'}</b></div>
                </div>
                <button type="button" onClick={() => review(opportunity)} className="mt-2 flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-shafx-accent/20 bg-shafx-accent/[0.05] text-[8px] font-bold uppercase tracking-[0.12em] text-shafx-accent">
                  <ShieldCheck className="h-3.5 w-3.5" />Review {opportunity.timeframe} setup
                </button>
              </div>
            ))}
            {!radar.opportunities.length && <div className="rounded-xl border border-shafx-border bg-shafx-bg p-4 text-center text-[9px] text-shafx-textMuted">No clean multi-timeframe opportunity has cleared the current SHAFX rules. Radar stays in WAIT instead of inventing a trade.</div>}
          </div>
        </>
      ) : (
        <>
          <div className="rounded-2xl border border-shafx-border bg-gradient-to-b from-shafx-accent/[0.08] to-transparent p-3">
            <div className="flex items-center justify-between gap-3">
              <div><div className="font-mono text-[7px] font-bold uppercase tracking-[0.16em] text-shafx-textMuted">AUTOPILOT UNIT</div><div className="mt-1 text-sm font-semibold">{run ? 'Unit ' + run.unitNumber : 'Ready for a new unit'}</div></div>
              {run ? <StatusPill state={run.status} /> : <span className="rounded-full border border-shafx-border px-2 py-1 font-mono text-[7px] text-shafx-textMuted">5 ROUNDS</span>}
            </div>
            <div className="mt-4 flex items-center gap-1">
              {[1,2,3,4,5].map((round) => {
                const item = run?.rounds.find((entry) => entry.round_number === round)
                const complete = item && ['won','loss','stopped'].includes(item.status)
                const active = run?.currentRound === round && !complete
                return <div key={round} className={'h-2 flex-1 rounded-full ' + (complete ? 'bg-shafx-success' : active ? 'bg-shafx-accent animate-pulse' : 'bg-shafx-border')} />
              })}
            </div>
            <div className="mt-2 flex justify-between font-mono text-[7px] text-shafx-textMuted"><span>R1</span><span>R2</span><span>R3</span><span>R4</span><span>R5</span></div>
          </div>

          {!runActive ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <label className="rounded-xl border border-shafx-border bg-shafx-bg p-3"><span className="block text-[7px] font-bold uppercase tracking-[0.13em] text-shafx-textMuted">Stake</span><input value={stake} onChange={(event) => setStake(event.target.value)} inputMode="decimal" className="mt-1 w-full bg-transparent font-mono text-lg font-bold outline-none" /></label>
                <label className="rounded-xl border border-shafx-border bg-shafx-bg p-3"><span className="block text-[7px] font-bold uppercase tracking-[0.13em] text-shafx-textMuted">Multiplier</span><select value={multiplierMode} onChange={(event) => setMultiplierMode(event.target.value as 'auto' | 'manual')} className="mt-1 w-full bg-transparent font-mono text-xs font-bold outline-none"><option value="auto">AUTO</option><option value="manual">MANUAL</option></select>{multiplierMode === 'manual' && <input value={multiplier} onChange={(event) => setMultiplier(event.target.value)} inputMode="numeric" className="mt-1 w-full bg-transparent font-mono text-sm outline-none" />}</label>
              </div>
              <div className="rounded-xl border border-shafx-border bg-shafx-bg p-3 text-[8px] text-shafx-textMuted"><div className="flex items-center gap-2 font-semibold text-shafx-text"><ShieldCheck className="h-3.5 w-3.5 text-shafx-success" />Server-owned execution</div><p className="mt-1 leading-4">Your browser only controls the unit. The five-round run is persisted on SHAFX so refreshes and disconnects do not become the trading clock.</p></div>
              <button type="button" disabled={!accountReady || busy} onClick={() => void startRun()} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-shafx-accent text-[9px] font-bold uppercase tracking-[0.13em] text-white disabled:cursor-not-allowed disabled:opacity-40"><Play className="h-4 w-4" />Start Unit 1/5</button>
              {!accountReady && <div className="text-center text-[8px] text-shafx-danger">Connect a Deriv demo account before starting Autopilot.</div>}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl border border-shafx-border bg-shafx-bg p-3"><span className="block text-[7px] text-shafx-textMuted">Stake</span><b className="mt-1 block font-mono text-sm">{run.stake.toFixed(2)}</b></div>
                <div className="rounded-xl border border-shafx-border bg-shafx-bg p-3"><span className="block text-[7px] text-shafx-textMuted">Net</span><b className={run.netProfit >= 0 ? 'mt-1 block font-mono text-sm text-shafx-success' : 'mt-1 block font-mono text-sm text-shafx-danger'}>{run.netProfit >= 0 ? '+' : ''}{run.netProfit.toFixed(2)}</b></div>
                <div className="rounded-xl border border-shafx-border bg-shafx-bg p-3"><span className="block text-[7px] text-shafx-textMuted">Rounds</span><b className="mt-1 block font-mono text-sm">{run.completedRounds}/5</b></div>
              </div>
              <div className="rounded-xl border border-shafx-border bg-shafx-bg p-3">
                <div className="font-mono text-[7px] font-bold uppercase tracking-[0.13em] text-shafx-textMuted">Round ledger</div>
                <div className="mt-2 space-y-1.5">{[1,2,3,4,5].map((round) => { const item = run.rounds.find((entry) => entry.round_number === round); return <div key={round} className="flex items-center justify-between gap-2 rounded-lg border border-shafx-border/70 bg-black/10 px-2.5 py-2"><span className="font-mono text-[8px]">R{round}</span><StatusPill state={item?.status ?? 'queued'} /><span className={Number(item?.profit ?? 0) >= 0 ? 'font-mono text-[8px] text-shafx-success' : 'font-mono text-[8px] text-shafx-danger'}>{item?.profit == null ? '—' : (Number(item.profit) >= 0 ? '+' : '') + Number(item.profit).toFixed(2)}</span></div> })}</div>
              </div>
              <button type="button" disabled={busy} onClick={() => void stopRun()} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-shafx-danger/30 bg-shafx-danger/[0.05] text-[9px] font-bold uppercase tracking-[0.12em] text-shafx-danger disabled:opacity-40"><Square className="h-3.5 w-3.5" />Stop Unit</button>
            </div>
          )}

          <div className="flex items-center gap-2 rounded-xl border border-shafx-border bg-shafx-bg p-3 text-[8px] text-shafx-textMuted"><CircleDot className="h-3.5 w-3.5 text-shafx-accent" />Account {accountCurrency} {accountBalance.toFixed(2)} • {symbol} • {timeframe}</div>
        </>
      )}

      <div className="rounded-xl border border-shafx-border bg-shafx-bg/60 px-3 py-2 text-[7px] leading-4 text-shafx-textMuted">
        SHAFX UI research direction: use a focused, data-heavy dark workspace with transparent live state rather than a generic robot mascot or glass-heavy crypto template. Current trading dashboards emphasize signal feeds, modular data cards, and clear live-state controls; SHAFX deliberately keeps its own ring + five-round unit language instead of copying those patterns.
      </div>
    </section>
  )
}
