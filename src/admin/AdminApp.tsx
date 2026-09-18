import { FormEvent, useEffect, useState } from 'react'
import { Activity, Bot, Boxes, CheckCircle2, Gauge, KeyRound, LogOut, RefreshCw, ServerCog, ShieldCheck, Users, Wifi } from 'lucide-react'

type ServiceState = 'online' | 'configured' | 'not-configured' | 'planned' | 'requires-approval'
type Overview = {
  ok: boolean
  platform: string
  environment: string
  deploymentId: string | null
  commit: string | null
  services: { adminAuth: ServiceState; derivOAuth: boolean; derivMarketData: boolean; shafxDatabase: boolean }
  providerOperations: {
    connectionCount: number
    activeAccountCount: number
    health: { healthy: number; degraded: number; expired: number; offline: number }
    byProvider: Record<string, number>
    connections: Array<{ id: string; providerId: string; label: string; environment: string; state: string; health: string; expiresAt: string | null; lastSeenAt: string | null }>
    auditEvents: Array<{ id: number; connection_id: string | null; event_type: string; severity: string; created_at: string }>
    databaseError: string | null
  }
  integrations: Array<{ name: string; status: ServiceState; detail: string }>
}

const stateLabel: Record<ServiceState, string> = { online: 'Online', configured: 'Configured', 'not-configured': 'Not configured', planned: 'Planned', 'requires-approval': 'Requires approval' }

function Card({ title, value, detail, icon: Icon }: { title: string; value: string; detail: string; icon: typeof Gauge }) {
  return <div className="min-w-[250px] snap-start rounded-2xl border border-white/10 bg-[#11161d] p-4 shadow-xl shadow-black/10 sm:min-w-0 sm:p-5"><div className="flex items-center gap-3"><span className="rounded-xl bg-white/5 p-2 text-slate-300"><Icon className="h-5 w-5" /></span><div className="min-w-0 flex-1"><div className="truncate text-sm font-medium text-slate-200">{title}</div><div className="mt-0.5 text-lg font-semibold tracking-tight text-white">{value}</div></div><span className="shrink-0 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-1.5 text-emerald-300" aria-label="Status checked"><CheckCircle2 className="h-4 w-4" /></span></div><div className="mt-3 text-xs text-slate-500">{detail}</div></div>
}

