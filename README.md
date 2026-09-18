# SHAFX

SHAFX is an original Forex analysis terminal prototype with a **simulator-first safety boundary**.

## Persistent implementation tree

The project maintains a checked handoff tree at [`docs/SHAFX_IMPLEMENTATION_TREE.md`](docs/SHAFX_IMPLEMENTATION_TREE.md). It is the source of truth for implementation progress. Future agents must continue from the first unchecked/failed gate and must not restart the audit from zero.

## Safety boundary

**SIMULATED — NOT FINANCIAL ADVICE.** The default application remains simulator mode. No real-money order is submitted unless an explicit live broker gateway is configured, live execution is approved, and every execution safety gate passes.

The repository contains live-integration infrastructure, but it does **not** contain broker credentials, provider secrets, or a claim of live-money readiness. Market and broker gateways are external boundaries and must be supplied by a secure backend/provider configuration.

## Stack

- React + TypeScript
- Vite
- Tailwind CSS
- Lightweight Charts
- Vitest
- ESLint flat config

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

The UI consumes the `MarketDataSource` interface. The default implementation is `MockDataSource`. Live mode is an explicit alternate path through `createMarketDataSource`, `LiveMarketDataSource`, and `HttpMarketTransport`.

The live market boundary validates OHLC shape and chronological ordering, supports timeout and controlled retry behavior, and blocks stale/future market data when live freshness enforcement is enabled. `LiveMarketSnapshot` exposes candle data together with a freshness result, while `LiveMarketPoller` provides non-overlapping polling for a future live gateway.

The live broker boundary is deliberately fail-closed. `LiveBroker` has no configured transport by default. `HttpBrokerTransport` is a gateway client using browser credentials rather than embedding broker secrets in the frontend. `executeWithPolicy` requires explicit user approval, a matching confirmation id, a live broker capable of placement, and fresh-price execution guards before submitting an order.

### Provider-agnostic broker/exchange layer

SHAFX now has a normalized provider contract under `src/integrations/core`. Providers declare capabilities instead of being assumed to support every feature. Trading, account data, real-time streams, deposits, and withdrawals are separate capability areas.

Current catalog:

- **SHAFX Simulator** — available; simulated only.
- **Deriv** — available; current account/market integration remains intact and real execution stays disabled.
- **Binance** — planned; adapter not implemented yet.
- **OANDA** — planned; adapter not implemented yet.
- **Interactive Brokers** — planned; adapter not implemented yet.

See [`docs/provider-integration-architecture.md`](docs/provider-integration-architecture.md) for the researched provider matrix, security rules, and adapter implementation checklist.

The important rule is that the SHAFX core never assumes a provider has the same authentication, symbols, order types, streaming model, or funding APIs as another provider. A provider adapter translates between the normalized SHAFX contract and that provider's API. OAuth authorization uses server-side token exchange and PKCE where applicable; long-lived provider credentials are never placed in client `VITE_*` variables.

Funding is also separate from trading. A provider can expose deposits/withdrawals through an API, official redirect, manual process, or not at all. SHAFX must advertise only the capability actually implemented by the active adapter.

The analysis stack is deterministic and simulator-safe: market structure, support/resistance, liquidity, setup detection, and the AI trading-agent layer operate on supplied candle data. The AI agent can prepare and review simulated opportunities, but execution still requires explicit user approval.

## Phase 3 acceptance

Phase 3 — Backtesting & Strategy Development — is complete on the simulator boundary. It includes deterministic backtesting, no-lookahead replay, conservative SL/TP handling, strategy analytics, visual replay, performance statistics, a trading journal, responsive controls, persistent safety disclaimers, and automated CI verification.

## Phase 4 acceptance

Phase 4 — Advanced AI Trading Agent — is implemented on the simulator boundary. It includes multi-timeframe reasoning, setup preparation and explicit approval, visible chart annotations, position monitoring, deterministic learning from completed simulator trades, recurring-mistake detection, internal multi-source evidence aggregation, and pluggable future research/data boundaries. It does not fabricate live news or silently access live networks.

## Phase 5 acceptance

Phase 5 — Live Market & Broker Integration Infrastructure — is implemented as a provider-neutral, fail-closed foundation. It includes:

- validated HTTP market transport with timeout and transient-failure retry policy
- client-error fail-fast behavior
- strict live candle validation
- freshness and clock health gates
- freshness-aware live snapshots
- non-overlapping live market polling
- explicit simulator/live data-source selection
- fail-closed live broker adapter
- secure HTTP broker-gateway transport with no frontend broker secrets
- explicit user-approval and confirmation gates
- mandatory fresh-price execution guards
- automated CI verification of build, lint, tests, and high-severity dependency audit

## Quota and concurrency verification

The bot's daily cycle-unit boundary is covered by an authenticated production concurrency test. The test uses a dedicated isolated account and verifies that a FREE account receiving 20 simultaneous 1-unit requests can consume exactly 5 units, with the remaining requests rejected by the daily limit. REGULAR/PRO subscription provisioning remains separate from this test.

### External prerequisites before real-money use

A real market-data provider and real broker gateway still have to be deployed and configured outside this frontend repository. That includes provider-specific credentials, server-side authentication/session handling, account permissions, instrument mappings, production observability, and independent paper/live end-to-end testing. Credentials must never be committed to this repository or exposed through `VITE_*` client variables.

Until those external prerequisites are supplied and tested, SHAFX remains a simulator by default and must not be treated as a live-money trading system.

## Roadmap

- v0.1: terminal foundation — **complete**.
- v0.2: backtesting, replay, journal, performance statistics — **complete**.
- v0.3: advanced AI/trading-agent capabilities — **complete on simulator boundary**.
- v0.4: live market/broker integration infrastructure — **complete as a provider-neutral safety boundary; external provider/broker deployment remains required**.
- v0.5: provider-agnostic connection contracts and researched provider catalog — **implemented**; provider-specific adapters still require separate verification and enablement.
- v1.0: production deployment, compliance, business/payment/licensing decisions, and real-money certification — **not started**.
