import React, { useState } from 'react'
import { Activity, BellRing, ChevronDown, Crosshair, Minus, Ruler, TrendingUp, Wrench } from 'lucide-react'
import type { CandleTheme, ChartMode } from '../../app/chartSettings'
import { readChartWorkspaceSettings, writeChartWorkspaceSettings } from '../../app/chartSettings'
import type { WorkspaceTool } from './WorkspaceRail'

interface Props { tool: WorkspaceTool; onToolChange: (tool: WorkspaceTool) => void; candleTheme: CandleTheme; chartMode: ChartMode; trendVisible: boolean; onTrendToggle: () => void }

const items: Array<{ id: WorkspaceTool; label: string; icon: React.ElementType; detail: string }> = [
  { id: 'cursor', label: 'Pointer', icon: Activity, detail: 'Pan and inspect' },
  { id: 'crosshair', label: 'Crosshair', icon: Crosshair, detail: 'Read exact price + time' },
  { id: 'level', label: 'Price level', icon: Minus, detail: 'Place a persistent level' },
  { id: 'measure', label: 'Measure', icon: Ruler, detail: 'Measure pip distance' },
  { id: 'alert', label: 'Price alert', icon: BellRing, detail: 'Arm an alert at a chart price' },
]

export const MobileChartTools: React.FC<Props> = ({ tool, onToolChange, candleTheme, chartMode, trendVisible, onTrendToggle }) => {
  const [open, setOpen] = useState(false)
  const active = items.find((item) => item.id === tool) ?? items[0]
  const ActiveIcon = active.icon

  return (
    <div className="relative z-40 border-b border-shafx-border bg-shafx-surface/75 lg:hidden">
      <div className="flex min-h-12 items-center gap-2 px-3 py-2">
        <button type="button" onClick={onTrendToggle} aria-pressed={trendVisible} className={trendVisible ? 'flex min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-shafx-accent/35 bg-shafx-accent/[0.09] px-2.5 py-2 text-left text-shafx-accent transition' : 'flex min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-shafx-border bg-shafx-bg/80 px-2.5 py-2 text-left text-shafx-textMuted transition'}>
          <span className={trendVisible ? 'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-shafx-accent/15' : 'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-shafx-surface'}>
            <TrendingUp className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1"><span className="block text-[10px] font-semibold uppercase tracking-[0.14em]">Trend</span><span className="mt-0.5 block truncate text-[9px] font-normal opacity-75">Support · Resistance · Liquidity</span></span>
          <span className={trendVisible ? 'rounded-full bg-shafx-accent px-2 py-1 text-[8px] font-bold text-white' : 'rounded-full border border-shafx-border px-2 py-1 text-[8px] font-bold'}>{trendVisible ? 'ON' : 'OFF'}</span>
        </button>
        <button type="button" onClick={() => setOpen((value) => !value)} aria-label={open ? 'Close chart tools' : 'Open chart tools'} aria-expanded={open} className="flex h-10 w-10 shrink-0 items-center justify-center gap-1 rounded-xl border border-shafx-border bg-shafx-bg text-shafx-textMuted">
          <ActiveIcon className="h-4 w-4" />
          <ChevronDown className={open ? 'h-3 w-3 rotate-180 transition-transform' : 'h-3 w-3 transition-transform'} />
        </button>
      </div>

      {open && (
        <div className="border-t border-shafx-border bg-shafx-bg p-2.5">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {items.map(({ id, label, icon: Icon, detail }) => {
              const selected = id === tool
              return <button key={id} type="button" onClick={() => { onToolChange(id); setOpen(false) }} aria-pressed={selected} className={selected ? 'min-h-14 rounded-xl border border-shafx-accent/30 bg-shafx-accent/10 px-2 text-left text-shafx-accent' : 'min-h-14 rounded-xl border border-shafx-border bg-shafx-surface px-2 text-left text-shafx-textMuted active:bg-shafx-surfaceHover'}>
                <span className="flex items-center gap-1.5"><Icon className="h-4 w-4" /><span className="text-[10px] font-semibold">{label}</span></span>
                <span className="mt-1 block text-[8px] leading-3 opacity-75">{detail}</span>
              </button>
            })}
          </div>
          <div className="mt-2 rounded-xl border border-shafx-border bg-shafx-surface p-2.5">
            <div className="mb-2 flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.13em] text-shafx-textMuted"><Wrench className="h-3.5 w-3.5 text-shafx-accent" />Chart design</div>
            <div className="grid grid-cols-4 gap-1.5">
              {([
                ['candles', 'Candles'],
                ['bars', 'Bars'],
                ['wave', 'Wave'],
                ['area', 'Area'],
              ] as Array<[ChartMode, string]>).map(([id, label]) => {
                const selected = id === chartMode
                return <button key={id} type="button" onClick={() => writeChartWorkspaceSettings({ ...readChartWorkspaceSettings(), chartMode: id })} aria-pressed={selected} className={selected ? 'min-h-10 rounded-lg border border-shafx-accent/40 bg-shafx-accent/10 px-1 text-center text-[8px] font-semibold text-shafx-accent' : 'min-h-10 rounded-lg border border-shafx-border bg-shafx-bg px-1 text-center text-[8px] font-semibold text-shafx-textMuted'}>{label}</button>
              })}
            </div>
          </div>
          <div className="mt-2 rounded-xl border border-shafx-border bg-shafx-surface p-2.5">
            <div className="mb-2 flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.13em] text-shafx-textMuted"><Wrench className="h-3.5 w-3.5 text-shafx-accent" />Candlestick theme</div>
            <div className="grid grid-cols-4 gap-1.5">
              {([
                ['mt5', 'MT5', '#26A69A', '#EF5350'],
                ['shafx', 'SHAFX', '#22D3A5', '#FF5C75'],
                ['blue', 'Blue', '#42A5F5', '#FF7043'],
                ['amber', 'Amber', '#FFCA28', '#EF5350'],
              ] as Array<[CandleTheme, string, string, string]>).map(([id, label, up, down]) => {
                const selected = id === candleTheme
                return <button key={id} type="button" onClick={() => {
                  const current = readChartWorkspaceSettings()
                  writeChartWorkspaceSettings({ ...current, candleTheme: id })
                }} aria-pressed={selected} className={selected ? 'min-h-11 rounded-lg border border-shafx-accent/40 bg-shafx-accent/10 px-1 text-left' : 'min-h-11 rounded-lg border border-shafx-border bg-shafx-bg px-1 text-left'}>
                  <span className="flex items-center justify-center gap-1"><span className="h-3 w-3 rounded-[2px]" style={{ background: up }} /><span className="h-3 w-3 rounded-[2px]" style={{ background: down }} /></span>
                  <span className={selected ? 'mt-1 block text-center text-[8px] font-semibold text-shafx-accent' : 'mt-1 block text-center text-[8px] font-semibold text-shafx-textMuted'}>{label}</span>
                </button>
              })}
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2 rounded-xl border border-shafx-border bg-shafx-surface p-2 text-[9px] text-shafx-textMuted">Choose a tool, then tap the chart to use it. The candlestick theme is saved on this device.</div>
        </div>
      )}
    </div>
  )
}
