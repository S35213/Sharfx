# SHAFX Provider-Agnostic Integration Architecture

## Goal

SHAFX must not be structurally tied to Deriv, Binance, OANDA, Interactive Brokers, or any other single provider. A provider is an adapter behind a normalized SHAFX contract. Provider-specific authentication, symbol formats, order models, streaming protocols, rate limits, and funding flows stay inside the adapter.

This does **not** mean every provider can be connected with zero provider-specific work. It means the SHAFX core does not need to be redesigned when the provider changes. Each new provider gets an adapter that translates its API into the SHAFX contract.

## Current runtime status

The provider-neutral runtime migration is implemented on `main`.

- `App.tsx` consumes `ProviderLiveControl` rather than a Deriv-specific live-market control.
- Account streaming is consumed through `ProviderAccountStream`.
- Deriv-specific transport/session behavior lives under `src/integrations/deriv` and is exposed through the normalized adapter boundary.
- `DerivAccountStream` and `DerivLiveControl` remain only as compatibility wrappers for older callers; they are not the application's provider-selection mechanism.
- The default application remains simulator-first and real-money execution remains disabled.

The production deployment on Vercel is the simulator-safe `main` build. A real broker gateway, credentials and an independently verified execution environment are still required before any live-money capability can be enabled.

## Research conclusion

The research confirms that a single mandatory "universal broker API" would be unsafe and unrealistic. Deriv, Binance, OANDA and Interactive Brokers all expose materially different authentication, instruments, order models, streaming and rate-limit behavior. FIX is a useful standard adapter transport where a provider exposes it, but it is not a universal replacement for provider APIs.

Therefore SHAFX uses a capability-based adapter boundary rather than pretending all providers have identical features.

## Normalized layers

```text
SHAFX UI / analysis / risk / bots
             |
             v
      SHAFX provider runtime
             |
             v
      ProviderAdapter contract
             |
     +-------+---------+-----------+----------+
     |                 |           |          |
   Deriv            Binance     OANDA       Custom
   adapter           adapter    adapter      adapter
     |                 |           |          |
 provider APIs     provider APIs  APIs       API/FIX
```

The core should depend only on normalized SHAFX types. It must not import a provider SDK, provider URL, provider symbol format, provider WebSocket message type, or provider authentication implementation.

## Capability model

Capabilities are independent because real providers differ. The current contract separates account read, market data, historical candles, real-time market data, real-time account data, positions, orders, order placement, order cancellation, position close, multiple accounts, demo/paper accounts, instrument metadata, deposits, and withdrawals.

The adapter exposes only the operations that the provider actually supports and SHAFX has implemented and tested.

## Market-data contract

The provider contract includes normalized primitives for instrument discovery, quote/snapshot retrieval, historical candles, real-time subscriptions, normalized stream events, and explicit stream close handles.

This is necessary because a provider may offer REST polling, WebSocket streams, FIX market data, or another mechanism. SHAFX analysis consumes the normalized data instead of knowing which transport produced it.

## Instrument normalization — the "car fits the road" layer

A symbol string alone is not enough to safely route an order. Providers can differ in contract size, quantity rules, price increments, currencies, supported order types and time-in-force rules.

`ProviderInstrument` carries normalized metadata such as SHAFX symbol/provider symbol, asset class, base/quote currencies, contract size and pip size where applicable, price increment, minimum/maximum quantity, quantity step, supported order types, supported time-in-force values, and tradability.

The SHAFX risk/order layer validates an order against this metadata before an adapter is allowed to send it. The adapter remains responsible for final provider-side validation because the provider is authoritative.

## Order normalization

The portable order request contains symbol, side, quantity + quantity unit, market/limit/stop/stop-limit type, optional limit/stop price, optional stop-loss/take-profit, time-in-force, and a client order id for idempotency/correlation.

Provider-specific order fields stay inside the adapter. A provider can support richer orders without forcing every provider to implement them.

## Authentication and credentials

Provider credentials and authorization codes stay server-side. Browser code may start an OAuth redirect or request a short-lived server-issued session, but it must not receive long-lived provider secrets.

For OAuth authorization-code flows, SHAFX should use PKCE, exact redirect URI matching, state/CSRF validation and server-side code exchange. API-key providers keep keys/signing secrets on the server-side provider gateway.

