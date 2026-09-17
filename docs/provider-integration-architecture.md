# SHAFX Provider-Agnostic Integration Architecture

## Goal

SHAFX must not be structurally tied to Deriv, Binance, or any single broker/exchange. A provider is an adapter behind a normalized SHAFX contract. Provider-specific authentication, symbol formats, order models, streaming protocols, and funding flows stay inside the adapter.

## Why the contract is capability-based

Provider APIs are not interchangeable:

- Deriv exposes REST and WebSocket APIs, including OAuth 2.0, account balances, portfolio, transactions and real-time trading/market-data streams.
- Binance exposes signed REST/WebSocket APIs with exchange-specific order, account, rate-limit and funding behavior.
- OANDA exposes a REST v20 trading API plus a price stream, with broker-specific instruments and order models.
- Interactive Brokers exposes a provider-specific Web API with its own session/account lifecycle.

Therefore a universal `placeOrder()` or `withdraw()` call must never imply that every provider supports the same behavior. SHAFX declares capability flags and funding modes explicitly.

## Normalized layers

```text
SHAFX UI / analysis / risk / bots
             |
             v
     ProviderAdapter contract
             |
     +-------+--------+-----------+
     |                |           |
   Deriv           Binance     Custom
   adapter         adapter     adapter
     |                |           |
 provider APIs    provider APIs  provider API
```

### Credentials

Provider credentials and authorization codes stay server-side. Browser code may start an OAuth redirect or request a short-lived server-issued session, but it must not receive long-lived provider secrets.

For OAuth authorization-code flows, SHAFX should use PKCE, exact redirect URI matching, state/CSRF validation, and server-side code exchange.

### Trading

The normalized order request contains only portable concepts:

- symbol
- side
- quantity + quantity unit
- market/limit/stop/stop-limit order type
- optional stop-loss/take-profit
- time-in-force
- optional client order id

Adapters convert this into provider-specific contracts. The SHAFX simulator and current production application continue to use the simulator path until an execution adapter is explicitly implemented and tested.

### Funding

Funding is deliberately independent of trading. Each provider reports one of:

- `api`: SHAFX may call a provider funding API after completing provider-specific authorization and safety checks.
- `redirect`: SHAFX sends the user to the provider's official funding/cashier flow.
- `manual`: the provider requires a manual process/instruction.
- `unsupported`: no funding function is exposed through the SHAFX adapter.

This prevents SHAFX from assuming that a provider offering trading APIs also allows deposits or withdrawals through the same API.

## Current catalog

| Provider | Status | Current SHAFX execution | Funding | Notes |
| --- | --- | --- | --- | --- |
| SHAFX Simulator | available | simulated only | unsupported | No real money |
| Deriv | available | real execution disabled | redirect | Existing OAuth/account/market integration remains intact |
| Binance | planned | not implemented | unsupported until adapter is implemented | Requires secure server-side signed API integration |
| OANDA | planned | not implemented | unsupported until adapter is implemented | REST + streaming pricing are available from OANDA |
| Interactive Brokers | planned | not implemented | unsupported until adapter is implemented | Provider-specific Web API session/auth model |

## Provider implementation checklist

A provider is only promoted from `planned` to `available` after all required pieces exist and pass tests:

1. Server-side authentication/authorization flow.
2. Account discovery and normalized account snapshots.
3. Symbol/instrument mapping and provider metadata.
4. Historical market data where supported.
5. Real-time market data where supported.
6. Position/order normalization.
7. Order placement/cancel/close only when the provider actually supports it and SHAFX has explicitly enabled it.
8. Funding flow only where the provider allows it and the integration has a verified mechanism.
9. Rate-limit handling, retries, reconnects and stale-data detection.
10. Audit logging and idempotency for externally triggered state changes.
11. Demo/paper validation before any live execution path is enabled.
12. A provider-specific integration test suite.

## Official references used for this architecture

- Deriv Authentication: https://developers.deriv.com/docs/intro/authentication/
- Deriv OAuth 2.0 + PKCE: https://developers.deriv.com/docs/intro/oauth/
- Deriv API overview: https://developers.deriv.com/docs/intro/api-overview/
- Binance Spot/WebSocket account API: https://developers.binance.com/en/docs/catalog/core-trading-spot-trading/api/ws-api/account
- Binance Wallet API: https://developers.binance.com/en/docs/catalog/core-trading-wallet/api/rest-api/account
- OANDA v20 introduction: https://developer.oanda.com/rest-live-v20/introduction/
- OANDA pricing/streaming: https://developer.oanda.com/rest-live-v20/pricing-ep/
- OANDA API comparison: https://developer.oanda.com/rest-live-v20/api-comparison/
- IBKR Web API documentation: https://ibkrcampus.com/campus/ibkr-api-page/webapi-doc/
- OAuth 2.0 security best practice (RFC 9700 summary): https://oauth.net/2/oauth-best-practice/
