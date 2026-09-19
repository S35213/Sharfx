import React from 'react'
import { Activity, Circle, ShieldCheck, WalletCards } from 'lucide-react'

interface Props { provider: string; mode: 'demo' | 'broker'; price: number; symbol: string; precision: number; live: boolean }

export const WorkspaceStatus: React.FC<Props> = ({ provider, mode, price, symbol, precision, live }) => (
  <div className="flex gap-2 overflow-x-auto border-b border-shafx-border bg-shafx-bg px-3 py-2.5 sm:grid sm:grid-cols-4 sm:overflow-visible">
    <Metric label="Market" value={symbol} icon={<Circle className="h-2 w-2 fill-shafx-success text-shafx-success" />} />
    <Metric label="Last" value={price.toFixed(precision)} mono />
    <Metric label="Feed" value={live ? 'Provider live' : provider} icon={<Activity className={live ? 'h-3.5 w-3.5 text-shafx-success' : 'h-3.5 w-3.5 text-shafx-textMuted'} />} />
    <Metric label="Mode" value={mode === 'broker' ? 'Provider gated' : 'Simulation'} icon={<ShieldCheck className="h-3.5 w-3.5 text-shafx-accent" />} />
  </div>
)

function Metric({ label, value, icon, mono = false }: { label: string; value: string; icon?: React.ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-[132px] rounded-xl border border-shafx-border bg-shafx-surface/65 px-3 py-2 sm:min-w-0">
      <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.12em] text-shafx-textMuted">{icon}{label}</div>
      <div className={mono ? 'mt-1 font-mono text-xs font-semibold tabular text-shafx-text' : 'mt-1 flex items-center gap-1.5 text-xs font-semibold text-shafx-text'}>{value}</div>
    </div>
  )
}