export default function AdminApp() {
  const [authenticated, setAuthenticated] = useState(false)
  const [key, setKey] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [overview, setOverview] = useState<Overview | null>(null)

  const loadOverview = async () => {
    setLoading(true); setError('')
    try {
      const response = await fetch('/api/admin/overview', { credentials: 'include', cache: 'no-store' })
      if (response.status === 401) { setAuthenticated(false); setOverview(null); return }
      const data = await response.json()
      if (!response.ok || !data.ok) throw new Error(data.error || 'Unable to load owner console')
      setAuthenticated(true); setOverview(data)
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to load owner console') }
    finally { setLoading(false) }
  }

  useEffect(() => { void loadOverview() }, [])

  const login = async (event: FormEvent) => {
    event.preventDefault(); setLoading(true); setError('')
    try {
      const response = await fetch('/api/admin/auth', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'include', body: JSON.stringify({ key: key.trim() }) })
      const data = await response.json()
      if (!response.ok || !data.ok) throw new Error(data.error || 'Access denied')
      setKey(''); await loadOverview()
    } catch (err) { setError(err instanceof Error ? err.message : 'Access denied') }
    finally { setLoading(false) }
  }

  const logout = async () => {
    await fetch('/api/admin/logout', { method: 'POST', credentials: 'include' }).catch(() => undefined)
    setAuthenticated(false); setOverview(null)
  }

  if (!authenticated) return <main className="min-h-screen bg-[#080b0f] px-5 py-10 text-slate-100"><div className="mx-auto flex min-h-[80vh] max-w-md items-center"><div className="w-full rounded-3xl border border-white/10 bg-[#11161d] p-7 shadow-2xl shadow-black/30"><div className="mb-7 flex items-center gap-3"><div className="rounded-2xl bg-red-500/10 p-3 text-red-400"><ShieldCheck className="h-6 w-6" /></div><div><div className="text-xs font-semibold uppercase tracking-[0.2em] text-red-400">SHAFX</div><h1 className="text-xl font-semibold text-white">Owner Console</h1></div></div><p className="mb-6 text-sm leading-6 text-slate-400">Private operations console for SHAFX provider connections, health and audit state.</p><form onSubmit={login} className="space-y-4"><label className="block text-xs font-medium text-slate-400" htmlFor="owner-key">Owner access key</label><div className="relative"><KeyRound className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-500" /><input id="owner-key" type="password" autoComplete="current-password" value={key} onChange={(event) => setKey(event.target.value)} className="w-full rounded-xl border border-white/10 bg-black/20 py-3 pl-10 pr-3 text-sm text-white outline-none ring-red-500/40 placeholder:text-slate-600 focus:ring-2" placeholder="Private key" required /></div>{error && <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-300">{error}</div>}<button disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-50">{loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}{loading ? 'Verifying…' : 'Enter Owner Console'}</button></form><div className="mt-6 border-t border-white/10 pt-5 text-[11px] leading-5 text-slate-500">The key is checked server-side and the console never exposes provider credentials.</div></div></div></main>

  const services = overview?.services
  const ops = overview?.providerOperations
  const healthTotal = ops ? ops.health.healthy + ops.health.degraded + ops.health.expired + ops.health.offline : 0
  return <main className="min-h-screen bg-[#080b0f] text-slate-100"><header className="sticky top-0 z-10 border-b border-white/10 bg-[#080b0f]/95 backdrop-blur"><div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4"><div className="flex items-center gap-3"><div className="rounded-xl bg-red-500/10 p-2 text-red-400"><ShieldCheck className="h-5 w-5" /></div><div><div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-red-400">SHAFX PRIVATE</div><div className="font-semibold text-white">Owner Console</div></div></div><div className="flex items-center gap-2"><button onClick={() => void loadOverview()} className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-300 hover:bg-white/10" title="Refresh"><RefreshCw className="h-4 w-4" /></button><button onClick={() => void logout()} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/10"><LogOut className="h-4 w-4" /> Sign out</button></div></div></header><div className="mx-auto max-w-7xl space-y-8 px-5 py-8"><section><div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Control center</div><h1 className="mt-1 text-2xl font-semibold tracking-tight text-white">SHAFX system overview</h1></div><div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-400">Environment: <span className="font-semibold text-white">{overview?.environment || 'unknown'}</span></div></div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Card title="Owner authentication" value={services?.adminAuth === 'online' ? 'Protected' : 'Offline'} detail="Private server-side key" icon={ShieldCheck} /><Card title="Provider connections" value={String(ops?.connectionCount ?? 0)} detail={String(ops?.activeAccountCount ?? 0) + ' active account records'} icon={Wifi} /><Card title="Connection health" value={healthTotal ? String(ops?.health.healthy ?? 0) + ' healthy' : 'No connections'} detail={String(ops?.health.degraded ?? 0) + ' degraded • ' + String(ops?.health.expired ?? 0) + ' expired • ' + String(ops?.health.offline ?? 0) + ' offline'} icon={Gauge} /><Card title="Trading mode" value="Simulator-safe" detail="External order execution remains disabled" icon={Bot} /></div></section><section className="grid gap-5 lg:grid-cols-3"><div className="rounded-2xl border border-white/10 bg-[#11161d] p-5 lg:col-span-2"><div className="mb-5 flex items-center justify-between"><div><h2 className="font-semibold text-white">Provider operations</h2><p className="mt-1 text-xs text-slate-500">Live connection, account and credential-health state without exposing secrets.</p></div><ServerCog className="h-5 w-5 text-slate-500" /></div>{ops?.databaseError && <div className="mb-3 rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-3 text-xs text-yellow-200">{ops.databaseError}</div>}<div className="space-y-2">{(ops?.connections || []).slice(0, 12).map((connection) => <div key={connection.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/5 bg-black/10 px-4 py-3"><div><div className="text-sm font-medium text-white">{connection.providerId} • {connection.label}</div><div className="mt-1 text-xs text-slate-500">{connection.environment} • {connection.state} • last seen {connection.lastSeenAt || 'never'}</div></div><span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-300">{connection.health}</span></div>)}{!ops?.connections?.length && <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-xs text-slate-500">No provider connections are currently stored.</div>}</div></div><div className="rounded-2xl border border-white/10 bg-[#11161d] p-5"><div className="mb-5 flex items-center gap-3"><div className="rounded-xl bg-white/5 p-2 text-slate-300"><Users className="h-5 w-5" /></div><div><h2 className="font-semibold text-white">Provider accounts</h2><p className="text-xs text-slate-500">Persisted account inventory by provider</p></div></div><div className="space-y-3">{Object.entries(ops?.byProvider || {}).map(([providerId, count]) => <div key={providerId} className="flex items-center justify-between rounded-xl border border-white/5 bg-black/10 px-4 py-3"><span className="text-sm text-slate-300">{providerId}</span><span className="font-semibold text-white">{count}</span></div>)}{!Object.keys(ops?.byProvider || {}).length && <div className="text-xs text-slate-500">No providers connected yet.</div>}</div></div></section><section className="grid gap-5 lg:grid-cols-2"><div className="rounded-2xl border border-white/10 bg-[#11161d] p-5"><div className="mb-5 flex items-center gap-3"><Boxes className="h-5 w-5 text-slate-500" /><div><h2 className="font-semibold text-white">Integration registry</h2><p className="text-xs text-slate-500">Implemented and intentionally planned provider packs.</p></div></div><div className="space-y-2">{(overview?.integrations || []).map((integration) => <div key={integration.name} className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-black/10 px-4 py-3"><div><div className="text-sm font-medium text-white">{integration.name}</div><div className="mt-1 text-xs text-slate-500">{integration.detail}</div></div><StatusPill state={integration.status} /></div>)}</div></div><div className="rounded-2xl border border-white/10 bg-[#11161d] p-5"><div className="mb-5 flex items-center gap-3"><Activity className="h-5 w-5 text-slate-500" /><div><h2 className="font-semibold text-white">Recent audit events</h2><p className="text-xs text-slate-500">Latest provider lifecycle events</p></div></div><div className="space-y-2">{(ops?.auditEvents || []).slice(0, 10).map((event) => <div key={event.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-black/10 px-4 py-3"><div><div className="text-xs font-medium text-white">{event.event_type}</div><div className="mt-1 text-[10px] text-slate-500">{event.created_at}</div></div><span className="text-[10px] uppercase tracking-wide text-slate-400">{event.severity}</span></div>)}{!ops?.auditEvents?.length && <div className="text-xs text-slate-500">No audit events yet.</div>}</div></div></section><div className="rounded-2xl border border-yellow-500/20 bg-yellow-500/5 p-4 text-xs leading-5 text-yellow-200/80"><strong className="text-yellow-200">Security rule:</strong> provider secrets are server-only. This console displays state and identifiers, never credential values.</div></div></main>
}

function StatusPill({ state }: { state: ServiceState }) {
  const positive = state === 'online' || state === 'configured'
  const planned = state === 'planned'
  return <span className={'flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ' + (positive ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-300' : planned ? 'border-blue-500/20 bg-blue-500/5 text-blue-300' : 'border-yellow-500/20 bg-yellow-500/5 text-yellow-300')}>{stateLabel[state]}</span>
}