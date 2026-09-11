import type { OHLCV } from '../../types'
import type { BacktestConfig, BacktestResult, BacktestSignal, BacktestSignalProvider, BacktestTrade } from './types'

const finitePositive = (value: number): boolean => Number.isFinite(value) && value > 0
const finite = (value: number): boolean => Number.isFinite(value)

const validateCandle = (candle: OHLCV): boolean =>
  finite(candle.time) && finitePositive(candle.open) && finitePositive(candle.high) && finitePositive(candle.low) && finitePositive(candle.close) && candle.high >= Math.max(candle.open, candle.close) && candle.low <= Math.min(candle.open, candle.close) && candle.high >= candle.low

const priceToCash = (entry: number, exit: number, side: 'BUY' | 'SELL', lotSize: number, pipSize: number, contractSize: number, conversionRate: number): number => {
  const priceMove = side === 'BUY' ? exit - entry : entry - exit
  const pips = priceMove / pipSize
  return pips * pipSize * contractSize * lotSize * conversionRate
}

const validSignal = (signal: BacktestSignal, price: number, spec: BacktestConfig['symbolSpec']): boolean => {
  if (!finitePositive(signal.stopLoss) || !finitePositive(signal.takeProfit) || !finitePositive(signal.lotSize)) return false
  if (signal.lotSize < spec.minLotSize || signal.lotSize > spec.maxLotSize) return false
  const steps = Math.round((signal.lotSize - spec.minLotSize) / spec.lotStep)
  if (Math.abs(signal.lotSize - (spec.minLotSize + steps * spec.lotStep)) > 1e-8) return false
  if (signal.side === 'BUY') return signal.stopLoss < price && signal.takeProfit > price
  return signal.stopLoss > price && signal.takeProfit < price
}

const exitForCandle = (signal: BacktestSignal, candle: OHLCV): { price: number; reason: 'stop-loss' | 'take-profit' } | null => {
  if (signal.side === 'BUY') {
    const hitStop = candle.low <= signal.stopLoss
    const hitTarget = candle.high >= signal.takeProfit
    if (hitStop) return { price: signal.stopLoss, reason: 'stop-loss' }
    if (hitTarget) return { price: signal.takeProfit, reason: 'take-profit' }
  } else {
    const hitStop = candle.high >= signal.stopLoss
    const hitTarget = candle.low <= signal.takeProfit
    if (hitStop) return { price: signal.stopLoss, reason: 'stop-loss' }
    if (hitTarget) return { price: signal.takeProfit, reason: 'take-profit' }
  }
  return null
}

export const runBacktest = (candles: OHLCV[], config: BacktestConfig, signalProvider: BacktestSignalProvider): BacktestResult => {
  if (!finitePositive(config.initialBalance)) throw new Error('Initial balance must be a positive finite number.')
  if (!finitePositive(config.symbolSpec.pipSize) || !finitePositive(config.symbolSpec.contractSize) || !finitePositive(config.symbolSpec.lotStep)) throw new Error('Symbol specification is invalid.')
  if (config.symbolSpec.minLotSize <= 0 || config.symbolSpec.maxLotSize < config.symbolSpec.minLotSize) throw new Error('Symbol lot configuration is invalid.')
  if (!Number.isInteger(config.symbolSpec.pricePrecision) || config.symbolSpec.pricePrecision < 0) throw new Error('Symbol price precision is invalid.')
  if (!candles.length) throw new Error('Backtest requires at least one candle.')
  if (candles.some((candle) => !validateCandle(candle))) throw new Error('Backtest contains invalid OHLC data.')
  for (let i = 1; i < candles.length; i += 1) if (candles[i].time <= candles[i - 1].time) throw new Error('Backtest candles must be strictly chronological.')

  const start = Math.max(1, config.startIndex ?? 1)
  const end = Math.min(candles.length - 1, config.endIndex ?? candles.length - 1)
  if (start > end) throw new Error('Backtest index range is invalid.')

  const conversionRate = config.symbolSpec.quoteCurrency === 'USD' ? 1 : 1
  let balance = config.initialBalance
  let peak = balance
  let maxDrawdown = 0
  let open: { signal: BacktestSignal; entryPrice: number; entryTime: number; id: string } | null = null
  const trades: BacktestTrade[] = []
  let sequence = 0

  for (let i = start; i <= end; i += 1) {
    const candle = candles[i]

    if (open) {
      const exit = exitForCandle(open.signal, candle)
      if (exit) {
        const profit = priceToCash(open.entryPrice, exit.price, open.signal.side, open.signal.lotSize, config.symbolSpec.pipSize, config.symbolSpec.contractSize, conversionRate)
        balance += profit
        const outcome = profit >= 0 ? 'win' : 'loss'
        trades.push({ id: open.id, side: open.signal.side, entryTime: open.entryTime, exitTime: candle.time, entryPrice: open.entryPrice, exitPrice: exit.price, stopLoss: open.signal.stopLoss, takeProfit: open.signal.takeProfit, lotSize: open.signal.lotSize, profit: Number(profit.toFixed(2)), outcome, exitReason: exit.reason })
        open = null
        peak = Math.max(peak, balance)
        maxDrawdown = Math.max(maxDrawdown, peak - balance)
        continue
      }
    }

    if (!open) {
      const history = candles.slice(0, i)
      const signal = signalProvider(history, i)
      if (signal && validSignal(signal, candle.open, config.symbolSpec)) {
        open = { signal, entryPrice: candle.open, entryTime: candle.time, id: `BT-${String(++sequence).padStart(5, '0')}` }
      }
    }
  }

  if (open) {
    const last = candles[end]
    const profit = priceToCash(open.entryPrice, last.close, open.signal.side, open.signal.lotSize, config.symbolSpec.pipSize, config.symbolSpec.contractSize, conversionRate)
    balance += profit
    trades.push({ id: open.id, side: open.signal.side, entryTime: open.entryTime, exitTime: last.time, entryPrice: open.entryPrice, exitPrice: last.close, stopLoss: open.signal.stopLoss, takeProfit: open.signal.takeProfit, lotSize: open.signal.lotSize, profit: Number(profit.toFixed(2)), outcome: profit >= 0 ? 'win' : 'loss', exitReason: 'end-of-test' })
    peak = Math.max(peak, balance)
    maxDrawdown = Math.max(maxDrawdown, peak - balance)
  }

  const grossProfit = trades.filter((trade) => trade.profit > 0).reduce((sum, trade) => sum + trade.profit, 0)
  const grossLoss = Math.abs(trades.filter((trade) => trade.profit < 0).reduce((sum, trade) => sum + trade.profit, 0))
  const winningTrades = trades.filter((trade) => trade.profit > 0).length
  const losingTrades = trades.filter((trade) => trade.profit < 0).length
  const totalTrades = trades.length

  return {
    initialBalance: Number(config.initialBalance.toFixed(2)),
    finalBalance: Number(balance.toFixed(2)),
    netProfit: Number((balance - config.initialBalance).toFixed(2)),
    returnPercent: Number((((balance - config.initialBalance) / config.initialBalance) * 100).toFixed(2)),
    totalTrades,
    winningTrades,
    losingTrades,
    winRate: totalTrades ? Number(((winningTrades / totalTrades) * 100).toFixed(2)) : 0,
    grossProfit: Number(grossProfit.toFixed(2)),
    grossLoss: Number(grossLoss.toFixed(2)),
    profitFactor: grossLoss > 0 ? Number((grossProfit / grossLoss).toFixed(2)) : null,
    maxDrawdown: Number(maxDrawdown.toFixed(2)),
    trades,
  }
}
