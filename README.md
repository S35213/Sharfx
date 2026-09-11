# SHAFX

SHAFX is an original Forex analysis terminal prototype and **simulator only**.

## Safety boundary

**SIMULATED — NOT FINANCIAL ADVICE.** SHAFX has no broker connection, no real-money order execution, no payment processing, and no live market-data connection. Market data, analysis, account values, orders, replay, and backtests are simulated.

## Stack

- React 18 + TypeScript
- Vite
- Tailwind CSS
- Lightweight Charts
- Vitest
- ESLint 9 flat config

## Run locally

```bash
npm install
npm run dev
npm run build
npm run lint
npm test
npm audit
```

## Architecture

The UI consumes the `MarketDataSource` interface. The current implementation is `MockDataSource`. Simulated user orders cross one explicit boundary: `src/engine/simulator/submitSimulatedOrder.ts`.

The analysis stack is deterministic and simulator-safe: market structure, support/resistance, liquidity, setup detection, and the AI trading-agent layer operate on supplied candle data. The AI agent can prepare and review simulated opportunities, but execution still requires explicit user approval.

The backtest engine replays historical candle sequences without lookahead: signals receive only prior candles, entries occur at the next candle open, and ambiguous same-candle stop/target events resolve conservatively to the stop. Quote-to-account conversion must be explicit when required.

## Phase 3 acceptance

Phase 3 — Backtesting & Strategy Development — is complete on the simulator boundary. It includes:

- deterministic backtest engine with strict OHLC/chronology validation
- no-lookahead signal evaluation and next-candle entries
- conservative intrabar SL/TP handling
- explicit currency conversion validation
- break-even trade classification
- strategy replay analytics, trade log, and equity curve
- visual candle-by-candle replay controls
- simulator trading performance statistics
- completed-trade journal with local notes and deterministic review text
- responsive/mobile-friendly replay and analysis controls
- persistent simulator and financial-safety disclaimers
- automated CI verification of build, lint, tests, and high-severity dependency audit

## Roadmap

- v0.1: terminal foundation, mock data, analysis UI, risk calculator, simulator, responsive UX, tests — **complete**.
- v0.2: backtesting, replay, journal, performance statistics — **complete**.
- v0.3+: advanced AI/trading-agent capabilities and evaluation of real market/broker integrations only after the simulator is validated.
