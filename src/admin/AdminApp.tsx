import { FormEvent, useEffect, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  Bot,
  Boxes,
  CheckCircle2,
  Gauge,
  KeyRound,
  LogOut,
  RefreshCw,
  ServerCog,
  ShieldCheck,
  Users,
  Wifi,
} from 'lucide-react'

type ServiceState = 'online' | 'configured' | 'not-configured' | 'planned' | 'requires-approval'

type Overview = {
  ok: boolean
  platform: string
  environment: string
  deploymentId: string | null
  commit: string | null
  services: {
    adminAuth: ServiceState
    derivOAuth: boolean
    derivMarketData: boolean
    shafxDatabase: boolean
  }
  integrations: Array<{ name: string; status: ServiceState; detail: string }>
}

const stateLabel: Record<ServiceState, string> = {
  online: 'Online',
  configured: 'Configured',
  'not-configured': 'Not configured',
  planned: 'Planned',
  'requires-approval': 'Requires approval',
}

function StatusDot({ state }: { state: ServiceState }) {
  if (state === 'online' || state === 'configured') return <CheckCircle2 className="h-4 w-4" />
  if (state === 'planned') return <Activity className="h-4 w-4" />
  return <AlertTriangle className="h-4 w-4" />
}

function Card({ title, value, detail, icon: Icon }: { title: string; value: string; detail: string; icon: typeof Gauge }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#11161d] p-5 shadow-xl shadow-black/10">
      <div className="mb-5 flex items-center justify-between">
        <span className="rounded-xl bg-white/5 p-2 text-slate-300"><Icon className="h-5 w-5" /></span>
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Owner</span>
      </div>
      <div className="text-2xl font-semibold tracking-tight text-white">{value}</div>
      <div className="mt-1 text-sm font-medium text-slate-300">{title}</div>
      <div className="mt-2 text-xs text-slate-500">{detail}</div>
    </div>
  )
}

