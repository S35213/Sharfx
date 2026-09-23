import { CheckCircle2, Pause, Play, RotateCcw, SkipBack, SkipForward } from 'lucide-react'
import type { OHLCV } from '../../types'

interface Props {
  candles: OHLCV[]
  replayCount: number
  onReplayCountChange: (count: number) => void
}

export function ReplayPanel({ candles, replayCount, onReplayCountChange }: Props) {
  const minimum = Math.min(20, candles.length)
  const max = candles.length
  const active = Math.min(Math.max(replayCount, minimum), max)
  const step = 1
  const canStepBack = active > minimum
  const canStepForward = active < max
  const progress = max > minimum ? ((active - minimum) / (max - minimum)) * 100 : 100
  const isComplete = active >= max

  const setCount = (count: number): void => onReplayCountChange(Math.min(max, Math.max(minimum, count)))

  if (candles.length < 20) return null

  return (
    <section className="rounded-lg border border-shafx-border bg-shafx-surface p-4 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-semibold text-shafx-text"><Play className="h-4 w-4 text-shafx-primary" /> Visual replay</h3>
          <p className="mt-1 text-[11px] text-shafx-textMuted">Walk through simulated candles one at a time. The chart and agent analysis update with the visible history.</p>
        </div>
        <span className="rounded border border-shafx-border px-2 py-1 text-[10px] text-shafx-textMuted">DEMO</span>
      </div>

      <div className="mt-3 rounded-xl border border-shafx-border bg-shafx-bg p-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-shafx-textMuted">Replay position</span>
          <span className="font-mono text-shafx-text">{active} / {max}</span>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-shafx-border"><div className="h-full rounded-full bg-shafx-primary transition-[width] duration-200" style={{ width: progress + '%' }} /></div>
        <input type="range" min={minimum} max={max} value={active} onChange={(event) => setCount(Number(event.target.value))} className="mt-3 w-full" aria-label="Visible replay candles" />
        <div className="mt-3 grid grid-cols-3 gap-2">
          <button type="button" onClick={() => setCount(minimum)} disabled={!canStepBack} className="flex min-h-10 items-center justify-center gap-1 rounded border border-shafx-border px-2 text-xs text-shafx-text disabled:opacity-40" aria-label="Restart visual replay"><RotateCcw className="h-3.5 w-3.5" />Start</button>
          <button type="button" onClick={() => setCount(active - step)} disabled={!canStepBack} className="flex min-h-10 items-center justify-center gap-1 rounded border border-shafx-border px-2 text-xs text-shafx-text disabled:opacity-40" aria-label="Previous replay candle"><SkipBack className="h-3.5 w-3.5" />Previous</button>
          <button type="button" onClick={() => setCount(active + step)} disabled={!canStepForward} className="flex min-h-10 items-center justify-center gap-1 rounded bg-shafx-primary px-2 text-xs font-semibold text-white disabled:opacity-40" aria-label="Next replay candle">Next<SkipForward className="h-3.5 w-3.5" /></button>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-[10px] text-shafx-textMuted">
        <span className={isComplete ? 'flex items-center gap-1 text-shafx-success' : 'text-shafx-textMuted'}>{isComplete && <CheckCircle2 className="h-3 w-3" />}{isComplete ? 'Replay complete' : 'Next updates the market chart'}</span>
        <span className="flex items-center gap-1"><Pause className="h-3 w-3" />Manual stepping</span>
      </div>
      <p className="mt-3 text-[10px] text-shafx-textMuted">SIMULATED — NOT FINANCIAL ADVICE. Replay uses simulated historical candles only.</p>
    </section>
  )
}
