# SHAFX Implementation & Handoff Tree

> Purpose: this file is the persistent handoff/checkpoint for SHAFX. Any future agent must continue from the first unchecked or failed item instead of restarting the audit.
>
> Rule: a checkbox is marked **[x] only after the corresponding code/configuration exists and has been verified** in the relevant system (GitHub, CI, Supabase, Vercel, provider sandbox/API, or production runtime). **[~] means partially implemented or structurally present but not fully wired/verified. [ ] means not implemented. [!] means verified problem/blocker.**

## 0. Baseline & Safety

- [x] SHAFX repository identified as `S35213/Sharfx`.
- [x] `main` is the production branch.
- [x] Simulator-first safety boundary is documented.
- [x] Real-money execution remains disabled by default.
- [x] Provider secrets are prohibited from browser `VITE_*` configuration.
- [x] CI runs build, lint, tests and high-severity dependency audit.
- [x] Production deployment is linked to the GitHub repository.

## 1. Core Provider Architecture

- [x] Provider-neutral `ProviderAdapter` contract exists.
- [x] Capability model exists for accounts, market data, streaming, positions, orders, funding and multiple accounts.
- [x] Provider registry exists.
- [x] Provider readiness checks exist.
- [x] Provider connection/environment guard exists.
- [x] Normalized quote/candle/account/position/order types exist.
- [x] Provider error normalization contract exists.
- [x] Provider stream handles have explicit cleanup.
- [x] Instrument metadata contract exists.
- [x] Order normalization/idempotency fields exist.
- [x] Provider catalog exists.
- [x] Planned-provider descriptors do not falsely advertise implemented capabilities.
- [x] Provider architecture tests exist and pass.

## 2. Persistent Connection & Account Registry

- [x] Supabase migration exists and is applied.
- [x] Provider connections table exists.
- [x] Provider accounts table exists.
- [x] Order-intent audit table exists.
- [x] Provider audit table exists.
- [x] Multiple connections per user are supported by schema.
- [x] Multiple accounts per connection are supported by schema.
- [x] Provider account uniqueness constraint exists.
- [x] RLS is enabled on provider tables.
- [x] Anonymous/authenticated direct client access is denied.
- [x] Provider secret storage uses Supabase Vault RPCs.
- [x] Vault secret RPC execution is restricted to `service_role`.
- [x] Server provider-connection service exists.
- [x] Authenticated connection inventory API exists.
- [x] Generic frontend connection manager fully wired to persisted connections.
- [x] Generic frontend account selector fully wired to persisted account IDs.
- [x] Simultaneous multi-connection account streams are exercised by the runtime manager and production concurrency load test; authenticated real-provider multi-account testing remains credential-dependent.

## 3. Authentication & Credential Boundary

- [x] SHAFX Supabase authentication exists.
- [x] SHAFX access/refresh session cookies are HttpOnly/Secure/SameSite.
- [x] Provider OAuth starts only for a signed-in SHAFX user.
- [x] OAuth state/CSRF validation exists.
- [x] PKCE exists for Deriv OAuth.
- [x] Provider access tokens are stored server-side in Vault.
- [x] Legacy Deriv session fallback remains for compatibility.
- [~] Generic provider-session refresh helper exists, but provider-specific refresh persistence/callback wiring remains adapter-owned.
- [~] Generic OAuth 2 + PKCE helpers exist; arbitrary-provider state storage/callback routing still requires provider-specific wiring.
- [~] Descriptor-driven API-key/PAT credential onboarding and generic connector dispatch exist; arbitrary connector discovery remains explicit.

## 4. Deriv Adapter

- [x] Deriv provider descriptor exists.
- [x] Deriv market-data adapter exists.
- [x] Deriv historical candles adapter exists.
- [x] Deriv authenticated account adapter exists.
- [x] Deriv multiple-account discovery exists.
- [x] Deriv demo/live account normalization exists.
- [x] Deriv authenticated account WebSocket bootstrap exists.
- [x] Deriv stream reconnect/cleanup logic exists.
- [x] Deriv OAuth2 + PKCE integration exists.
- [x] Deriv credentials are persisted in Vault.
- [x] Deriv account records are persisted in Supabase.
- [x] Deriv connection IDs are supported by the adapter.
- [x] Main terminal binds broker account streaming to the persisted provider connection/account selection.
- [~] Multi-connection account selector and concurrent stream runtime exist; a dedicated Deriv-only multi-connection UX is not separately branded.
- [ ] Live Deriv order execution (intentionally disabled for now).
- [ ] Deriv positions/orders normalization (intentionally not implemented yet).