export default function AdminApp() {
  const [authenticated, setAuthenticated] = useState(false)
  const [key, setKey] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [overview, setOverview] = useState<Overview | null>(null)

  const loadOverview = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/admin/overview', { credentials: 'include', cache: 'no-store' })
      if (response.status === 401) {
        setAuthenticated(false)
        setOverview(null)
        return
      }
      const data = await response.json()
      if (!response.ok || !data.ok) throw new Error(data.error || 'Unable to load owner console')
      setAuthenticated(true)
      setOverview(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load owner console')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadOverview()
  }, [])

  const login = async (event: FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ key }),
      })
      const data = await response.json()
      if (!response.ok || !data.ok) throw new Error(data.error || 'Access denied')
      setKey('')
      await loadOverview()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Access denied')
    } finally {
      setLoading(false)
    }
  }

  const logout = async () => {
    await fetch('/api/admin/logout', { method: 'POST', credentials: 'include' }).catch(() => undefined)
    setAuthenticated(false)
    setOverview(null)
  }

  if (!authenticated) {
    return (
      <main className="min-h-screen bg-[#080b0f] px-5 py-10 text-slate-100">
        <div className="mx-auto flex min-h-[80vh] max-w-md items-center">
          <div className="w-full rounded-3xl border border-white/10 bg-[#11161d] p-7 shadow-2xl shadow-black/30">
            <div className="mb-7 flex items-center gap-3">
              <div className="rounded-2xl bg-red-500/10 p-3 text-red-400"><ShieldCheck className="h-6 w-6" /></div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-red-400">SHAFX</div>
                <h1 className="text-xl font-semibold text-white">Owner Console</h1>
              </div>
            </div>
            <p className="mb-6 text-sm leading-6 text-slate-400">This console is deliberately separate from the public SHAFX interface. Enter the private owner access key to continue.</p>
            <form onSubmit={login} className="space-y-4">
              <label className="block text-xs font-medium text-slate-400" htmlFor="owner-key">Owner access key</label>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-500" />
                <input id="owner-key" type="password" autoComplete="current-password" value={key} onChange={(event) => setKey(event.target.value)} className="w-full rounded-xl border border-white/10 bg-black/20 py-3 pl-10 pr-3 text-sm text-white outline-none ring-red-500/40 placeholder:text-slate-600 focus:ring-2" placeholder="Private key" required />
              </div>
              {error && <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-300">{error}</div>}
              <button disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-50">
                {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                {loading ? 'Verifying…' : 'Enter Owner Console'}
              </button>
            </form>
            <div className="mt-6 border-t border-white/10 pt-5 text-[11px] leading-5 text-slate-500">The key is checked server-side. It is never stored in the browser, URL, GitHub repository, or public SHAFX client.</div>
          </div>
        </div>
      </main>
    )
  }

  const services = overview?.services
  return (
    <main className="min-h-screen bg-[#080b0f] text-slate-100">
      <header className="sticky top-0 z-10 border-b border-white/10 bg-[#080b0f]/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-red-500/10 p-2 text-red-400"><ShieldCheck className="h-5 w-5" /></div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-red-400">SHAFX PRIVATE</div>
              <div className="font-semibold text-white">Owner Console</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => void loadOverview()} className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-300 hover:bg-white/10" title="Refresh"><RefreshCw className="h-4 w-4" /></button>
            <button onClick={() => void logout()} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/10"><LogOut className="h-4 w-4" /> Sign out</button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-8 px-5 py-8">
        <section>
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Control center</div>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white">SHAFX system overview</h1>
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-400">Environment: <span className="font-semibold text-white">{overview?.environment || 'unknown'}</span></div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card title="Owner authentication" value={services?.adminAuth === 'online' ? 'Protected' : 'Offline'} detail="Private server-side key" icon={ShieldCheck} />
            <Card title="SHAFX users" value="Not connected" detail="Persistent identity database comes next" icon={Users} />
            <Card title="Broker connections" value="Not connected" detail="Database-backed connection registry comes next" icon={Wifi} />
            <Card title="Bot activity" value="Simulator" detail="Existing SHAFX bot engine remains simulation-only" icon={Bot} />
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-[#11161d] p-5 lg:col-span-2">
            <div className="mb-5 flex items-center justify-between"><div><h2 className="font-semibold text-white">System health</h2><p className="mt-1 text-xs text-slate-500">Live configuration checks from the server.</p></div><ServerCog className="h-5 w-5 text-slate-500" /></div>
            <div className="space-y-3">
              <HealthRow name="Owner authentication API" state="online" detail="Private cookie session" />
              <HealthRow name="Deriv OAuth" state={services?.derivOAuth ? 'configured' : 'not-configured'} detail={services?.derivOAuth ? 'Server credentials detected' : 'Add Deriv credentials in Vercel when needed'} />
              <HealthRow name="Deriv public market feed" state="configured" detail="Public market-data adapter is present" />
              <HealthRow name="SHAFX database / users" state={services?.shafxDatabase ? 'configured' : 'not-configured'} detail={services?.shafxDatabase ? 'Database environment detected' : 'No persistent SHAFX database configured yet'} />
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#11161d] p-5">
            <div className="mb-5 flex items-center gap-3"><div className="rounded-xl bg-white/5 p-2 text-slate-300"><Gauge className="h-5 w-5" /></div><div><h2 className="font-semibold text-white">Deployment</h2><p className="text-xs text-slate-500">Current runtime</p></div></div>
            <div className="space-y-4 text-sm">
              <Meta label="Deployment" value={overview?.deploymentId || 'Unavailable'} />
              <Meta label="Commit" value={overview?.commit || 'Unavailable'} />
              <Meta label="Platform" value={overview?.platform || 'SHAFX'} />
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-[#11161d] p-5">
          <div className="mb-5 flex items-center justify-between"><div><h2 className="font-semibold text-white">Broker integration registry</h2><p className="mt-1 text-xs text-slate-500">This is the control layer for future multi-broker connections.</p></div><Boxes className="h-5 w-5 text-slate-500" /></div>
          <div className="grid gap-3 md:grid-cols-3">
            {(overview?.integrations || []).map((integration) => (
              <div key={integration.name} className="rounded-xl border border-white/10 bg-black/10 p-4">
                <div className="flex items-center justify-between gap-3"><span className="font-medium text-white">{integration.name}</span><StatusPill state={integration.status} /></div>
                <p className="mt-2 text-xs leading-5 text-slate-500">{integration.detail}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <Placeholder title="Users" icon={Users} text="Will show registered SHAFX accounts once real authentication and database storage are connected." />
          <Placeholder title="Broker connections" icon={Wifi} text="Will show Deriv, cTrader and other broker connection states without exposing secrets." />
          <Placeholder title="Bot activity" icon={Bot} text="Will show bot sessions, simulator trades, risk modes and failure/review events." />
          <Placeholder title="Audit logs" icon={Activity} text="Will record owner actions and security events after persistent storage is added." />
        </section>

        <div className="rounded-2xl border border-yellow-500/20 bg-yellow-500/5 p-4 text-xs leading-5 text-yellow-200/80">
          <strong className="text-yellow-200">Security rule:</strong> the owner URL is intentionally not linked from the public SHAFX navigation. The URL alone is not the credential; the server-side owner key protects the console APIs. For the next foundation step, SHAFX identity/database access should replace any client-side admin flag.
        </div>
      </div>
    </main>
  )
}

function HealthRow({ name, state, detail }: { name: string; state: ServiceState; detail: string }) {
  return <div className="flex items-center justify-between gap-4 rounded-xl border border-white/5 bg-black/10 px-4 py-3"><div className="min-w-0"><div className="text-sm font-medium text-slate-200">{name}</div><div className="mt-1 text-xs text-slate-500">{detail}</div></div><StatusPill state={state} /></div>
}

function StatusPill({ state }: { state: ServiceState }) {
  const positive = state === 'online' || state === 'configured'
  const planned = state === 'planned'
  return <span className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${positive ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-300' : planned ? 'border-blue-500/20 bg-blue-500/5 text-blue-300' : 'border-yellow-500/20 bg-yellow-500/5 text-yellow-300'}`}><StatusDot state={state} />{stateLabel[state]}</span>
}

function Meta({ label, value }: { label: string; value: string }) {
  return <div><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">{label}</div><div className="mt-1 break-all text-xs text-slate-300">{value}</div></div>
}

function Placeholder({ title, icon: Icon, text }: { title: string; icon: typeof Users; text: string }) {
  return <div className="rounded-2xl border border-white/10 bg-[#11161d] p-5"><Icon className="h-5 w-5 text-slate-500" /><h3 className="mt-4 font-medium text-white">{title}</h3><p className="mt-2 text-xs leading-5 text-slate-500">{text}</p></div>
}
