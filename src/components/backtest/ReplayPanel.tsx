import { useEffect, useRef, useState } from 'react'
import { Activity as ActivityIcon, CheckCircle2, Pause, Play, RotateCcw, SkipBack, SkipForward } from 'lucide-react'
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
  const [playing, setPlaying] = useState(false)
  const playTimer = useRef<number | null>(null)

  useEffect(() => {
    if (!playing || isComplete) return
    playTimer.current = window.setTimeout(() => setCount(active + step), 550)
    return () => { if (playTimer.current !== null) window.clearTimeout(playTimer.current) }
  }, [active, isComplete, playing])

  useEffect(() => () => { if (playTimer.current !== null) window.clearTimeout(playTimer.current) }, [])

  useEffect(() => {
    if (isComplete) setPlaying(false)
  }, [isComplete])

  const setCount = (count: number): void => onReplayCountChange(Math.min(max, Math.max(minimum, count)))
  const restart = (): void => {
    setPlaying(false)
    setCount(minimum)
  }
  const togglePlay = (): void => {
    if (isComplete) setCount(minimum)
    setPlaying((value) => !value)
  }

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

      <div className="mt-3 rounded border border-shafx-border bg-shafx-bg p-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-shafx-textMuted">Replay position</span>
          <span className="font-mono text-shafx-text">{active} / {max}</span>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-shafx-border"><div className="h-full rounded-full bg-shafx-primary transition-[width] duration-200" style={{ width: progress + '%' }} /></div>
        <input type="range" min={minimum} max={max} value={active} onChange={(event) => setCount(Number(event.target.value))} className="mt-3 w-full" aria-label="Visible replay candles" />
        <div className="mt-3 grid grid-cols-4 gap-2">
          <button type="button" onClick={restart} className="flex min-h-10 items-center justify-center gap-1 rounded border border-shafx-border px-2 text-xs text-shafx-text" aria-label="Restart visual replay"><RotateCcw className="h-3.5 w-3.5" />Restart</button>
          <button type="button" onClick={() => { setPlaying(false); setCount(active - step) }} disabled={!canStepBack} className="flex min-h-10 items-center justify-center gap-1 rounded border border-shafx-border px-2 text-xs text-shafx-text disabled:opacity-40" aria-label="Previous replay candle"><SkipBack className="h-3.5 w-3.5" />Prev</button>
          <button type="button" onClick={togglePlay} className="flex min-h-10 items-center justify-center gap-1 rounded bg-shafx-primary px-2 text-xs font-semibold text-white" aria-label={playing ? 'Pause visual replay' : 'Run visual replay'}>{playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}{playing ? 'Pause' : 'Run'}</button>
          <button type="button" onClick={() => { setPlaying(false); setCount(active + step) }} disabled={!canStepForward} className="flex min-h-10 items-center justify-center gap-1 rounded border border-shafx-primary/40 bg-shafx-primary/10 px-2 text-xs font-semibold text-shafx-primary disabled:opacity-40" aria-label="Next replay candle">Next<SkipForward className="h-3.5 w-3.5" /></button>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-[10px] text-shafx-textMuted">
        <span className={isComplete ? 'flex items-center gap-1 text-shafx-success' : 'text-shafx-textMuted'}>{isComplete && <CheckCircle2 className="h-3 w-3" />}{isComplete ? 'Replay complete' : 'Next updates the chart'}</span>
        <span className="flex items-center gap-1">{playing ? <><ActivityIcon />Playing every 0.55s</> : <><Pause className="h-3 w-3" />Paused • use Run or Next</>}</span>
      </div>
      <p className="mt-3 text-[10px] text-shafx-textMuted">SIMULATED — NOT FINANCIAL ADVICE. Replay uses simulated historical candles only.</p>
    </section>
  )
}