## 5. Universal Broker/Exchange Integration

- [x] Architecture supports native REST/WebSocket providers.
- [x] Architecture supports provider-specific OAuth/API-key/PAT/custom auth methods.
- [x] Architecture supports standard-protocol adapters such as FIX.
- [x] Architecture documents that there is no single universal broker API.
- [x] Generic configurable REST provider adapter boundary exists.
- [x] Generic configurable WebSocket provider adapter boundary exists.
- [x] Generic FIX gateway session boundary exists.
- [x] Generic proprietary/custom gateway contract exists.
- [~] Provider credential schema/onboarding is descriptor-driven and server-dispatched; provider connector registration remains explicit for security.
- [x] Symbol/instrument mapping workflow primitive exists with normalized symbols, provider symbols, aliases and ambiguity protection.

### Concrete provider adapters

- [x] Deriv — implemented account/market adapter.
- [x] OANDA — implemented account/market-data adapter with server-side personal-token storage and multi-account discovery.
- [ ] Interactive Brokers — concrete adapter implementation; provider-specific session/Gateway requirements remain.
- [~] Binance — read-only Spot account/market-data adapter implemented; provider sandbox credentials have not yet been exercised.
- [ ] cTrader Open API — adapter implementation.
- [ ] MT4/MT5 bridge/gateway adapter — architecture only; broker terminal bridge still required.
- [ ] Additional broker-specific adapters as needed.

## 6. Multi-Account Runtime

- [x] Stream identity can include provider + connection + account + environment.
- [x] Account stream abstraction exists.
- [x] Provider-specific account stream isolation exists for Deriv.
- [x] Persisted active connection/account selection is used by the terminal.
- [x] Multiple account streams can coexist without state collision; identity-isolated stream manager tests and production concurrency tests pass.
- [x] Per-account account/position/order cache is wired into managed account streams.
- [~] Per-provider/connection rate limiting exists and is active for OANDA; additional provider adapters must adopt the shared limiter.
- [x] Per-connection/account reconnect/backoff state is maintained by the stream manager.
- [~] Owner console surfaces cross-provider connection health/account inventory; normalized market-data dashboards remain pending.

## 7. Market Data

- [x] Simulator market-data boundary exists.
- [x] Live market-data interface exists.
- [x] OHLC validation exists.
- [x] Freshness/clock health gates exist.
- [x] Live polling/stream cleanup exists.
- [x] Provider/account selection is user-driven and the selected connection feeds the live market control.
- [x] Multi-provider symbol mapping registry exists and isolates mappings by provider.
- [~] Provider market-data failover helper exists with provider telemetry; UI/runtime routing still uses the selected source as primary.
- [x] Shared provider rate limiter exists and is active for OANDA and Binance connection-scoped traffic.
- [~] Provider telemetry tracks quote success/failure, stream errors and stale-data events; production export/retention is not yet wired.

## 8. Trading Execution Safety Boundary

- [x] Normalized order request exists.
- [x] Execution guards exist.
- [x] Explicit user approval gate exists.
- [x] Fresh-price execution guard exists.
- [x] Order reconciliation contract exists.
- [x] Client-order correlation/idempotency field exists.
- [x] Live execution remains fail-closed.
- [x] Server-side execution gateway exists and is fail-closed for external providers.
- [ ] Provider-specific order adapters.
- [ ] End-to-end demo/paper execution validation.
- [ ] Live execution certification/release gate.

## 9. Funding

- [x] Funding is separate from trading in the capability model.
- [x] Unsupported funding is explicitly advertised for unimplemented providers.
- [x] Deriv cashier is external rather than SHAFX-held funds.
- [x] Generic provider funding dispatcher validates advertised capabilities and adapter handlers.
- [ ] Provider-specific funding verification where officially supported.

