import React from 'react'
import { ArrowDownToLine, ArrowUpFromLine, Cable, CheckCircle2, CircleOff, DatabaseZap, ShieldCheck } from 'lucide-react'
import type { ProviderDescriptor } from '../../integrations/core/types'

interface Props {
  descriptor: ProviderDescriptor
  environment: 'demo' | 'live'
}

const Capability: React.FC<{ label: string; value: boolean; detail?: string }> = ({ label, value, detail }) => (
  <div className="rounded-xl border border-shafx-border bg-shafx-bg/70 p-3">
    <div className="flex items-center gap-2">
      {value ? <CheckCircle2 className="h-3.5 w-3.5 text-shafx-success" /> : <CircleOff className="h-3.5 w-3.5 text-shafx-textMuted" />}
      <span className="text-[10px] font-semibold">{label}</span>
    </div>
    <div className="mt-1 pl-5 text-[9px] text-shafx-textMuted">{detail ?? (value ? 'Supported by adapter' : 'Not advertised by adapter')}</div>
  </div>
)

export const ProviderCapabilityPanel: React.FC<Props> = ({ descriptor, environment }) => {
  const external = descriptor.executionMode === 'external'
  const executionReady = descriptor.capabilities.orderPlacement && typeof descriptor.capabilities.orderPlacement === 'boolean'
  return <section className="rounded-2xl border border-shafx-border bg-shafx-surface">
    <header className="flex items-start justify-between gap-3 border-b border-shafx-border px-4 py-4">
      <div>
        <div className="flex items-center gap-2"><Cable className="h-4 w-4 text-shafx-accent" /><h3 className="text-sm font-semibold">{descriptor.name} capability map</h3></div>
        <p className="mt-1 text-[9px] leading-4 text-shafx-textMuted">The SHAFX shell stays consistent while provider-specific capabilities are surfaced here.</p>
      </div>
      <span className="rounded-full border border-shafx-border bg-shafx-bg px-2 py-1 text-[8px] font-semibold tracking-wide text-shafx-textMuted">{environment.toUpperCase()}</span>
    </header>

    <div className="grid gap-2 p-3 sm:grid-cols-2">
      <Capability label="Account data" value={descriptor.capabilities.accountRead} detail={descriptor.capabilities.multipleAccounts ? 'Account + multi-account aware' : undefined} />
      <Capability label="Market data" value={descriptor.capabilities.marketData && descriptor.capabilities.realtimeMarketData} detail="Quotes/candles with streaming when available" />
      <Capability label="Positions" value={descriptor.capabilities.positionsRead} />
      <Capability label="Orders" value={descriptor.capabilities.ordersRead} />
      <Capability label="Order placement" value={executionReady} detail={executionReady ? 'Adapter method exists; SHAFX release gate still applies' : 'No placement adapter is advertised'} />
      <Capability label="Close position" value={descriptor.capabilities.positionClose} />
    </div>

    <div className="mx-3 mb-3 rounded-xl border border-shafx-accent/20 bg-shafx-accent/5 p-3"><div className="flex items-start gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 text-shafx-accent" /><div><div className="text-[10px] font-semibold">Deriv live account boundary</div><p className="mt-1 text-[9px] leading-4 text-shafx-textMuted">Market and account data are live. Real-money order placement remains disabled until the Deriv instrument mapping and server-side execution/reconciliation path are certified end to end.</p></div></div></div>

    <footer className="grid grid-cols-2 gap-2 border-t border-shafx-border p-3 text-[9px]">
      <div className="flex items-center gap-2 rounded-xl border border-shafx-border bg-shafx-bg p-2.5 text-shafx-textMuted"><DatabaseZap className="h-3.5 w-3.5 text-shafx-accent" />Normalized market contract</div>
      <div className="flex items-center gap-2 rounded-xl border border-shafx-border bg-shafx-bg p-2.5 text-shafx-textMuted"><ArrowUpFromLine className="h-3.5 w-3.5 text-shafx-success" /><ArrowDownToLine className="h-3.5 w-3.5 text-shafx-danger" />Provider actions</div>
    </footer>
  </section>
}
