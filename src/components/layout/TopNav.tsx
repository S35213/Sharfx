import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Command, MoreVertical, Search, Settings2, ShieldCheck, Wifi } from 'lucide-react'
import type { MarketPair, Timeframe } from '../../types'
import { TIMEFRAMES } from '../../types'
import { formatPrice } from '../../lib/format'
import { ProviderConnectionControl } from '../market/ProviderConnectionControl'
import { setStoredTradingMode } from '../../app/tradingMode'
import { ChartSettingsSheet } from './ChartSettingsSheet'
import { ShafxBrandMark, ShafxWordmark } from '../brand/ShafxBrand'

type TerminalView = 'market' | 'agent' | 'history' | 'account'
interface TopNavProps { symbol: string; price: number; pricePrecision: number; timeframe: Timeframe; onTimeframeChange: (tf: Timeframe) => void; pairs: MarketPair[]; onSelectPair: (symbol: string) => void; view?: TerminalView }

export const TopNav: React.FC<TopNavProps> = ({ symbol, price, pricePrecision, timeframe, onTimeframeChange, pairs, onSelectPair, view = 'market' }) => {
  const [marketOpen, setMarketOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const navRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target
      if (target instanceof Node && navRef.current?.contains(target)) return
      setMarketOpen(false)
      setAccountOpen(false)
      setMoreOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setMarketOpen(false)
        setAccountOpen(false)
        setMoreOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])
  const instruments = useMemo(() => Array.from(new Set(pairs.map((pair) => pair.symbol))), [pairs])
  const filtered = instruments.filter((item) => item.toLowerCase().includes(query.trim().toLowerCase()))
  const simulatedQuote = (item: string) => {
    const pair = pairs.find((entry) => entry.symbol === item)
    const precision = item === symbol ? pricePrecision : item.includes('JPY') ? 3 : item.includes('XAU') ? 2 : item.includes('BTC') ? 2 : 5
    const base = item === symbol ? price : pair?.price ?? 0
    const spread = item.includes('JPY') ? 0.006 : item.includes('XAU') ? 0.08 : item.includes('BTC') ? 4 : 0.00008
    const mid = Number(base.toFixed(precision))
    return { pair, precision, bid: Number((mid - spread / 2).toFixed(precision)), ask: Number((mid + spread / 2).toFixed(precision)), mid }
  }
  const currentMode = typeof window !== 'undefined' && sessionStorage.getItem('shafx-trading-mode') === 'broker' ? 'broker' : 'simulator'
  const switchMode = (mode: 'simulator' | 'broker') => { setStoredTradingMode(mode, sessionStorage.getItem('shafx-simulator-account-id') || undefined); window.location.assign(`/?account=${mode === 'broker' ? 'broker' : 'demo'}`) }

  const selectFirstMatch = (): void => {
    const first = filtered[0]
    if (!first) return
    onSelectPair(first)
    setMarketOpen(false)
    setQuery('')
  }

  return <header ref={navRef} className="sticky top-0 z-50 border-b border-shafx-border bg-[#080C12]/95 shadow-[0_8px_30px_rgba(0,0,0,.24)] backdrop-blur-xl">
    <div className="flex min-h-[68px] items-center gap-2 px-3 sm:gap-3 sm:px-4 lg:px-5">
      <div className="flex flex-shrink-0 items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-shafx-accent/30 bg-shafx-accent/[0.08] shadow-[0_0_22px_rgba(22,119,255,.12)]"><ShafxBrandMark size={30} /></div>
        <div className="hidden lg:block"><ShafxWordmark compact /><div className="text-[8px] uppercase tracking-[0.26em] text-shafx-textMuted">Market workspace</div></div>
      </div>

      <div className="hidden h-8 w-px bg-shafx-border sm:block" />

      {view === 'market' ? <div className="relative min-w-0 flex-1 md:flex-none">
        <button type="button" onClick={() => setMarketOpen((open) => !open)} className="flex min-h-12 w-full min-w-0 items-center gap-3 rounded-xl border border-shafx-border bg-shafx-surface px-3 text-left transition hover:border-shafx-accent/40 md:w-[260px]" aria-expanded={marketOpen} aria-label="Open Market Watch and choose trading instrument">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-shafx-accent/20 bg-shafx-bg shadow-[inset_0_0_18px_rgba(22,119,255,.08)]"><ShafxBrandMark size={25} /></div>
          <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{symbol}</div><div className="mt-0.5 hidden text-[9px] text-shafx-textMuted sm:block">Market Watch • {formatPrice(price, pricePrecision)}</div></div>
          <ChevronDown className={`h-4 w-4 flex-shrink-0 text-shafx-textMuted transition-transform ${marketOpen ? 'rotate-180' : ''}`} />
        </button>
        {marketOpen && <div className="fixed left-3 right-3 top-[76px] z-[200] max-h-[calc(100dvh-152px)] overflow-hidden rounded-2xl border border-shafx-border bg-shafx-surface p-2 shadow-2xl sm:absolute sm:left-0 sm:right-auto sm:top-[calc(100%+8px)] sm:max-h-none sm:w-[min(92vw,420px)]">
          <div className="mb-2 flex items-center gap-2 rounded-xl border border-shafx-border bg-shafx-bg px-3"><Search className="h-4 w-4 text-shafx-textMuted" /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') { setMarketOpen(false); setQuery('') } else if (event.key === 'Enter') selectFirstMatch() }} placeholder="Search symbol…" className="h-10 w-full bg-transparent text-sm outline-none" aria-label="Search trading symbols" /><kbd className="hidden rounded border border-shafx-border px-1.5 py-0.5 text-[8px] text-shafx-textMuted sm:block">⌘K</kbd></div>
          <div className="mb-1 flex items-center justify-between px-2"><div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-shafx-textMuted">Market Watch</div><span className="rounded-full border border-shafx-warning/20 bg-shafx-warning/5 px-1.5 py-0.5 text-[8px] text-shafx-warning">SIMULATED</span></div>
          <div className="mb-2 grid grid-cols-[1fr_82px_70px] gap-2 px-2 text-[8px] uppercase tracking-[0.12em] text-shafx-textMuted"><span>Instrument</span><span className="text-right">Bid / Ask</span><span className="text-right">Move</span></div>
          <div className="max-h-[calc(100dvh-225px)] space-y-1 overflow-y-auto sm:max-h-80">{filtered.map((item) => {
            const quote = simulatedQuote(item)
            const change = quote.pair?.changePercent ?? 0
            const selectedClass = item === symbol ? 'bg-shafx-accent/10 text-shafx-accent' : ''
            return <button key={item} type="button" onClick={() => { onSelectPair(item); setMarketOpen(false); setQuery('') }} className={selectedClass + ' grid min-h-14 w-full grid-cols-[1fr_82px_70px] items-center gap-2 rounded-xl px-3 text-left transition hover:bg-shafx-surfaceHover'}>
              <span className="min-w-0"><span className="block truncate text-xs font-semibold">{item}</span><span className="mt-0.5 block text-[8px] text-shafx-textMuted">{quote.pair?.status === 'closed' ? 'Market closed' : 'Market active'} • {item.includes('XAU') ? 'Metal' : item.includes('BTC') ? 'Crypto' : 'FX'}</span></span>
              <span className="text-right font-mono text-[9px] tabular"><span className="block">{formatPrice(quote.bid, quote.precision)}</span><span className="block text-shafx-textMuted">{formatPrice(quote.ask, quote.precision)}</span></span>
              <span className={(change >= 0 ? 'text-shafx-success' : 'text-shafx-danger') + ' text-right font-mono text-[9px] tabular'}>{change >= 0 ? '+' : ''}{change.toFixed(2)}%</span>
            </button>
          })}{filtered.length === 0 && <div className="px-3 py-5 text-center text-xs text-shafx-textMuted">No matching market</div>}</div>
        </div>}
      </div> : <div className="min-w-0 flex-1"><div className="text-sm font-semibold">{view === 'agent' ? 'SHARFX Bot' : view === 'history' ? 'Trade history' : 'Account'}</div><div className="text-[9px] uppercase tracking-[0.16em] text-shafx-textMuted">{currentMode === 'broker' ? 'Provider workspace' : 'Simulator workspace'}</div></div>}

      {view === 'market' && <div className="hidden items-center gap-2 border-l border-shafx-border pl-4 xl:flex"><span className="font-mono text-sm font-semibold tabular">{formatPrice(price, pricePrecision)}</span><span className="flex items-center gap-1 rounded-full border border-shafx-success/15 bg-shafx-success/5 px-2 py-1 text-[9px] text-shafx-success"><Wifi className="h-3 w-3" />{currentMode === 'broker' ? 'provider' : 'simulation'}</span></div>}

      <div className="ml-auto flex min-w-0 items-center gap-1.5 sm:gap-2">
        <div className="hidden items-center gap-1 rounded-xl border border-shafx-border bg-shafx-surface px-2.5 py-2 text-[9px] text-shafx-textMuted 2xl:flex"><Command className="h-3 w-3" />Search</div>
        <div className="hidden sm:block"><ProviderConnectionControl /></div>
        <div className="relative">
          <button type="button" onClick={() => setAccountOpen((open) => !open)} className="flex min-h-12 items-center gap-2 rounded-xl border border-shafx-border bg-shafx-surface px-3 text-left" aria-expanded={accountOpen} aria-label="Change trading environment">
            <span className={`h-2 w-2 rounded-full ${currentMode === 'broker' ? 'bg-shafx-accent' : 'bg-shafx-success'}`} />
            <span className="hidden text-[10px] font-semibold sm:block">{currentMode === 'broker' ? 'Provider' : 'Demo'}</span>
            <ChevronDown className="h-3.5 w-3.5 text-shafx-textMuted" />
          </button>
          {accountOpen && <div className="absolute right-0 top-[calc(100%+8px)] z-[90] w-64 rounded-2xl border border-shafx-border bg-shafx-surface p-2 shadow-2xl">
            <div className="px-2 py-2 text-[9px] font-semibold uppercase tracking-[0.16em] text-shafx-textMuted">Environment</div>
            <button type="button" onClick={() => { setAccountOpen(false); if (currentMode !== 'simulator') switchMode('simulator') }} className={`flex min-h-11 w-full items-center justify-between rounded-xl px-3 text-left text-xs ${currentMode === 'simulator' ? 'bg-shafx-accent/10 text-shafx-accent' : 'hover:bg-shafx-surfaceHover'}`}><span>SHARFX Simulator</span><span className="text-[9px]">CURRENT</span></button>
            <button type="button" onClick={() => { setAccountOpen(false); if (currentMode !== 'broker') switchMode('broker') }} className={`mt-1 flex min-h-11 w-full items-center justify-between rounded-xl px-3 text-left text-xs ${currentMode === 'broker' ? 'bg-shafx-accent/10 text-shafx-accent' : 'hover:bg-shafx-surfaceHover'}`}><span>Connected provider</span><span className="text-[9px]">SWITCH</span></button>
            <div className="mt-2 flex items-start gap-2 rounded-xl border border-shafx-border bg-shafx-bg p-2.5 text-[9px] leading-4 text-shafx-textMuted"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-shafx-success" />The terminal shell stays provider-neutral. Provider capability differences are surfaced at the action level.</div>
          </div>}
        </div>
        <div className="hidden md:block"><span className="rounded-xl border border-shafx-border bg-shafx-surface px-3 py-2 text-[9px] font-semibold text-shafx-textMuted">{TIMEFRAMES.includes(timeframe) ? timeframe : '—'}</span></div>
        <div className="relative">
          <button type="button" onClick={() => setMoreOpen((open) => !open)} aria-expanded={moreOpen} aria-label="Open SHARFX menu" className="flex h-12 w-12 items-center justify-center rounded-xl border border-shafx-border bg-shafx-surface text-shafx-textMuted active:bg-shafx-surfaceHover">
            <MoreVertical className="h-5 w-5" />
          </button>
          {moreOpen && <div className="absolute right-0 top-[calc(100%+8px)] z-[100] w-64 rounded-2xl border border-shafx-border bg-shafx-surface p-2 shadow-2xl">
            <button type="button" onClick={() => { setMoreOpen(false); setSettingsOpen(true) }} className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left hover:bg-shafx-surfaceHover">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-shafx-accent/10 text-shafx-accent"><Settings2 className="h-4 w-4" /></span>
              <span><span className="block text-xs font-semibold">Settings</span><span className="mt-0.5 block text-[9px] text-shafx-textMuted">Chart, navigation and display</span></span>
            </button>
            <div className="my-1 border-t border-shafx-border" />
            <div className="px-3 py-2 text-[9px] leading-4 text-shafx-textMuted">Provider-neutral workspace. Changes here affect this device only.</div>
          </div>}
        </div>
      </div>
    </div>
    {view === 'market' && <div className="flex gap-1 overflow-x-auto border-t border-shafx-border/70 px-3 py-1.5 sm:px-4 lg:px-5">
      {TIMEFRAMES.map((tf) => <button key={tf} type="button" onClick={() => onTimeframeChange(tf)} aria-pressed={timeframe === tf} className={`min-h-10 flex-shrink-0 rounded-lg px-3 text-[9px] font-semibold transition ${timeframe === tf ? 'bg-shafx-accent text-white' : 'text-shafx-textMuted hover:bg-shafx-surfaceHover hover:text-shafx-text'}`}>{tf}</button>)}
    </div>}
    <ChartSettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
  </header>
}
