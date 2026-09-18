import React from 'react'
import { Activity, Circle, Gauge, ShieldCheck } from 'lucide-react'

interface Props { provider: string; mode: 'demo' | 'broker'; price: number; symbol: string; precision: number; live: boolean }

export const WorkspaceStatus: React.FC<Props> = ({ provider, mode, price, symbol, precision, live }) => (
  <div className="grid grid-cols-2 gap-2 border-b border-shafx-border bg-shafx-surface/60 px-3 py-2 sm:grid-cols-4">
    <div className="rounded-xl border border-shafx-border bg-shafx-bg/70 px-3 py-2"><span className="text-[9px] uppercase tracking-[0.14em] text-shafx-textMuted">Market</span><div className="mt-1 flex items-center gap-2 text-xs font-semibold"><Circle className="h-2 w-2 fill-shafx-success text-shafx-success" />{symbol}</div></div>
    <div className="rounded-xl border border-shafx-border bg-shafx-bg/70 px-3 py-2"><span className="text-[9px] uppercase tracking-[0.14em] text-shafx-textMuted">Last</span><div className="mt-1 font-mono text-xs tabular">{price.toFixed(precision)}</div></div>
    <div className="rounded-xl border border-shafx-border bg-shafx-bg/70 px-3 py-2"><span className="text-[9px] uppercase tracking-[0.14em] text-shafx-textMuted">Connection</span><div className="mt-1 flex items-center gap-1.5 text-xs font-semibold"><Activity className={`h-3 w-3 ${live ? 'text-shafx-success' : 'text-shafx-textMuted'}`} />{provider}</div></div>
    <div className="rounded-xl border border-shafx-border bg-shafx-bg/70 px-3 py-2"><span className="text-[9px] uppercase tracking-[0.14em] text-shafx-textMuted">Execution</span><div className="mt-1 flex items-center gap-1.5 text-xs font-semibold"><ShieldCheck className="h-3 w-3 text-shafx-accent" />{mode === 'broker' ? 'Provider gated' : 'Simulation'}</div><Gauge className="sr-only" /></div>
  </div>
)
