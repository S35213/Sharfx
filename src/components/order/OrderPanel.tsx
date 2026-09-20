import React, { useEffect, useMemo, useState } from 'react'
import { AlertCircle, ArrowDownCircle, ArrowUpCircle, Sparkles } from 'lucide-react'
import type { RiskCalculationResult, SimulatedOrderDraft, SymbolSpec } from '../../types'
import type { SetupCandidate } from '../../engine/setup/types'
import { calculateRisk } from '../../engine/risk/riskCalculator'
import { formatCurrency, formatPrice } from '../../lib/format'

interface Props { symbol: string; currentPrice: number; accountBalance: number; accountCurrency: string; symbolSpec: SymbolSpec; conversionRate?: number; onSubmitOrder: (draft: SimulatedOrderDraft) => void; aiSetup?: SetupCandidate | null }
const emptyResult: RiskCalculationResult = { isValid: false, riskAmount: 0, stopDistancePips: 0, rewardDistancePips: 0, riskRewardRatio: 0, suggestedLotSize: 0, pipValuePerLot: 0, estimatedLossAtStop: 0 }

export const OrderPanel: React.FC<Props> = ({ symbol, currentPrice, accountBalance, accountCurrency, symbolSpec, conversionRate, onSubmitOrder, aiSetup }) => {
  const [orderType, setOrderType] = useState<'BUY' | 'SELL'>('BUY')
  const readStoredLotSize = (): string => typeof window !== 'undefined' ? window.sessionStorage.getItem('shafx-simulator-lot-size') || '0.10' : '0.10'
  const [lotSize, setLotSize] = useState(readStoredLotSize)
  const [entryPrice, setEntryPrice] = useState(formatPrice(currentPrice, symbolSpec.pricePrecision))
  const [stopLoss, setStopLoss] = useState('')
  const [takeProfit, setTakeProfit] = useState('')
  const [riskPercent, setRiskPercent] = useState('1.0')

  useEffect(() => {
    setOrderType('BUY')
    const storedLot = typeof window !== 'undefined' ? window.sessionStorage.getItem('shafx-simulator-lot-size') || '' : ''
    const parsedStoredLot = Number(storedLot)
    const storedLotIsValid = Number.isFinite(parsedStoredLot)
      && parsedStoredLot >= symbolSpec.minLotSize
      && parsedStoredLot <= symbolSpec.maxLotSize
      && Math.abs((parsedStoredLot / symbolSpec.lotStep) - Math.round(parsedStoredLot / symbolSpec.lotStep)) < 1e-8
    setLotSize(storedLotIsValid ? storedLot : symbolSpec.minLotSize.toFixed(2))
    setEntryPrice(currentPrice.toFixed(symbolSpec.pricePrecision))
    setStopLoss('')
    setTakeProfit('')
    setRiskPercent('1.0')
  }, [currentPrice, symbol, symbolSpec])

  useEffect(() => {
    const onLotSize = (event: Event): void => {
      const detail = (event as CustomEvent<string>).detail
      if (detail) setLotSize(detail)
    }
    window.addEventListener('shafx-lot-size', onLotSize)
    return () => window.removeEventListener('shafx-lot-size', onLotSize)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || !lotSize.trim()) return
    window.sessionStorage.setItem('shafx-simulator-lot-size', lotSize)
    window.dispatchEvent(new CustomEvent<string>('shafx-lot-size', { detail: lotSize }))
  }, [lotSize])

  const applyAISetup = (): void => {
    if (!aiSetup) return
    setOrderType(aiSetup.direction)
    setEntryPrice(aiSetup.entryPrice.toFixed(symbolSpec.pricePrecision))
    setStopLoss(aiSetup.stopLoss.toFixed(symbolSpec.pricePrecision))
    setTakeProfit(aiSetup.takeProfit.toFixed(symbolSpec.pricePrecision))
  }

  const numEntry = Number(entryPrice)
  const defaultStopDistance = symbolSpec.pipSize * 30
  const defaultRewardDistance = symbolSpec.pipSize * 50
  const numSL = stopLoss === '' ? Number((numEntry + (orderType === 'BUY' ? -defaultStopDistance : defaultStopDistance)).toFixed(symbolSpec.pricePrecision)) : Number(stopLoss)
  const numTP = takeProfit === '' ? Number((numEntry + (orderType === 'BUY' ? defaultRewardDistance : -defaultRewardDistance)).toFixed(symbolSpec.pricePrecision)) : Number(takeProfit)
  const numRisk = Number(riskPercent)
  const riskCalc = useMemo(() => { if (![numEntry, numSL, numTP, numRisk].every(Number.isFinite)) return { ...emptyResult, errorMessage: 'Please fill in all fields with valid numbers.' }; return calculateRisk({ accountBalance, accountCurrency, riskPercent: numRisk, side: orderType, entryPrice: numEntry, stopLoss: numSL, takeProfit: numTP, symbolSpec, conversionRate }) }, [accountBalance, accountCurrency, conversionRate, numEntry, numRisk, numSL, numTP, orderType, symbolSpec])
  const parsedLotSize = Number(lotSize)
  const lotSizeIsValid = Number.isFinite(parsedLotSize) && parsedLotSize >= symbolSpec.minLotSize && parsedLotSize <= symbolSpec.maxLotSize && Math.abs((parsedLotSize / symbolSpec.lotStep) - Math.round(parsedLotSize / symbolSpec.lotStep)) < 1e-8
  const canSubmit = riskCalc.isValid && lotSizeIsValid

  const handleSubmit = (e: React.FormEvent): void => { e.preventDefault(); if (!canSubmit) return; onSubmitOrder({ symbol, type: orderType, lotSize: parsedLotSize, entryPrice: numEntry, stopLoss: numSL, takeProfit: numTP, riskPercent: numRisk, riskAmount: riskCalc.riskAmount, rewardAmount: riskCalc.riskAmount * riskCalc.riskRewardRatio, riskRewardRatio: riskCalc.riskRewardRatio }); setStopLoss(''); setTakeProfit('') }
  const applySuggestedLot = (): void => { if (riskCalc.isValid && riskCalc.suggestedLotSize > 0) setLotSize(riskCalc.suggestedLotSize.toFixed(2)) }

  return <div className="space-y-4 rounded-lg border border-shafx-border bg-shafx-surface p-4"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Order Ticket</h3><span className="flex items-center gap-1 rounded border border-yellow-500/20 bg-yellow-500/10 px-2 py-0.5 text-xs text-yellow-500"><AlertCircle className="h-3 w-3" />Simulator</span></div>{aiSetup && <div className="rounded border border-shafx-primary/30 bg-shafx-primary/10 p-3"><div className="flex items-center justify-between gap-2"><div><p className="flex items-center gap-1 text-xs font-semibold text-shafx-primary"><Sparkles className="h-3 w-3" />AI trade idea ready</p><p className="mt-1 text-[11px] text-shafx-textMuted">The agent prepared this setup. Nothing is placed until you review and press the order button.</p></div><button type="button" onClick={applyAISetup} className="min-h-11 shrink-0 rounded bg-shafx-primary px-3 py-2 text-xs font-semibold text-white">Review AI setup</button></div></div>}<form onSubmit={handleSubmit} className="space-y-3"><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setOrderType('BUY')} aria-pressed={orderType === 'BUY'} className={`flex min-h-11 items-center justify-center gap-2 rounded text-sm font-semibold ${orderType === 'BUY' ? 'bg-shafx-success text-white' : 'border border-shafx-success/30 bg-shafx-surfaceHover text-shafx-success'}`}><ArrowUpCircle className="h-4 w-4" />BUY</button><button type="button" onClick={() => setOrderType('SELL')} aria-pressed={orderType === 'SELL'} className={`flex min-h-11 items-center justify-center gap-2 rounded text-sm font-semibold ${orderType === 'SELL' ? 'bg-shafx-danger text-white' : 'border border-shafx-danger/30 bg-shafx-surfaceHover text-shafx-danger'}`}><ArrowDownCircle className="h-4 w-4" />SELL</button></div><div className="grid grid-cols-2 gap-3"><div><label className="mb-1 block text-xs text-shafx-textMuted">Symbol</label><input value={symbol} disabled className="w-full rounded border border-shafx-border bg-shafx-bg px-2 py-2 font-mono text-sm" /></div><div><label className="mb-1 block text-xs text-shafx-textMuted">Lot Size</label><input type="number" step={symbolSpec.lotStep} min={symbolSpec.minLotSize} max={symbolSpec.maxLotSize} value={lotSize} onChange={(e) => setLotSize(e.target.value)} className="w-full rounded border border-shafx-border bg-shafx-bg px-2 py-2 font-mono text-sm focus:border-shafx-primary focus:outline-none" /></div></div><div><label className="mb-1 block text-xs text-shafx-textMuted">Entry Price</label><input type="number" step={symbolSpec.pipSize} value={entryPrice} onChange={(e) => setEntryPrice(e.target.value)} className="w-full rounded border border-shafx-border bg-shafx-bg px-2 py-2 font-mono text-sm focus:border-shafx-primary focus:outline-none" /></div><div className="grid grid-cols-2 gap-3"><div><label className="mb-1 block text-xs text-shafx-textMuted">Stop Loss</label><input type="number" step={symbolSpec.pipSize} placeholder="Auto" value={stopLoss} onChange={(e) => setStopLoss(e.target.value)} className="w-full rounded border border-shafx-border bg-shafx-bg px-2 py-2 font-mono text-sm text-shafx-danger focus:border-shafx-primary focus:outline-none" /></div><div><label className="mb-1 block text-xs text-shafx-textMuted">Take Profit</label><input type="number" step={symbolSpec.pipSize} placeholder="Auto" value={takeProfit} onChange={(e) => setTakeProfit(e.target.value)} className="w-full rounded border border-shafx-border bg-shafx-bg px-2 py-2 font-mono text-sm text-shafx-success focus:border-shafx-primary focus:outline-none" /></div></div><div><label className="mb-1 block text-xs text-shafx-textMuted">Risk %</label><input type="number" step="0.1" min="0.1" max="100" value={riskPercent} onChange={(e) => setRiskPercent(e.target.value)} className="w-full rounded border border-shafx-border bg-shafx-bg px-2 py-2 font-mono text-sm focus:border-shafx-primary focus:outline-none" /></div>{riskCalc.isValid && <div className="space-y-1.5 rounded border border-shafx-border bg-shafx-bg p-3 text-xs"><div className="flex justify-between"><span className="text-shafx-textMuted">Risk Amount</span><span className="font-mono text-shafx-danger tabular">{formatCurrency(riskCalc.riskAmount, accountCurrency)}</span></div><div className="flex justify-between"><span className="text-shafx-textMuted">Stop Distance</span><span className="font-mono tabular">{riskCalc.stopDistancePips} pips</span></div><div className="flex justify-between"><span className="text-shafx-textMuted">Potential Reward</span><span className="font-mono text-shafx-success tabular">{formatCurrency(riskCalc.riskAmount * riskCalc.riskRewardRatio, accountCurrency)}</span></div><div className="flex items-center justify-between border-t border-shafx-border pt-1.5"><span className="text-shafx-textMuted">Suggested Lot Size</span><button type="button" onClick={applySuggestedLot} className="font-mono font-semibold text-shafx-primary tabular">{riskCalc.suggestedLotSize.toFixed(2)} lots</button></div><div className="flex justify-between"><span className="text-shafx-textMuted">Risk/Reward</span><span className="font-mono tabular">1 : {riskCalc.riskRewardRatio}</span></div></div>}{!riskCalc.isValid && riskCalc.errorMessage && <div className="rounded border border-shafx-danger/20 bg-shafx-danger/10 p-2 text-xs text-shafx-danger">{riskCalc.errorMessage}</div>}{riskCalc.isValid && !lotSizeIsValid && <div className="rounded border border-shafx-danger/20 bg-shafx-danger/10 p-2 text-xs text-shafx-danger">Lot size must be between {symbolSpec.minLotSize} and {symbolSpec.maxLotSize} and follow step {symbolSpec.lotStep}.</div>}<button type="submit" disabled={!canSubmit} className={`min-h-11 w-full rounded text-sm font-semibold ${canSubmit ? (orderType === 'BUY' ? 'bg-shafx-success text-white' : 'bg-shafx-danger text-white') : 'cursor-not-allowed bg-shafx-border text-shafx-textMuted'}`}>Place Simulated {orderType} Order</button></form></div>
}