## Sessions and streaming

A provider adapter owns its provider-specific session lifecycle. SHAFX does not assume that `connect()` means the same thing everywhere.

The normalized contract supports WebSocket subscriptions, HTTP polling, server-side streaming, FIX sessions, and provider-specific session/bootstrap sequences. The adapter is responsible for reconnects, subscription cleanup, authentication refresh, stale-data detection and provider-specific heartbeat rules.

## Errors, rate limits and retries

Provider errors are normalized before reaching the SHAFX UI. The contract includes a stable SHAFX error code, human-readable message, retryable/non-retryable flag, provider error code when available, and request correlation id when available.

Adapters must implement provider-specific rate limiting and retry behavior. SHAFX must never blindly retry an order-placement request. Order submission requires idempotency/correlation and reconciliation of the provider's actual order state before retrying.

## Funding

Funding is deliberately independent of trading. Each provider reports `api`, `redirect`, `manual`, or `unsupported` funding capability. A provider offering trading APIs does not automatically mean SHAFX can safely or legally initiate deposits/withdrawals through those APIs.

## Current catalog

| Provider | Status | Current SHAFX execution | Funding | Notes |
| --- | --- | --- | --- | --- |
| SHAFX Simulator | available | simulated only | unsupported | No real money |
| Deriv | available | real execution disabled | redirect | Account, market-data and realtime account paths run through the provider adapter boundary |
| Binance | planned | not implemented | unsupported until verified | Requires server-side signed integration and product-specific symbol/order mapping |
| OANDA | planned | not implemented | unsupported until verified | REST + pricing stream; provider-specific order and instrument rules |
| Interactive Brokers | planned | not implemented | unsupported until verified | Provider-specific sessions, conids, market-data subscriptions and pacing rules |
| Custom/FIX provider | planned | not implemented | provider-specific | FIX can be an adapter transport where the provider exposes it |

## Provider implementation checklist

A provider is promoted from `planned` to `available` only after all required pieces exist and pass tests:

1. Server-side authentication/authorization flow.
2. Account discovery and normalized account snapshots.
3. Instrument discovery and provider-to-SHAFX symbol mapping.
4. Instrument trading constraints: quantity, price increment, contract size and supported order types/TIF.
5. Historical market data where supported.
6. Real-time market data where supported.
7. Position/order normalization.
8. Order placement/cancel/modify/close only when the provider actually supports it and SHAFX has explicitly enabled it.
9. Funding flow only where the provider allows it and the integration has a verified mechanism.
10. Rate-limit handling and safe retry policy.
11. Reconnect, heartbeat and stale-data handling for streaming providers.
12. Normalized error handling and request correlation.
13. Audit logging and idempotency for externally triggered state changes.
14. Demo/paper validation before any live execution path is enabled.
15. Provider-specific integration tests using provider test/sandbox facilities where available.
16. Security review confirming that provider secrets never reach browser bundles or `VITE_*` variables.
17. Operational monitoring and reconciliation for order/account state.

## Interoperability strategy

SHAFX supports three integration classes rather than forcing everything through one protocol:

1. **Native provider adapter** — REST/WebSocket/OAuth/API-key APIs.
2. **Standard protocol adapter** — providers exposing FIX or another industry protocol.
3. **Custom gateway adapter** — a company with a private API or server-to-server integration.

This gives SHAFX a realistic path to supporting many brokers and companies without pretending they all have the same API.

## Official references used

- Deriv API overview: https://developers.deriv.com/docs/intro/api-overview/
- Deriv OAuth 2.0 + PKCE: https://developers.deriv.com/docs/intro/oauth/
- Binance Spot/WebSocket account API: https://developers.binance.com/en/docs/catalog/core-trading-spot-trading/api/ws-api/account
- OANDA API comparison: https://developer.oanda.com/rest-live-v20/api-comparison/
- OANDA pricing/streaming: https://developer.oanda.com/rest-live-v20/pricing-ep/
- OANDA order definitions: https://developer.oanda.com/rest-live-v20/order-df/
- Interactive Brokers Web API: https://ibkrcampus.com/campus/ibkr-api-page/webapi-doc/
- FIX standards: https://fixtrading.org/standards/
- FIX protocol: https://fixtrading.org/standards/fix-protocol/
