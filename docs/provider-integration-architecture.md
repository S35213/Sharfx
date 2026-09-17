# SHAFX Provider-Agnostic Integration Architecture

## Goal

SHAFX must not be structurally tied to Deriv, Binance, OANDA, Interactive Brokers, or any other single provider. A provider is an adapter behind a normalized SHAFX contract. Provider-specific authentication, symbol formats, order models, streaming protocols, rate limits, and funding flows stay inside the adapter.

This does **not** mean every provider can be connected with zero provider-specific work. It means the SHAFX core does not need to be redesigned when the provider changes. Each new provider gets an adapter that translates its API into the SHAFX contract.

## Research conclusion

The research confirms that a single mandatory "universal broker API" would be unsafe and unrealistic:

- Deriv uses REST for account/authentication and WebSocket for real-time market data and trading; authenticated WebSocket access can be established through an OTP flow. citeturn1search5turn0search3
- Binance uses signed account/trading APIs and WebSocket user-data functionality with provider-specific request weights, timestamps and API-key handling. citeturn0search0
- OANDA's v20 API has broker-specific instruments, order types, durations, position/trade models and pricing streams. citeturn1search1turn1search2turn1search3
- Interactive Brokers has its own session lifecycle, market-data subscriptions, contract identifiers, pacing limits and order model. Its Web API also separates trading from some account-management features. citeturn1search0
- FIX provides an industry-standard interoperability option for firms that expose FIX, including order handling and market-data messages, but it is not a replacement for every retail/provider-specific API. citeturn0search2turn0search5

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

Capabilities are independent because real providers differ. The current contract separates:

- account read
- market data
- historical candles
- real-time market data
- real-time account data
- positions
- orders
- order placement
- order cancellation
- position close
- multiple accounts
- demo/paper accounts
- instrument metadata
- deposits
- withdrawals

The adapter exposes only the operations that the provider actually supports and SHAFX has implemented and tested.

## Market-data contract

The provider contract now includes normalized primitives for:

- instrument discovery
- quote/snapshot retrieval
- historical candles
- real-time subscriptions
- normalized stream events
- explicit stream close handles

This is necessary because a provider may offer REST polling, WebSocket streams, FIX market data, or another mechanism. SHAFX analysis consumes the normalized data instead of knowing which transport produced it.

## Instrument normalization — the "car fits the road" layer

A symbol string alone is not enough to safely route an order. Providers can differ in contract size, quantity rules, price increments, currencies, supported order types and time-in-force rules.

`ProviderInstrument` therefore carries normalized metadata such as:

- SHAFX symbol and provider symbol
- asset class
- base/quote currencies
- contract size and pip size where applicable
- price increment
- minimum/maximum quantity
- quantity step
- supported order types
- supported time-in-force values
- tradability

The SHAFX risk/order layer should validate an order against this metadata before an adapter is allowed to send it. The adapter remains responsible for final provider-side validation because the provider is authoritative.

## Order normalization

The portable order request contains:

- symbol
- side
- quantity + quantity unit
- market/limit/stop/stop-limit type
- optional limit/stop price
- optional stop-loss/take-profit
- time-in-force
- client order id for idempotency/correlation

Provider-specific order fields stay inside the adapter. A provider can support richer orders without forcing every provider to implement them.

## Authentication and credentials

Provider credentials and authorization codes stay server-side. Browser code may start an OAuth redirect or request a short-lived server-issued session, but it must not receive long-lived provider secrets.

For OAuth authorization-code flows, SHAFX should use PKCE, exact redirect URI matching, state/CSRF validation and server-side code exchange. Deriv's current OAuth documentation explicitly uses authorization code + PKCE and state verification. citeturn0search3

API-key providers require the same separation: keys/signing secrets remain on the server-side provider gateway. Binance's signed account API, for example, requires API-key and timestamp/signature handling that should never be moved into browser code. citeturn0search0

## Sessions and streaming

A provider adapter must own its provider-specific session lifecycle. SHAFX should not assume that `connect()` means the same thing everywhere.

The normalized contract supports a connection object plus an explicit stream handle. Providers can implement:

- WebSocket subscriptions
- HTTP polling
- server-side streaming
- FIX sessions
- provider-specific session/bootstrap sequences

The adapter is responsible for reconnects, subscription cleanup, authentication refresh, stale-data detection and provider-specific heartbeat rules.

## Errors, rate limits and retries

Provider errors must be normalized before reaching the SHAFX UI. The contract includes a normalized error shape with:

- stable SHAFX error code
- human-readable message
- retryable/non-retryable flag
- provider error code when available
- request correlation id when available

Adapters must also implement provider-specific rate limiting and retry behavior. This matters because limits differ materially: IBKR documents a global 10 requests/second limit for each authenticated username plus endpoint-specific limits, while Binance exposes request weights and order-rate limits. citeturn1search0turn0search0

SHAFX must never blindly retry an order-placement request. Order submission requires idempotency/correlation and reconciliation of the provider's actual order state before retrying.

## Funding

Funding is deliberately independent of trading. Each provider reports one of:

- `api`: SHAFX may call a verified provider funding API after provider-specific authorization and safety checks.
- `redirect`: SHAFX sends the user to the provider's official funding/cashier flow.
- `manual`: the provider requires a manual process/instruction.
- `unsupported`: no funding function is exposed through the SHAFX adapter.

A provider offering trading APIs does not automatically mean SHAFX can safely or legally initiate deposits/withdrawals through those APIs.

## Current catalog

| Provider | Status | Current SHAFX execution | Funding | Notes |
| --- | --- | --- | --- | --- |
| SHAFX Simulator | available | simulated only | unsupported | No real money |
| Deriv | available | real execution disabled | redirect | Existing Deriv account/market gateway remains; provider-neutral contract is now separate |
| Binance | planned | not implemented | unsupported until verified | Requires server-side signed integration and product-specific symbol/order mapping |
| OANDA | planned | not implemented | unsupported until verified | REST + pricing stream; provider-specific order and instrument rules |
| Interactive Brokers | planned | not implemented | unsupported until verified | Provider-specific sessions, conids, market-data subscriptions and pacing rules |
| Custom/FIX provider | planned | not implemented | provider-specific | FIX can be an adapter transport where the provider exposes it |

## Current repository reality

The provider-neutral contract has been added under `src/integrations/core`, but the existing terminal still contains direct Deriv wiring. In particular, the application imports `DerivAccountStream` and the live-market UI uses `DerivLiveControl`. The current commit therefore creates the correct boundary and contracts, but it does **not** yet claim that the entire UI/runtime has been migrated behind that boundary.

The next implementation step is to move those direct imports behind provider runtime/adapters without changing the simulator behavior. This is intentionally staged rather than replacing the working Deriv path blindly.

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

SHAFX should support three integration classes rather than forcing everything through one protocol:

1. **Native provider adapter** — for REST/WebSocket/OAuth/API-key APIs.
2. **Standard protocol adapter** — for providers exposing FIX or another industry protocol.
3. **Custom gateway adapter** — for a company with a private API or server-to-server integration.

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
