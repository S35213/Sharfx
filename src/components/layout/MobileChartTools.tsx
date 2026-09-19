import React from 'react'
import { Activity, BellRing, Crosshair, Minus, Ruler } from 'lucide-react'
import type { WorkspaceTool } from './WorkspaceRail'

interface Props {
  tool: WorkspaceTool
  onToolChange: (tool: WorkspaceTool) => void
}

const items: Array<{ id: WorkspaceTool; label: string; icon: React.ElementType }> = [
  { id: 'cursor', label: 'Pointer', icon: Activity },
  { id: 'crosshair', label: 'Crosshair', icon: Crosshair },
  { id: 'level', label: 'Level', icon: Minus },
  { id: 'measure', label: 'Measure', icon: Ruler },
  { id: 'alert', label: 'Alert', icon: BellRing },
]

export const MobileChartTools: React.FC<Props> = ({ tool, onToolChange }) => (
  <div className="flex gap-1.5 overflow-x-auto border-b border-shafx-border bg-shafx-surface/50 px-2 py-1.5 lg:hidden">
    {items.map(({ id, label, icon: Icon }) => {
      const active = tool === id
      return <button key={id} type="button" onClick={() => onToolChange(id)} aria-pressed={active} className={`flex min-h-11 flex-shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-[9px] font-semibold ${active ? 'border-shafx-accent/30 bg-shafx-accent/10 text-shafx-accent' : 'border-shafx-border text-shafx-textMuted hover:bg-shafx-surfaceHover hover:text-shafx-text'}`}>
        <Icon className="h-3.5 w-3.5" />
        {label}
      </button>
    })}
  </div>
)
