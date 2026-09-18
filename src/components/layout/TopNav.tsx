import React, { useMemo, useState } from 'react'
import { Activity, ChevronDown, Command, Search, ShieldCheck, Wifi } from 'lucide-react'
import type { MarketPair, Timeframe } from '../../types'
import { TIMEFRAMES } from '../../types'
import { formatPrice } from '../../lib/format'
import { ProviderConnectionControl } from '../market/ProviderConnectionControl'
import { setStoredTradingMode } from '../../app/tradingMode'

type TerminalView = 'market' | 'agent' | 'history' | 'account'
interface TopNavProps { symbol: string; price: number; pricePrecision: number; timeframe: Timeframe; onTimeframeChange: (tf: Timeframe) => void; pairs: MarketPair[]; onSelectPair: (symbol: string) => void; view?: TerminalView }

export const TopNav: React.FC<TopNavProps> = ({ symbol, price, pricePrecision, timeframe, onTimeframeChange, pairs, onSelectPair, view = 'market' }) => {
  const [marketOpen, setMarketOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [query, setQuery] = useState('')
  const instruments = useMemo(() => Array.from(new Set(pairs.map((pair) => pair.symbol))), [pairs])
  const filtered = instruments.filter((item) => item.toLowerCase().includes(query.trim().toLowerCase()))
  const currentMode = typeof window !== 'undefined' && sessionStorage.getItem('shafx-trading-mode') === 'broker' ? 'broker' : 'simulator'
  const switchMode = (mode: 'simulator' | 'broker') => { setStoredTradingMode(mode, sessionStorage.getItem('shafx-simulator-account-id') || undefined); window.location.assign(`/?account=${mode === 'broker' ? 'broker' : 'demo'}`) }

  return <header className="sticky top-0 z-50 border-b border-shafx-border bg-[#080C12]/95 shadow-[0_8px_30px_rgba(0,0,0,.24)] backdrop-blur-xl">
    <div className="flex min-h-[68px] items-center gap-2 px-3 sm:gap-3 sm:px-4 lg:px-5">
      <div className="flex flex-shrink-0 items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-shafx-accent/30 bg-shafx-accent/10 text-shafx-accent"><Activity className="h-4.5 w-4.5" /></div>
        <div className="hidden lg:block"><div className="text-sm font-semibold tracking-tight">SHAFX</div><div className="text-[8px] uppercase tracking-[0.26em] text-shafx-textMuted">Market workspace</div></div>
      </div>

      <div className="hidden h-8 w-px bg-shafx-border sm:block" />

      {view === 'market' ? <div className="relative min-w-0 flex-1 md:flex-none">
        <button type="button" onClick={() => setMarketOpen((open) => !open)} className="flex min-h-11 w-full min-w-0 items-center gap-3 rounded-xl border border-shafx-border bg-shafx-surface px-3 text-left transition hover:border-shafx-accent/40 md:w-[260px]" aria-expanded={marketOpen} aria-label="Choose trading instrument">
          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-shafx-bg text-[10px] font-bold text-shafx-textMuted">FX</div>
          <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{symbol}</div><div className="mt-0.5 hidden text-[9px] text-shafx-textMuted sm:block">Market • {formatPrice(price, pricePrecision)}</div></div>
          <ChevronDown className={`h-4 w-4 flex-shrink-0 text-shafx-textMuted transition-transform ${marketOpen ? 'rotate-180' : ''}`} />
        </button>
        {marketOpen && <div className="absolute left-0 top-[calc(100%+8px)] z-[80] w-[min(92vw,360px)] rounded-2xl border border-shafx-border bg-shafx-surface p-2 shadow-2xl">
          <div className="mb-2 flex items-center gap-2 rounded-xl border border-shafx-border bg-shafx-bg px-3"><Search className="h-4 w-4 text-shafx-textMuted" /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search symbol…" className="h-10 w-full bg-transparent text-sm outline-none" /><kbd className="hidden rounded border border-shafx-border px-1.5 py-0.5 text-[8px] text-shafx-textMuted sm:block">⌘K</kbd></div>
          <div className="mb-1 px-2 text-[9px] font-semibold uppercase tracking-[0.16em] text-shafx-textMuted">Markets</div>
          <div className="max-h-72 overflow-y-auto">{filtered.map((item) => <button key={item} type="button" onClick={() => { onSelectPair(item); setMarketOpen(false); setQuery('') }} className={`flex min-h-11 w-full items-center justify-between rounded-xl px-3 text-left text-sm transition hover:bg-shafx-surfaceHover ${item === symbol ? 'bg-shafx-accent/10 text-shafx-accent' : ''}`}><span>{item}</span><span className="text-[9px] text-shafx-textMuted">{item.includes('XAU') ? 'Metal' : item.includes('BTC') ? 'Crypto' : 'FX'}</span></button>)}{filtered.length === 0 && <div className="px-3 py-5 text-center text-xs text-shafx-textMuted">No matching market</div>}</div>
        </div>}
      </div> : <div className="min-w-0 flex-1"><div className="text-sm font-semibold">{view === 'agent' ? 'SHAFX Bot' : view === 'history' ? 'Trade history' : 'Account'}</div><div className="text-[9px] uppercase tracking-[0.16em] text-shafx-textMuted">{currentMode === 'broker' ? 'Provider workspace' : 'Simulator workspace'}</div></div>}

      {view === 'market' && <div className="hidden items-center gap-2 border-l border-shafx-border pl-4 xl:flex"><span className="font-mono text-sm font-semibold tabular">{formatPrice(price, pricePrecision)}</span><span className="flex items-center gap-1 rounded-full border border-shafx-success/15 bg-shafx-success/5 px-2 py-1 text-[9px] text-shafx-success"><Wifi className="h-3 w-3" />{currentMode === 'broker' ? 'provider' : 'simulation'}</span></div>}

      <div className="ml-auto flex min-w-0 items-center gap-1.5 sm:gap-2">
        <div className="hidden items-center gap-1 rounded-xl border border-shafx-border bg-shafx-surface px-2.5 py-2 text-[9px] text-shafx-textMuted 2xl:flex"><Command className="h-3 w-3" />Search</div>
        <div className="hidden sm:block"><ProviderConnectionControl /></div>
        <div className="relative">
          <button type="button" onClick={() => setAccountOpen((open) => !open)} className="flex min-h-11 items-center gap-2 rounded-xl border border-shafx-border bg-shafx-surface px-3 text-left" aria-expanded={accountOpen} aria-label="Change trading environment">
            <span className={`h-2 w-2 rounded-full ${currentMode === 'broker' ? 'bg-shafx-accent' : 'bg-shafx-success'}`} />
            <span className="hidden text-[10px] font-semibold sm:block">{currentMode === 'broker' ? 'Provider' : 'Demo'}</span>
            <ChevronDown className="h-3.5 w-3.5 text-shafx-textMuted" />
          </button>
          {accountOpen && <div className="absolute right-0 top-[calc(100%+8px)] z-[90] w-64 rounded-2xl border border-shafx-border bg-shafx-surface p-2 shadow-2xl">
            <div className="px-2 py-2 text-[9px] font-semibold uppercase tracking-[0.16em] text-shafx-textMuted">Environment</div>
            <button type="button" onClick={() => { setAccountOpen(false); if (currentMode !== 'simulator') switchMode('simulator') }} className={`flex min-h-11 w-full items-center justify-between rounded-xl px-3 text-left text-xs ${currentMode === 'simulator' ? 'bg-shafx-accent/10 text-shafx-accent' : 'hover:bg-shafx-surfaceHover'}`}><span>SHAFX Simulator</span><span className="text-[9px]">CURRENT</span></button>
            <button type="button" onClick={() => { setAccountOpen(false); if (currentMode !== 'broker') switchMode('broker') }} className={`mt-1 flex min-h-11 w-full items-center justify-between rounded-xl px-3 text-left text-xs ${currentMode === 'broker' ? 'bg-shafx-accent/10 text-shafx-accent' : 'hover:bg-shafx-surfaceHover'}`}><span>Connected provider</span><span className="text-[9px]">SWITCH</span></button>
            <div className="mt-2 flex items-start gap-2 rounded-xl border border-shafx-border bg-shafx-bg p-2.5 text-[9px] leading-4 text-shafx-textMuted"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-shafx-success" />The terminal shell stays provider-neutral. Provider capability differences are surfaced at the action level.</div>
          </div>}
        </div>
        <div className="hidden md:block"><span className="rounded-xl border border-shafx-border bg-shafx-surface px-3 py-2 text-[9px] font-semibold text-shafx-textMuted">{TIMEFRAMES.includes(timeframe) ? timeframe : '—'}</span></div>
      </div>
    </div>
    {view === 'market' && <div className="flex gap-1 overflow-x-auto border-t border-shafx-border/70 px-3 py-1.5 sm:px-4 lg:px-5">
      {TIMEFRAMES.map((tf) => <button key={tf} type="button" onClick={() => onTimeframeChange(tf)} aria-pressed={timeframe === tf} className={`min-h-8 flex-shrink-0 rounded-lg px-3 text-[9px] font-semibold transition ${timeframe === tf ? 'bg-shafx-accent text-white' : 'text-shafx-textMuted hover:bg-shafx-surfaceHover hover:text-shafx-text'}`}>{tf}</button>)}
    </div>}
  </header>
}
