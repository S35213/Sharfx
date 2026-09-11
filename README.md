# SHAFX

SHAFX is an original Forex analysis terminal prototype and **simulator only**.

## Safety boundary

**SIMULATED — NOT FINANCIAL ADVICE.** SHAFX v0.1 has no broker connection, no real-money order execution, no payment processing, and no live market-data connection. Market data, analysis, account values, and orders are simulated.

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

The risk engine is symbol-aware and requires an explicit quote-to-account conversion rate whenever the quote currency differs from the account currency. Lot sizing floors to the lot step and never silently increases a position to the minimum lot when that would exceed the risk budget.

## Roadmap

- v0.1: terminal foundation, mock data, analysis UI, risk calculator, simulator, responsive UX, tests.
- v0.2: backtesting, replay, journal, performance statistics.
- v0.3+: evaluate real market/broker integrations only after the simulator is validated.