## 10. Security & Operations

- [x] Provider secrets are server-only.
- [x] RLS protection exists.
- [x] Audit-event schema exists.
- [x] Auth rate limits exist.
- [x] Build/lint/test/audit CI exists.
- [x] Production Vercel deployment is READY.
- [x] OANDA's initial Vercel Hobby 12-function deployment limit was fixed by consolidating its routes into the generic provider endpoint; subsequent production deployments are READY and the production load test passes.
- [!] Node DEP0169 deprecation warning persists in production `/api/auth` runtime logs. Direct repository search finds no `url.parse`; Node 24 is pinned in `package.json`, and Vercel documents Node 24 as supported, so the remaining warning has not been traced to SHAFX source and is not safe to suppress blindly.
- [x] Private owner console includes live provider connection health, account inventory and recent audit events.
- [~] Connection expiry/health state is stored and surfaced; generic session refresh helper exists but automation remains provider-specific.
- [~] Provider health alert evaluator and operations runbook exist; external notification delivery is not wired.
- [ ] External integration end-to-end tests with provider sandboxes.

## 11. Research-Verified Integration Constraints

- [x] Deriv OAuth2 + PKCE requirements verified against official Deriv documentation.
- [x] Deriv account/OTP WebSocket flow verified against official Deriv documentation.
- [x] OANDA REST/stream/order capability differences verified against official OANDA documentation.
- [x] cTrader Open API OAuth + multi-account WebSocket model verified against official cTrader documentation.
- [x] FIX is treated as an adapter protocol, not a universal broker API.
- [x] IBKR current production authentication/session workflow researched and documented as provider-specific session state (implementation remains a separate provider pack).
- [x] Binance current authentication/account/trading workflow researched and documented as signed USER_DATA/WebSocket capabilities (implementation remains a separate provider pack).

## 12. Verification Gates

- [x] GitHub SHAFX CI passes on latest `main` commit `4642dcc6a73bcaf5aefd307df453cb312257b118`.
- [x] GitHub Provider Architecture CI passes on latest `main` commit `4642dcc6a73bcaf5aefd307df453cb312257b118`.
- [x] Supabase provider migration is applied.
- [~] Last known production deployment is READY, but new deployments are currently blocked by the Vercel Hobby deployment-rate quota.
- [~] Last READY production build had no build errors; current `main` build is pending CI/Vercel quota recovery.
- [~] Public/protected production paths and concurrency behavior are verified; authenticated connection flow still requires a real SHAFX user session.
- [ ] Deriv connection flow passes with a real test account.
- [ ] Multiple Deriv accounts pass simultaneously.
- [ ] Second provider passes a full sandbox/paper connection flow (code + CI verified; real OANDA practice credentials have not yet been exercised in production).
- [x] Provider-agnostic concurrent runtime manager is tested with isolated connection/account streams; real multi-provider external credentials remain untested.
- [ ] Final security/runtime diagnostic passes.

## Current checkpoint

**Last verified:** 2026-09-18

**Current production commit:** `c9099195dc5f5370ba0426f6591d1d6dbe89daeb` (last verified READY production deployment; newer `main` commits are not yet in production because Vercel is deployment-rate limited)

**Current branch for continuation:** `main`

**Current state:** Provider foundation, Supabase registry, Deriv, OANDA, generic connector/onboarding primitives, Binance read-only pack, concurrent account streaming/cache/retry, health/telemetry primitives, funding dispatcher, and FIX/custom gateway boundaries are present on `main`. Latest SHAFX CI and Provider Architecture CI pass. Remaining hard gates are real external provider credentials/sandbox tests, concrete IBKR/cTrader/MT4/MT5 provider packs, production telemetry/alert delivery, and the unresolved Vercel runtime deprecation warning. New Vercel deployments are presently blocked by the Hobby deployment-rate quota.

**Handoff rule:** Never replace this tree with a new checklist. Update this file in the same branch/commit chain as work progresses. Only mark an item `[x]` after verification.
