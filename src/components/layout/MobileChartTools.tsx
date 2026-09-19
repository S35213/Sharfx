import React, { useState } from 'react'
import { Activity, BellRing, ChevronDown, Crosshair, Minus, Ruler, Wrench } from 'lucide-react'
import type { WorkspaceTool } from './WorkspaceRail'

interface Props { tool: WorkspaceTool; onToolChange: (tool: WorkspaceTool) => void }

const items: Array<{ id: WorkspaceTool; label: string; icon: React.ElementType; detail: string }> = [
  { id: 'cursor', label: 'Pointer', icon: Activity, detail: 'Pan and inspect' },
  { id: 'crosshair', label: 'Crosshair', icon: Crosshair, detail: 'Read exact price + time' },
  { id: 'level', label: 'Price level', icon: Minus, detail: 'Place a persistent level' },
  { id: 'measure', label: 'Measure', icon: Ruler, detail: 'Measure pip distance' },
  { id: 'alert', label: 'Price alert', icon: BellRing, detail: 'Arm an alert at a chart price' },
]

export const MobileChartTools: React.FC<Props> = ({ tool, onToolChange }) => {
  const [open, setOpen] = useState(false)
  const active = items.find((item) => item.id === tool) ?? items[0]
  const ActiveIcon = active.icon

  return (
    <div className="relative z-40 border-b border-shafx-border bg-shafx-surface/75 lg:hidden">
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="flex min-h-12 w-full items-center gap-2.5 px-3 text-left">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-shafx-accent/10 text-shafx-accent"><ActiveIcon className="h-4 w-4" /></span>
        <span className="min-w-0 flex-1"><span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-shafx-textMuted">Chart tools</span><span className="mt-0.5 block truncate text-xs font-semibold">{active.label}<span className="ml-2 text-[9px] font-normal text-shafx-textMuted">{active.detail}</span></span></span>
        <ChevronDown className={open ? 'h-4 w-4 rotate-180 text-shafx-accent transition-transform' : 'h-4 w-4 text-shafx-textMuted transition-transform'} />
      </button>

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
          <div className="mt-2 flex items-center gap-2 rounded-xl border border-shafx-border bg-shafx-surface p-2 text-[9px] text-shafx-textMuted"><Wrench className="h-3.5 w-3.5 text-shafx-accent" />Choose one tool at a time. Tapping the chart applies it at the price under your finger.</div>
        </div>
      )}
    </div>
  )
}
