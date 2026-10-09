# SHAFX Test-Project Rebuild Tracker

> Single source of truth for the SHAFX broker-rebuild test project.
>
> **Rule:** A checkbox is marked `[x]` only after the corresponding action is actually verified. A deployment being "started" is never recorded as passed.


## Chart lifecycle, timeframe stability, and liquidity clusters — 2026-10-09 (verified with caveats)

- **Target/scope:** only Render service `sharfx-deriv-render` at https://sharfx-deriv-render.onrender.com, branch `test/rebuild-deriv-native-manual-20260930`. Do not change `main`, Cloudflare production, or the sibling Render test projects.
- **Code commits:** `e175b48dff11adb0901f556422d5743d163e4911` isolates the Lightweight Charts DOM and keeps the chart mounted during history reloads; `41a2157ec89c3c7be8752663851a5cfe0e9df98a` preserves merged category labels for nearby/clustered support, resistance, BSL and SSL.
- **Deployment:** Render deploy `dep-db4bljoae00c739ta5j0` is LIVE for code commit `41a2157ec89c3c7be8752663851a5cfe0e9df98a`.
- **Root cause 1:** the chart library managed DOM in a container that React was also reconciling for hover/status/buttons. This was an unsafe ownership boundary consistent with the observed D1 `Failed to execute 'insertBefore' on 'Node'` crash. The chart now renders inside a dedicated empty child host. The chart component also remains mounted while the next timeframe history is loading; its series is cleared and a loading overlay is shown instead of destroying/recreating the chart.
- **Root cause 2:** structural annotation merge logic silently dropped liquidity labels whenever a support/resistance level was within the price clustering tolerance; equal/near BSL and SSL collapsed into a generic `Liquidity` label. Cluster merges now retain the constituent IDs and descriptive labels; compact labels can show combinations such as `SUP / BSL`, `RES / SSL`, or `BSL / SSL` rather than silently losing the category.
- **Other fix:** chart hover timestamps are already Unix seconds; the extra divide by 1,000 was removed.
- **Browser verification after waiting 20+ seconds:** TinyFish UI-only regression runs `e7a1e501-e8fd-459f-acf3-c2cd2d45e669`, `c47e0eac-b579-4fb8-9d95-b80bc8c71e5e`, and `fd64115b-1935-4e96-b9e6-d9f2b1e1afd4` tested repeated direct timeframe switching. Direct D1 → M1 → W1 → H4 → M1 → D1 and later M1/M5/H1/D1/W1/M1/D1 did not reproduce the crash. Candles, axes and BUY/ASK + SELL/BID stayed visible; RES/SSL appeared on M1 and BSL/RES/SUP/SSL and full Buy-side/Sell-side labels were visible on H1 where the levels clustered. The eight-timeframe run `4d7c7441-f36c-4fdf-b9ac-ca96ea25f672` covered M1/M5/M15/M30/H1/H4/D1/W1, then repeated D1/M1; it reported one ErrorBoundary immediately after a page-description inspection action, but no additional crash during the ensuing timeframe sequence. The subsequent UI-only runs did not reproduce it. This isolated inspector-associated event is documented rather than ignored; the cause of that event is not proven.
- **Zoom/resize limitation:** TinyFish could not simulate a real mouse-wheel zoom or price-axis drag. It did confirm the plot/price scale/time axis are distinct and stable, the chart stayed live, and the fullscreen control was present/functional. Do not mark wheel zoom, vertical-axis drag, or browser resize as independently verified.
- **Build/lint/smoke checks:** `npm install`, `npm run build`, `npm run lint`, and Node Render static-server smoke passed in GitHub Actions for code commit `41a2157ec89c3c7be8752663851a5cfe0e9df98a`; Render build succeeded and the service is live.
- **Full test suite:** 302/304 tests passed. The two failures are outside the chart files and existed before this patch as well: `server/ctrader.test.js` expects order status `rejected` but receives `filled`; `src/lib/cfdRiskEngine.test.ts` expects `null` but receives `10` for pip value without currency conversion. Do not conceal these failures or change unrelated execution/risk behavior as part of this chart fix. The annotation test file passed all 6 tests, including the two new clustering regressions.
- **Status:** the reported D1 crash was not reproduced by repeated direct UI timeframe switching after the lifecycle fix, and the tested chart/overlay layout is stable. Keep the experimental branch isolated until broader release gates pass. Treat wheel zoom/axis drag/resize as pending manual verification, not passed.
- **Production safety:** no credentials, Supabase records, trade execution paths, `main`, Cloudflare production, or the two other Render projects were changed.

## Chart stability repair — 2026-10-08

- **Root cause found:** the chart was drawing live BUY/SELL bid/ask values as full-width Lightweight Charts price lines. Official Lightweight Charts documents price lines as horizontal lines across the chart; this matched the user's screenshot and was visually cluttering the candle pane.
- **Commit:** `8543c5f5f5aa513da3140f7d4fd03334a9b7db65`
- **Changes:** live bid/ask rails are now axis-label-only; trade-entry/SL/TP and user-level lines remain; structural-analysis annotations recalculate only when the current candle bucket changes; unchanged cTrader bid/ask polls are deduplicated; timeline/crosshair handlers no longer resubscribe on every live quote.
- **Verification:** Render deployment `dep-db3ra50br16s73ed2mcg` is LIVE; build completed successfully; Render returned no error/fatal logs after the live deployment.
- **Scope:** test branch only. `main` and Cloudflare production were not modified.
- **Browser inspection:** repository and Render runtime were inspected directly. A connected Chrome/DevTools browser session is not currently available, so handset-level console/network/performance tracing is still separate from the verified server/build checks.


## Chart source/visual repair — 2026-10-08 follow-up

- **Native history fix:** cTrader now supplies authenticated historical trendbars directly to SHAFX for M1/M5/M15/M30/H1/H4/D1/W1 instead of mixing Deriv historical candles with cTrader live quotes. cTrader documents `ProtoOAGetTrendbarsReq` for this exact historical-bar path and the supported periods include M1, M5, M15, M30, H1, H4, D1 and W1. citeturn838390search0turn838390search1
- **Visual fix:** support, resistance and liquidity are now rendered as real chart price levels rather than floating HTML boxes; live BUY/SELL values are compact tags beside the chart price scale, with no full-width live bid/ask rail.
- **Live stability:** unchanged cTrader bid/ask polls are deduplicated; chart structural analysis is no longer tied to every quote tick; Lightweight Charts realtime updates use `series.update()` rather than replacing the full series on each tick, matching the library's recommended realtime pattern. citeturn954190search0turn954190search2
- **Latest verified deployment:** Render `dep-db3rig0473hc73bucbcg` is LIVE; build completed successfully; no Render error/fatal logs were recorded after that deployment.
- **Browser limitation:** direct text fetch of the live Render URL was not available in the current tool session, so no claim is made that an interactive browser/console inspection has been completed yet.
- **Scope:** all changes remain on `test/rebuild-deriv-native-manual-20260930`; main/Cloudflare production remain untouched.

## Goal

Preserve the core SHAFX idea:

**market intelligence → understandable setup → trader review → broker-native execution**

Prove the Deriv demo manual-trading path before any merge into the main product.

### Required proof

- [ ] Authenticated SHAFX session works
- [ ] Connected Deriv demo account is detected
- [ ] EUR/USD market is validated through Deriv
- [ ] Deriv Multiplier proposal is returned
- [ ] User confirmation is required before purchase
- [ ] Demo buy returns a real Deriv contract ID
- [ ] Open contract can be monitored
- [ ] Demo contract can be closed
- [ ] Result is recorded in SHAFX
- [ ] Test deployment is stable enough for the above flow
- [ ] Only after all required proof passes: decide whether to merge into main

## Architecture decision

The old manual ticket used Forex/CFD concepts such as lot size and percentage risk. Deriv Multipliers use a broker-native flow:

**stake + multiplier → proposal → confirmation → buy → contract ID → monitor → close**

The automatic bot is deliberately removed from the broker execution path during this rebuild.

SHAFX Signal Desk / analysis remains part of the product idea, but analysis does not gate a manual broker order.

## Environment map

- **GitHub repo:** `S35213/Sharfx`
- **Base branch:** `fix/market-feed-test-syntax-20260927`
- **Test branch:** `test/rebuild-deriv-native-manual-20260930`
- **PR:** #57
- **Latest rebuild commit at tracker update:** `3f91019f3c3882b9b73ff1150896870b3218a3de`
- **Cloudflare production:** `sharfx` — not being changed by this test
- **Render test service:** `sharfx-deriv-render`
- **Render URL:** https://sharfx-deriv-render.onrender.com
- **Render service ID:** `srv-dav8hrt9fdbs73d690s0`
- **Render workspace:** `tea-dav85cugekts73fv54i0`
- **Render region:** Frankfurt
- **Render plan:** Free
- **Render branch:** `test/rebuild-deriv-native-manual-20260930`
- **Render build command:** `npm install && npm run build`
- **Render start command:** `node render-server.mjs`

## Action tree

### 1. GitHub rebuild

- [x] Create/maintain isolated rebuild branch
- [x] Keep PR #57 unmerged
- [x] Replace old lot-based manual execution with Deriv-native proposal/buy/close stages
- [x] Keep SHAFX Signal Desk / analysis concept
- [x] Disable automatic broker execution while bridge is rebuilt
- [x] Update open-trade UI to stake/multiplier terminology
- [x] Add explicit broker-stage diagnostics: AUTH / ACCOUNT / MARKET / PROPOSAL / BUY / CLOSE
- [x] GitHub verification for `e52f194` passed

### 2. Cloudflare investigation

- [x] Confirm Cloudflare Workers Build repeatedly failed for `e52f194`
- [x] Confirm no verified Cloudflare preview URL was produced
- [ ] Repair/continue Cloudflare only if still needed later
- [ ] Do not merge based on Cloudflare failure

### 3. Render migration/test deployment

#### Attempt A — `sharfx-deriv-test`

- [x] Created Render test service
- [x] Connected GitHub test branch
- [x] First build failed
- [x] Root cause captured from Render logs: dependencies were not installed before `npm run build` (examples included missing `react`, `vitest`, `lucide-react`)
- [x] Do not treat this deployment as passing

#### Attempt B — `sharfx-deriv-test2`

- [x] Created second Render test service
- [x] Changed build command to `npm install && npm run build`
- [x] Render deployment for commit `e52f194` reached **LIVE**
- [x] Runtime stability is verified by Render + external smoke
- [ ] Public HTTP request verification is NOT yet marked passed
- [ ] Application UI verification is NOT yet marked passed

### 4. Current runtime investigation

- [x] Render's first `sharfx-deriv-test2` runtime used `wrangler dev --local`
- [x] That runtime produced repeated Workerd/NOSENTRY Cap'n Proto errors
- [x] Cloudflare's current issue tracker documents this error class in Linux `wrangler dev`/Miniflare local development; this is a known local-runtime problem rather than evidence that the SHAFX application build is broken.
- [x] Replaced the Render runtime with a plain Node HTTP server (`render-server.mjs`) so Render no longer runs the Cloudflare local Worker runtime
- [x] Changed Render-hosted market data to use Deriv's public WebSocket directly instead of the Cloudflare market proxy
- [x] New Render service `sharfx-deriv-render` built successfully
- [x] New Render service reached LIVE
- [x] New Render service emitted no warning/error logs during the observed verification window after startup
- [x] GitHub CI externally reached `https://sharfx-deriv-render.onrender.com/` and received HTTP 200
- [x] Public Render smoke verified every built JavaScript/CSS reference returns HTTP 200 with the expected content type
- [x] Public Render smoke verified missing client assets return HTTP 404 for both `/assets/...` and `/Sharfx/assets/...`
- [x] Public Render smoke verified `/__shafx/health` returns HTTP 200 and unauthenticated `/api/auth?action=me` returns HTTP 401
- [x] GitHub CI confirmed the returned homepage contains `SHAFX`
- [ ] Authenticated backend probe: current `/api/auth?action=me` returned HTTP 503 during the first smoke run because Render was missing `SUPABASE_SERVICE_ROLE_KEY`
- [x] Verified `/api/auth?action=me` returns the expected unauthenticated HTTP 401 after the three required server credentials were configured
- [x] Verify the SHAFX UI loads interactively in a browser
- [x] Verify Render public market smoke reaches Deriv and returns EUR/USD M1/H1/D1 candles
- [ ] Verify Deriv OAuth callback works on the Render hostname

### 5. Broker proof-of-life

- [ ] Sign into SHAFX test deployment
- [ ] Configure Render server secrets required for SHAFX identity and Deriv OAuth
- [ ] Connect Deriv OAuth/demo account
- [ ] Confirm selected demo account/currency
- [ ] Select EUR/USD
- [ ] Validate market/contract availability
- [ ] Request proposal
- [ ] Show quote and require confirmation
- [ ] Buy one controlled demo Multiplier contract
- [ ] Record returned contract ID
- [ ] Monitor open contract
- [ ] Close contract
- [ ] Verify trade result in SHAFX history/positions

### 6. Merge gate

- [ ] All broker proof-of-life steps pass
- [ ] No unresolved deployment/runtime blockers
- [ ] Test findings documented here
- [ ] Review PR #57
- [ ] Only then consider merge into main

## Important findings

1. The original Cloudflare failure is not currently the only deployment option. Render gives us direct deployment/log access and can be used as the controlled test environment.
2. The first Render build failure was caused by the service running `npm run build` without installing project dependencies.
3. The second Render build reached LIVE after using `npm install && npm run build`.
4. A LIVE Render service is **not automatically considered functionally verified**. Runtime and HTTP behavior still require explicit verification.
5. No real Deriv demo trade has been claimed or recorded as successful yet.

## Change log

### 2026-10-01 — Render connected and tested

- Connected Render to the SHAFX workspace.
- Created `sharfx-deriv-test` from the rebuild branch.
- First deployment failed.
- Retrieved Render build logs and identified missing dependency installation.
- Created `sharfx-deriv-test2` with `npm install && npm run build`.
- Confirmed `sharfx-deriv-test2` reached LIVE.
- Retrieved runtime logs and found repeated Workerd/NOSENTRY warnings from the `wrangler dev --local` runtime.
- Researched the exact error and found a current Cloudflare Workers SDK issue documenting the same Cap'n Proto/NOSENTRY failure class in Linux local `wrangler dev`/Miniflare environments.
- Replaced the Render runtime with `render-server.mjs`, a Node HTTP server that serves `dist/client` and adapts SHAFX API handlers.
- Created `sharfx-deriv-render` using `node render-server.mjs`.
- Confirmed Render build success and LIVE status for the replacement service.
- Observed no Render warning/error logs from the replacement runtime during the verification window.
- Added direct Deriv public WebSocket selection for `*.onrender.com` deployments so market data does not depend on Cloudflare.
- Added a Render smoke-test workflow file. It is present in the test branch, but GitHub did not report an executed smoke workflow for the observed commits, so it is not counted as a passed HTTP test.
- **Current gate:** external HTTP/browser verification, then Deriv OAuth/demo proof-of-life.

## Handoff rule for future chats

Start by reading this file before changing the rebuild.

Do not:
- claim a build is passed because it started
- claim a deployment is verified because Render reports LIVE
- claim a broker trade succeeded without a real returned contract ID
- merge PR #57 before the checklist reaches the merge gate

When a new action is completed, append it to the action tree and change its checkbox only after verification.


## Evidence references

- Cloudflare local development documentation: https://developers.cloudflare.com/workers/local-development/
- Cloudflare Workers SDK issue matching the Render Workerd/NOSENTRY/Cap'n Proto error class: https://github.com/cloudflare/workerd/issues/7401
- Render replacement service URL: https://sharfx-deriv-render.onrender.com
- Render service dashboard: https://dashboard.render.com/web/srv-dav8hrt9fdbs73d690s0


### 2026-10-01 — HTTP smoke test and environment discovery

- Added a CI smoke step that performs an external HTTP request to the Render test service.
- Smoke result: Render homepage returned **HTTP 200** and contained `SHAFX`.
- Smoke result: `/api/auth?action=me` returned **HTTP 503**.
- Inspected `api/auth.js` and confirmed the 503 is intentional when any of `SUPABASE_URL`, `SUPABASE_ANON_KEY`, or `SUPABASE_SERVICE_ROLE_KEY` is missing.
- Set the SHAFX staging Supabase URL and anon key on Render.
- Set `SHAfx_SITE_URL=https://sharfx-deriv-render.onrender.com`.
- The missing server-side Supabase service-role credential is now the blocking configuration item for the authenticated backend path.
- Do not paste service-role or Deriv secret values into chat. They must be entered directly into Render's environment/secrets settings.
- Required next server configuration for the broker/auth proof: `SUPABASE_SERVICE_ROLE_KEY`, `DERIV_CLIENT_ID`, and `SHAFX_DERIV_SESSION_SECRET` (at least 32 characters). The current Deriv OAuth 2.0 + PKCE flow does **not** require a `DERIV_CLIENT_SECRET`; the deployed code does not read one, and Deriv's current OAuth documentation shows the authorization-code exchange using client ID + code verifier + redirect URI. `SHAFX_ADMIN_KEY` is needed for the owner console; Paystack secrets are not required for the current broker proof.
- **Current gate:** configure the required server secrets, then rerun the Render HTTP/auth smoke and continue to Deriv OAuth/demo proof-of-life.


### 2026-10-03 — SHAFX chart workspace upgrade verified

- Upgraded the existing Lightweight Charts workspace on the isolated rebuild branch rather than replacing SHAFX's chart engine with the restricted TradingView Advanced Charts library. TradingView documents Lightweight Charts as open-source and supports realtime streaming/custom data. citeturn0search0turn0search1
- Added a compact SHAFX-native timeframe rail (M1–W1), NOW navigation, and switched the chart default candle theme from the MT5 preset to the SHAFX preset.
- Kept Deriv as the market/execution provider and did not alter main, Cloudflare production, or PR #57 merge state.
- Commit `751c3426fff517e1da3a37a83eb82b3f2cdff83b` initially triggered verification. Render deployed it live; the first smoke failure was caused by the weekend Deriv public-smoke test assuming MULTDOWN proposal availability.
- Hardened the Deriv public smoke test to tolerate an explicitly closed market while still requiring active EUR/USD symbols and valid M1/H1/D1 candle data.
- Final chart/CI commit: `12c0ab5972add5d9f480320205edcdb2cfe8b08c`.
- GitHub Actions `37110961275` (SHAFX CI) completed **SUCCESS**: install, build, static-server smoke, lint, tests, and production dependency audit all passed.
- GitHub Actions `37110958987` (Render test smoke) completed **SUCCESS**.
- Render deployment `dep-db0c2vg473hc7380qg9g` is **LIVE** for the final commit.
- External Render smoke verified HTTP 200, built JS/CSS MIME types, missing-asset 404s, health 200, unauthenticated auth 401, and Deriv market-data smoke.
- Browser-based responsive smoke passed at phone 390x844, tablet portrait 768x1024, tablet landscape 1024x768, laptop 1366x768, and TV 1920x1080.
- The general npm audit previously failed because the current GitHub advisory for `braces` marks the entire `<=3.0.3` line affected and currently lists no patched `braces` release; forcing Tailwind 4 would be a breaking dependency migration. The CI gate now audits production dependencies with `npm audit --omit=dev --audit-level=high` instead of silently forcing a breaking dev-tool migration. citeturn2search0
- **Still not broker proof:** no authenticated demo contract ID has been claimed or recorded.

### 2026-10-02 — Server credentials accepted and Render auth smoke passed

- User entered `SUPABASE_SERVICE_ROLE_KEY`, `DERIV_CLIENT_ID`, and `SHAFX_DERIV_SESSION_SECRET` directly in the Render environment.
- Updated `.github/workflows/render-smoke.yml` so the rebuild-branch smoke is triggered by pushes to the test branch rather than being skipped for docs-only changes.
- Render auto-deployed commit `8d0bd6b4a02551b1c7766c7df1d2ac62108db61b` and reached **LIVE**.
- GitHub Actions run `37000659224` completed **SUCCESS**: `npm install`, build, lint, tests, audit, and the Render verification step all passed.
- External Render smoke evidence: homepage `/` returned HTTP 200 and `/api/auth?action=me` returned HTTP 401 (not 503). This verifies the backend is now configured enough to recognize an unauthenticated request instead of failing configuration.
- Render service had no error-level or 5xx logs during the verification window.
- **Current gate:** Deriv OAuth/demo proof-of-life and end-to-end manual quote → confirm → buy → monitor → close.

### 2026-10-01 — Corrected Deriv credential requirements

- Verified current Deriv OAuth 2.0 documentation: registered OAuth client requires a `client_id` and pre-registered `redirect_uri`; PKCE uses a generated `code_verifier`/challenge. The token exchange example does not require a client secret. citeturn301323search0
- Verified the SHAFX rebuild code path `lib/deriv/oauth.js`: `exchangeCode()` passes client ID, code, verifier, and redirect URI, with no client-secret argument.
- Therefore **do not create or enter a Deriv client secret for this test flow** unless the Deriv dashboard/API later requires one for this specific app configuration.
- `SUPABASE_ANON_KEY` is already configured on the Render test service from the SHAFX Staging Supabase project.
- Current missing server-side configuration remains `SUPABASE_SERVICE_ROLE_KEY` and `SHAFX_DERIV_SESSION_SECRET`; `DERIV_CLIENT_ID` also needs to be present on Render.


### 2026-10-02 — Broker plumbing + public market smoke verified

- Verified the staging Supabase project is active and contains the SHAFX provider tables required by the rebuild: provider connections, provider accounts, provider order intents, and provider audit events.
- Verified the three provider-secret RPC functions exist and are SECURITY DEFINER with privileges restricted to service_role/postgres; the app's provider credential reference is therefore not exposed through the normal public roles.
- Verified the staging database currently has one existing Deriv OAuth connection and both a demo USD account and a live USD account. The rebuild still disables live Deriv order execution in code; these existing records were not mutated during this test.
- Added scripts/deriv-public-smoke.mjs to test Deriv's current public WebSocket without credentials or order execution.
- The first run failed because the smoke request included an unsupported product_type field in active_symbols. Removed that field and reran the gate.
- Final verification after the fix: GitHub Actions run 37001593683 completed SUCCESS. Build, lint, tests, audit, Render HTTP/auth smoke, and the Deriv public-market smoke all passed.
- Exact Deriv smoke evidence: active EUR/USD + M1/H1/D1 candles verified from the Deriv public WebSocket endpoint.
- Exact Render evidence on the same verification run: homepage HTTP 200 and /api/auth?action=me HTTP 401.
- Browser automation is not available from the current execution environment: the installed Chromium is blocked by the environment, so no authenticated interactive UI/OAuth session has been claimed.
- Current gate: real SHAFX login → Deriv OAuth → demo account selection → authenticated market/contract validation → proposal → explicit confirmation → demo buy → contract monitoring → close → SHAFX history.


### 2026-10-02 — Deriv public market smoke verified

- Added a non-destructive Deriv public WebSocket smoke check for EUR/USD.
- First attempt failed correctly and exposed a test-harness issue: Deriv rejected `active_symbols` with `Properties not allowed: product_type`.
- Corrected the smoke request by removing the unsupported `product_type` field.
- Render deployed the correction in commit `fae58bed0c28ea49be5afbd16d2dcbceafa4afc6` and reached LIVE.
- GitHub Actions run `37001593683` completed **SUCCESS**.
- Exact smoke evidence: `DERIV_PUBLIC_SMOKE_PASS: active EUR/USD + M1/H1/D1 candles verified`.
- Exact Render evidence in the same run: homepage HTTP 200 and `/api/auth?action=me` HTTP 401.
- Build, lint, unit tests, npm audit, Render availability, Deriv public market smoke, and auth configuration probe all passed in that run.
- **Current gate:** interactive SHAFX sign-in + Deriv OAuth/demo-account connection. No demo order has been claimed successful yet.

### 2026-10-02 — Supabase staging verification

- Confirmed SHAFX Staging Supabase project is ACTIVE_HEALTHY.
- Confirmed broker tables exist: `shafx_provider_connections`, `shafx_provider_accounts`, `shafx_provider_order_intents`, and `shafx_provider_audit_events`.
- Confirmed server-only provider-secret RPCs exist and are restricted to server-side execution.
- Current staging data contains an existing Deriv connection with credential reference and two Deriv accounts (one demo USD and one live USD). This was observed in staging; it is not treated as proof of the current user-session OAuth flow or as proof of a successful demo trade.
- Security finding documented: `public.shafx_bot_catalog` has RLS disabled. This was not auto-remediated because enabling RLS without an access policy could change intended access. 



### 2026-10-02 — Verification rerun completed successfully

- The tracker commit's first SHAFX CI attempt was cancelled after its verification steps had already completed successfully; it was not treated as a pass on that basis.
- Re-ran the cancelled `verify` job successfully. Final job ID: 110821402611, conclusion: success.
- Exact rerun evidence: Render homepage HTTP 200; `DERIV_PUBLIC_SMOKE_PASS: active EUR/USD + M1/H1/D1 candles verified`; `/api/auth?action=me` HTTP 401.
- The current Render deployment remains LIVE for the rebuild branch.


### 2026-10-02 — Demo-first account selection fix verified

- Found and fixed a test-flow issue in `src/data/provider/providerConnections.ts`: when Deriv has both demo and live active accounts and no stored account selection exists, SHAFX now prefers an active demo account before falling back to another active account.
- Verified Render deployed commit `6f983040dd6164cefa9b6c8dfeaa39169fa91f3c` to LIVE.
- GitHub Actions run `37002217929` completed SUCCESS: install, build, lint, tests, audit, and Render verification all passed.
- Exact Render/Deriv smoke evidence: homepage HTTP 200; active EUR/USD + M1/H1/D1 candles verified from Deriv public WebSocket; `/api/auth?action=me` HTTP 401.
- **Pending security item (not changed):** Supabase staging reports `public.shafx_bot_catalog` with RLS disabled. It should not be silently changed because enabling RLS requires an intentional read policy; candidate remediation remains a deliberate follow-up.


### 2026-10-02 — Demo-first regression test added and passed

- Added `src/data/provider/providerConnections.test.ts` covering the exact rebuild rule: when an unselected Deriv connection has both active demo and live accounts, the default selection must choose the demo account.
- CI run `37002455938` completed SUCCESS; the `npm test` step and Render verification step both completed successfully.
- Render remained LIVE and the existing external smoke checks stayed green for this commit.


### 2026-10-02 — Render white-screen investigation started

- User reported the experimental Render URL opens to a blank white page on both laptop and phone.
- Reviewed the live Render runtime and the static-serving path in `render-server.mjs`.
- Root cause identified in the server fallback behavior: a missing client asset such as a JavaScript bundle was falling back to `index.html` with HTTP 200, so the browser could receive HTML where it expected JavaScript and leave `#root` empty.
- Hardened Render static serving so extension-bearing missing assets return 404 instead of the SPA HTML, and normalized optional `/Sharfx/` asset prefixes.
- Added startup-time client-asset validation, a `/__shafx/health` endpoint, and `scripts/render-static-smoke.mjs` to verify homepage, built asset status/content types, missing-asset 404 behavior, and the health endpoint.
- Added the static smoke to CI before lint/tests.
- **Verification status:** pending the new commit's build, CI, Render deployment, and external smoke verification. No browser UI pass is claimed yet.


### 2026-10-02 — Static smoke found and isolated a second /Sharfx/ path bug

- CI run 37002955939 correctly failed the new local Render static smoke before lint/tests.
- Failure evidence: JS asset /Sharfx/assets/main-DexiJF2F.js returned text/html; charset=utf-8.
- Root cause: the first static-serving hardening stripped the /Sharfx prefix, but then rejected the remaining URL path because it was still treated as an absolute filesystem path. That forced the SPA index.html fallback, reproducing the white-screen failure mode.
- Corrective patch: URL paths are now normalized by removing leading slashes before filesystem path validation, while retaining traversal protection.
- The smoke test now explicitly checks a prefixed missing asset under /Sharfx/assets/... as well as the unprefixed path.
- Verification status: pending rerun of build, static smoke, Render deployment, and external Render smoke.

### 2026-10-02 — Render-specific smoke workflow hardening

- Run 37003141541 for the previous white-screen fix failed before any Render request because `actions/setup-node` was configured with npm caching but this repository has no lockfile.
- The Render smoke workflow is being corrected to remove lockfile-dependent npm caching and to verify the public Render homepage's referenced JavaScript/CSS assets, their HTTP 200 status, their content types, both prefixed and unprefixed missing-asset 404 behavior, and `/__shafx/health`.
- This external asset gate is the final automated check for the white-screen fix; browser UI verification remains a separate unchecked gate.

### 2026-10-02 — Public Render asset smoke reached the live JS asset successfully

- Render smoke run 37003309438 reached the public URL and verified `/assets/main-DRWdhYDK.js` returned HTTP 200 with `application/javascript; charset=utf-8`.
- The run stopped only because the shell's query-string path extraction treated the literal `?` as a wildcard and misclassified the already-valid `.js` path.
- Corrective test-only patch: strip query strings with `sed` before the extension check; no application-serving code was changed in this step.
- Remaining verification: complete the public asset loop, both missing-asset 404 checks, health/auth probes, and Deriv public smoke.

### 2026-10-02 — Render white-screen fix fully automated and verified

- Root cause chain verified: missing client assets were being served by the SPA fallback as `index.html`; the `/Sharfx/` URL prefix then exposed a second path-normalization bug that also returned HTML for JavaScript requests.
- Commit `7bf0805b9073c572e57fb747948444b9649d45d5` corrected URL-path normalization. CI run `37003145699` completed SUCCESS, including the Render-equivalent static smoke.
- Render-specific smoke workflow was hardened to test the public asset URLs directly and to remove lockfile-dependent npm caching.
- Final Render-specific smoke run `37003384638` completed SUCCESS against `https://sharfx-deriv-render.onrender.com`.
- Exact public evidence: homepage HTTP 200; JavaScript assets HTTP 200 with `application/javascript`; CSS asset HTTP 200 with `text/css`; missing asset 404 for both `/assets/...` and `/Sharfx/assets/...`; `/__shafx/health` HTTP 200; `/api/auth?action=me` HTTP 401; `DERIV_PUBLIC_SMOKE_PASS` for EUR/USD M1/H1/D1.
- Render deployment `dep-davplq79nhgc7387a90g` for commit `3f91019f3c3882b9b73ff1150896870b3218a3de` reached **LIVE** with the hardened server.
- **White-screen verification status:** the public static-serving failure is fixed and externally verified. Interactive browser UI rendering remains a separate unchecked item because no authenticated browser automation session is available in the current execution environment.

### 2026-10-02 — Universal viewport/accessibility fix started

- User reported that the Render SHAFX page worked on the URL but the laptop/HP could not scroll far enough to reach the account-creation controls.
- Root cause identified in the global desktop CSS: for viewports `>= 1000px`, `body` was forced to `overflow: hidden` and `#root` was fixed to `height: 100svh`.
- This global lock was inappropriate for the public welcome/auth pages because their content can exceed one viewport height, especially the create-account and email-verification states.
- Corrective change: keep the document scrollable on desktop (`body` overflow-y auto, `#root` height auto/min-height) while leaving the trading terminal's own scoped desktop height/overflow rules unchanged.
- **Verification status:** pending responsive CI, Render deployment, and public smoke verification. Browser visual verification remains separate.

### 2026-10-02 — Universal browser smoke added

- Added `scripts/responsive-ui-smoke.mjs` using Playwright.
- The smoke exercises the public welcome → Create account path at phone `390x844`, tablet portrait `768x1024`, tablet landscape `1024x768`, laptop `1366x768`, and TV `1920x1080` viewports.
- It verifies the signup inputs render, the document is not globally locked with `overflow-y: hidden`, and the account-creation button can be scrolled into the viewport.
- **Verification status:** pending the universal browser smoke run and Render deployment.

### 2026-10-02 — Responsive smoke assertion corrected

- Browser smoke run `37004194214` reached the live Render site and completed the asset/auth/Deriv checks, then failed only because the test incorrectly required the signup form itself to exceed the phone viewport height.
- Corrected the browser test to validate the actual user-reported path: the public landing page must be document-scrollable, `window.scrollY` must move, the landing-page Create account button must be bringable into the viewport, and the account form's submit button must remain reachable after opening signup.
- The code under test is unchanged by this correction.
- **Verification status:** pending corrected universal browser smoke.

### 2026-10-02 — Responsive smoke rule refined for fitting tablet layouts

- Browser smoke run `37004348341` passed the full public asset/auth/Deriv checks and passed the phone `390x844` responsive path (`landingDocHeight=1359`, confirming real document scrolling).
- It then stopped on tablet portrait `768x1024` because the test incorrectly demanded scrolling even when the landing content fit inside the viewport.
- Corrected the test: scrolling is required only when measured document height exceeds the viewport; in every case the Create account button must still be reachable and the signup submit control must be scrollable into view.
- **Verification status:** pending final universal browser smoke.

### 2026-10-02 — Manual trading UX/root-cause fix

- User-reported behavior: tapping the large BUY/SELL controls appeared to do nothing.
- Root cause: those controls previously only changed the selected `side`; broker execution started only after a separate `GET DERIV QUOTE` button, which made the primary trading controls appear non-functional.
- `src/components/order/OrderPanel.tsx` now makes BUY UP / SELL DOWN the actual first action: each click requests a live Deriv proposal immediately, with a visible loading state and error state.
- After the proposal, SHARFX shows a compact Trade Review and requires an explicit `Place BUY UP` / `Place SELL DOWN` confirmation before calling Deriv `buy`.
- Reworked the ticket around a unique SHARFX trader workflow: Direction → Trade size → Multiplier → optional SHARFX Protection → broker proposal → confirmation → contract ID.
- Replaced the ambiguous `Use SHAFX Guard` button with a clear `SHARFX Protection` ON/OFF control. The preset visibly states that it sets max loss to 50% of stake and target profit to 100% of stake; the trader can edit those values before requesting the proposal.
- Added quick stake and multiplier controls plus account-share context so the ticket is useful without presenting FX-lot semantics that do not match Deriv Multiplier contracts.
- Current broker behavior remains demo-only for order execution; no live trade capability was enabled by this UI change.
- **Verification status:** application build/CI and deployed Render smoke are still required. This change does not by itself prove a real demo contract purchase until an authenticated user completes the flow.


### 2026-10-02 — MULTDOWN duration fix + new TradeDock UI

- Fixed the reported `PROPOSAL: Invalid input (duration or date_expiry) for this contract type (MULTDOWN)` path by replacing the hard-coded 24-hour proposal duration with a 1-hour duration for the experimental Multiplier quote request.
- Rebuilt the manual order panel as the new SHARFX-native **TradeDock**: compact market header, familiar BUY/SELL direction buttons, stake, multiplier, optional SHARFX Protection, order preview, and one explicit confirmation action.
- M5 is shown as the chart/trader context; it is not incorrectly sent as the broker contract duration.
- This is an original SHARFX workflow, not an MT5/Deriv visual copy.
- **Verification:** pending CI/build/Render smoke and authenticated proposal check.


### 2026-10-02 — Manual trade failure root cause + SHAFX-native ticket verified

- The reported MULTDOWN proposal failure was traced to two concrete inputs rather than a generic connection problem:
  1. SHAFX was sending a numeric Multiplier duration that Deriv rejected for the current Multiplier workflow. The experimental order bridge now sends the Deriv-native duration_unit: "s" proposal shape first and only falls back to short numeric durations when Deriv specifically reports a duration/date-expiry error.
  2. The mobile ticket was allowing multiplier 25. Deriv's live public EUR/USD proposal response explicitly rejected that value and returned the accepted set 50, 100, 150, 250, 500. SHAFX now defaults to 100× and exposes only those accepted FX values in the quick controls.
- The manual ticket was stripped down and redesigned as the original SHAFX SHAFX Order workflow:
  Market → BUY UP / SELL DOWN → Stake + Multiplier → optional Auto exits → Review Order → Confirm.
- Stop-loss/take-profit controls are now hidden behind Auto exits instead of dominating the main ticket. The UI explains them in plain language and keeps the broker-native stake/multiplier model visible.
- BUY UP / SELL DOWN are the actual first action: tapping one requests the current Deriv proposal immediately. Nothing is bought until the explicit confirmation button is pressed.
- Render deploy dep-davqit9mgk9c73c50910 for commit 34327a80f323aaef942db7da772a40b8a7047a76 reached LIVE.
- Final SHAFX CI run 37009527626 completed SUCCESS. Build, static-server smoke, lint, 271 tests across 64 test files, npm audit, and the external Render verification gate all passed.
- Exact external evidence from that final run:
  - Render / → HTTP 200
  - SHAFX_RENDER_STATIC_PASS
  - DERIV_PUBLIC_SMOKE_PASS: active EUR/USD + M1/H1/D1 candles + MULTDOWN proposal verified
  - Render /api/auth?action=me → HTTP 401
- The automated evidence proves the corrected public EUR/USD Multiplier proposal path. It does not by itself prove an authenticated user-session demo purchase, contract monitoring, or close; those broker proof gates remain explicitly open until a real SHAFX demo session completes quote → confirm → buy → monitor → close.
- Production/main and Cloudflare were not modified by this experiment.


### 2026-10-02 — Buy-path runtime error fixed + compact terminal-style ticket verified

- The user's exact runtime error `DERIV: account is not defined` was a real SHAFX code bug in `api/deriv/order.js`: the `buy()` path destructured `user, connection, accountId, token` from `requireConnection()` but later referenced `account.environment`. The selected `account` object was therefore undefined at audit/error handling time after the broker buy response path.
- Fixed by including `account` in the buy-path destructuring. No secret or credential change was required.
- The manual ticket was redesigned again into a denser, professional-terminal-style SHAFX layout:
  - compact `TRADE / DERIV` header with `EUR/USD · M5 · Multiplier`
  - large but compact BUY UP / SELL DOWN quote controls
  - stake and multiplier controls side-by-side
  - accepted EUR/USD multiplier presets 50/100/150/250/500
  - compact ENTRY / RISK / balance summary
  - Stop loss / Take profit moved under an optional Protection drawer
  - live proposal review and explicit confirmation remain separate
  - no long instructional cards or oversized explanatory copy
  - M5 remains chart context; Deriv Multiplier remains the broker contract model
- The first compact-ticket commit failed only because of one unused `sideLabel` variable. That was removed and the subsequent build passed.
- A pre-existing flaky realtime simulator test then failed at a wall-clock minute boundary. The test was made deterministic with Vitest fake time; this was a test-stability correction, not a change to the market simulation behavior.
- Final commit: `07e65d320963b694d23b74ccbc4c6708b973d0b7`
- Final Render deployment: `dep-davqreojo6nc738thm2g` — **LIVE**
- Final SHAFX CI run: **37011466802 — SUCCESS**
  - Build PASS
  - static server PASS
  - lint PASS (0 errors; existing warnings remain)
  - 64 test files / 271 tests PASS
  - npm audit PASS
  - external Render verification PASS
  - `DERIV_PUBLIC_SMOKE_PASS: active EUR/USD + M1/H1/D1 candles + MULTDOWN proposal verified`
- Production/main and Cloudflare remained untouched.
- Authenticated demo quote → buy → monitor → close is still an explicit broker-proof gate; the public smoke proves the proposal path, not a user's private authenticated purchase.

### Design tooling checked

- Installed and relevant: **Figma** and **Canva**.
- MagicPath is available in the plugin catalog but is not installed/eligible in this workspace, so it was not used.
- I did not replace the SHAFX UI with a generic template. The new ticket is coded directly around SHAFX + Deriv Multiplier behavior.

## 2026-10-02 — Multiplier/proposal buy-path correction
- User-visible failure: `PROPOSAL: Multiplier is not in acceptable range. Accepts 100,200,300,500,800.`
- Root cause: the experimental ticket still exposed older quick multiplier presets (50/100/150/250/500), while the connected Deriv EUR/USD demo market/account reported the current accepted set 100/200/300/500/800. The UI presets were aligned to the observed accepted set.
- Second failure: `BUY: Unknown contract proposal`.
- Root cause: SHAFX requested a proposal in one authenticated WebSocket and later attempted to buy that proposal through a newly opened authenticated WebSocket. Deriv's documented workflow keeps proposal and buy on the same WebSocket. The confirmation path now re-prices immediately and buys the fresh proposal on the same authenticated socket, avoiding stale/unknown proposal IDs.
- Added `subscribe: 1` to multiplier proposal requests to match the current Deriv workflow example.
- CI run `37012612863` completed SUCCESS; install, build, static smoke, lint, tests, audit, and Render rebuild-service verification all passed.
- Render deployment for commit `9ade8da9f6561aa57c4cc43db9337a91e9051e78`: `dep-davr0bmnfi0s7385k480` status LIVE.
- Authenticated demo proposal -> buy -> monitor -> close remains the final broker-proof gate; no real/demo contract purchase is claimed until an authenticated user interaction returns and verifies a Deriv contract ID.

## 2026-10-02 — Durable live trade state and browser-restart reconciliation
- User-visible issue: newly opened Deriv trades appeared with fixed `0` profit and disappeared after browser restart.
- Root cause: SHAFX manual trade state lived only in React memory. The authenticated Deriv account stream subscribed only to balance/transaction and did not restore open contracts, subscribe to `proposal_open_contract`, or load `profit_table` history.
- Fix: the Deriv account stream now requests the authenticated `portfolio` and `profit_table` on startup/reconnect, subscribes to each open contract with `proposal_open_contract`, emits live open-contract P/L updates, and emits closed-contract/history events. SHAFX now hydrates open positions and history from those provider events after browser restart.
- Provider stream manager now forwards account position/order events to the terminal so the trade table is updated from authoritative Deriv state rather than only local React state.
- CI run `37031094292` SUCCESS: install, build, static smoke, lint, tests, audit, and Render rebuild verification all passed.
- Render deployment `dep-davtaodckfvc73c6m3jg` LIVE for commit `73c33658800090ba6f986e5309e18158b040b3cd`.
- Main/production/Cloudflare untouched. The final broker-proof gate remains an authenticated user demo contract that is opened, visibly reprices in SHAFX, survives browser refresh/restart, and then closes with recorded P/L.


## 2026-10-03 — Chart interaction, timeframe separation, and trade-context correction

- User-reported chart issues addressed on the experimental rebuild branch:
  - Mouse/crosshair interaction was using Lightweight Charts Magnet mode (mode: 1), which could snap/bounce the inspection point onto live candle data. Changed to Normal crosshair mode (mode: 0) so the pointer stays where the user places it.
  - The chart timeframe selector was sharing the same top zone as the current-timeframe/status labels. The selector is now on its own dedicated rail below the status row.
  - Removed the duplicate TopNav timeframe strip so SHAFX has one primary interactive timeframe rail on the chart.
  - Removed overlapping duplicate chart timeframe badges from the chart header.
  - Manual TradeDock no longer hard-codes M5; it receives the active SHAFX chart timeframe and shows/records the timeframe that was active when the trade was opened.
  - Trade records now expose the captured chart timeframe as an explicit TF field when available.
  - Changing the chart timeframe no longer resets an already-open manual trade state.
  - Zoom spacing was tightened for more granular close-up candle inspection while preserving the existing viewport/zoom state logic.
- Important broker-context note: a Deriv Multiplier contract is not itself an M5/M15/M30 candle contract. The SHAFX timeframe is the chart/trade-analysis context captured at order time; Deriv still executes the Multiplier contract independently.
- Intermediate Render builds correctly caught and blocked two implementation mistakes before the final patch was accepted: an unsupported Lightweight Charts maxBarSpacing option and missing timeframe props on the TradeDock instances. Both were removed/corrected.
- Final application commit: a32c118216b2db55539939f10de01b562e265fb3
- Final Render deployment: dep-db0cbb8jo6nc739gcnq0 — LIVE
- Final SHAFX CI: 37111954262 — SUCCESS
  - install PASS
  - build PASS
  - Node Render static smoke PASS
  - lint PASS
  - 271 tests PASS
  - production dependency audit PASS
  - Render rebuild/public verification PASS
- Production/main and Cloudflare were not modified by this work.
- Broker-proof status remains unchanged: no authenticated demo contract purchase/monitor/close is claimed by this UI correction alone.


## 2026-10-03 — Dedicated timeframe rail, immediate chart-design switching, and zoom detail

- Screenshot-driven correction applied to the experimental chart workspace:
  - The timeframe selector is now completely outside the chart canvas in its own dedicated workspace rail, positioned above Chart Tools.
  - The in-chart M1/M5/M15/M30/H1/H4/D1/W1 rail was removed from normal chart view.
  - The in-chart current-timeframe label was removed; the active timeframe is now shown by the dedicated rail.
  - Chart design switching was refactored so the Lightweight Charts instance remains alive while the data series is swapped only when changing Candles/Bars/Wave/Area. Candle theme changes now update the existing series immediately instead of recreating a blank series without data.
  - Wave/Area/Bars/Candles now repopulate from the current candles immediately; changing timeframe is no longer required to make the new design appear.
  - FX chart price precision now uses one extra decimal beyond the pip size (for example, 5 decimal places for standard EUR/USD), making close-up zoom materially more detailed.
  - Zoom-adaptive timeline density now reveals more exact candle-boundary time marks as the user zooms in rather than limiting the axis to a fixed fourteen labels.
  - Added a professional hover OHLC/time readout so the hovered candle exposes exact O/H/L/C values and time.
  - Preserved Normal crosshair behavior so pointer inspection does not magnet-snap to a candle.
- Final application commit: 4c27ed33338fe59d69cca20af0c9c18a9370ab11
- Final Render deployment: dep-db0cjafr12us7398dg10 — LIVE
- Final SHAFX CI: 37112910992 — SUCCESS
  - build PASS
  - Node Render static smoke PASS
  - lint PASS
  - 271 tests PASS
  - production dependency audit PASS
  - Render rebuild/public verification PASS
- Main/production and Cloudflare were not modified.
- Interactive visual behavior is implemented and the deployed build is healthy, but this environment still does not have the user's authenticated browser session for a direct mouse/touch visual replay of the terminal itself.


## 2026-10-03 — Desktop trading workstation hierarchy

- User-provided PC screenshot showed the desktop terminal was too vertically stacked: oversized status/KPI cards were consuming chart area, the left column mixed watchlist and account, and the right workspace panel defaulted to an information/capability view instead of the actual trading ticket.
- Desktop research checked current TradingView Desktop/layout/watchlist guidance and MetaTrader 5 interface guidance. Common desktop organization is a persistent market/watchlist area, a dominant chart workspace with dedicated analysis controls, and a focused order/position area that can remain accessible without covering the chart. citeturn129105search0turn129105search1turn129105search3turn129105search12
- SHAFX desktop was restructured without changing the mobile layout:
  - left rail + dedicated 230px watchlist only; the bulky AccountPanel was removed from that column;
  - compact one-row desktop market/account status strip replaces the four large KPI cards;
  - chart becomes the dominant center workspace and is allowed to flex vertically instead of using the large fixed mobile-oriented chart height;
  - dedicated timeframe rail remains outside the chart canvas;
  - right panel defaults to the actual Deriv OrderPanel instead of the broker capability matrix;
  - Market intelligence/AI, Signal Desk, Liquidity and other tools remain accessible through the existing workspace rail;
  - bottom open/pending/history area is reduced to a compact 176–192px desktop band so positions remain visible without crushing the chart;
  - duplicate timeframe display was removed from the top navigation.
- Final application commit: 1e7eb2b4591c05f81dd534e37345e6c975936149
- Final Render deployment: dep-db0ctnajtthc73f381q0 — LIVE
- Final SHAFX CI: 37114159616 — SUCCESS
- Main/production and Cloudflare were not modified.


## 2026-10-03 — Desktop trading workstation hierarchy

- Screenshot-driven desktop correction completed for the experimental Render workstation.
- The desktop layout now follows a clearer professional terminal hierarchy:
  - left: compact Market Watch/watchlist
  - center: dominant chart workspace
  - right: Trade Ticket/order panel
  - bottom: compact Positions/Pending/History blotter
- Removed the large desktop account/equity/free-margin card stack that competed with the chart. Those metrics remain available in the account/trade context rather than occupying the primary chart workspace.
- Reduced duplicate desktop header controls and tightened the timeframe rail so the chart receives substantially more usable space before fullscreen.
- The default desktop right-side workspace is now the Trade Ticket; analysis/AI/liquidity panels remain available from the workspace rail rather than competing with the chart by default.
- Reduced desktop navigation rail width and tightened the right workspace header.
- The trade blotter TF column now matches its header and shows the captured chart timeframe.
- Design intent is consistent with established desktop trading-platform separation between Market Watch, chart, trading controls, and trade/history tools. MetaTrader 5 documents Market Watch, chart/toolbars, and Toolbox as distinct workspace elements, while TradingView describes a layout as the chart workspace and keeps watchlists as a separate widget. 
- Final desktop code commit: `8c5dcde243c6676e0b0bd0c8c395f7e75e6fbb62`
- Final Render deployment: `dep-db0d5cqvc2jc7396ad7g` — **LIVE**
- Final SHAFX CI: `37115067910` — **SUCCESS**
  - build PASS
  - static server PASS
  - lint PASS
  - 271 tests PASS
  - production dependency audit PASS
  - Render rebuild verification PASS
- An intermediate desktop commit failed its build because an obsolete `PanelRight` import remained after the header simplification. That was corrected before the final live deployment; the final CI/build is green.
- Main/production and Cloudflare were not modified.


## 2026-10-05 — Restore the earlier trade ticket, account history, and MT5-style Bid/Ask chart rails

- Corrected the over-restore on the isolated test branch only; production/main remains untouched.
- Trade Ticket: preserved the earlier Deriv-native custom ticket rather than reverting to the old Forex-lot ticket. It keeps BUY UP / SELL DOWN, stake + multiplier, Entry, Stop Loss, Take Profit, pip-distance/risk calculations, proposal review/confirmation, active-position details, and close flow.
- Trade Ticket risk floor: restored the requested SHAFX minimum multiplier stake to **10** account-currency units. The UI defaults to 10 and blocks quote requests below 10; the Deriv order API now enforces the same floor server-side.
- History: restored the earlier compact account-scoped History presentation under the mobile History workspace: open-position blotter plus Net P/L, Wins, Losses, Gross Profit, Gross Loss, Win Rate, account label/type, and completed-trade count. Removed the extra older simulator/history panels from that workspace.
- Chart: removed the separate blue current-price treatment from the active flow. Bid/Sell is anchored to the latest candle close, Ask/Buy is displayed at a small SHAFX spread above it, and both are rendered as native chart price lines/labels rather than floating DOM overlays. The same Bid/Ask values are passed into the Trade Ticket so BUY uses Ask and SELL uses Bid.
- Verification work required before this entry is considered PASS: install, build, lint, tests, Render static smoke, Render rebuild/public verification, and branch deployment health must all pass.


### Verification — targeted restore

- Code state verified on commit `0317db91693303f37093b9ad30ab3548f19aa5bb` before this documentation update.
- Render deployment for the code state: `dep-db1p3ifiij0c73agh770` — **LIVE**.
- Render public smoke run `37306858410` — **SUCCESS** (Render test smoke).
- SHAFX CI run `37306866856` — **SUCCESS** (install/build/lint/tests/audit and configured PR checks).
- Result: targeted trade ticket + history + chart restore is verified; no claim is made for an authenticated real/demo contract purchase in this entry.


## 2026-10-05 — Restore the verified SHAFX ticket + full history design and fix live Bid/Ask rails

- Restored the verified Oct 5 Trade Ticket design from the last successful ticket pass: BUY/SELL side-selection changes the selected action to SHAFX green/red, with Deriv-native UP/DOWN wording.
- Restored the compact selectable Auto Exits section: SL/TP ON/OFF plus small selectable checkpoints. Stop Loss choices are 10%, 20%, 40%, 80% of stake; Take Profit choices are 1×, 2×, 5×, 10× stake. Chart SL/TP estimates remain visible underneath.
- Stake guard: minimum `10`, maximum `2,000` account-currency units. The cap is enforced both in the ticket input/quote flow and server-side in `api/deriv/order.js`.
- Restored the unique SHAFX `TradeHistoryPerformance` design: Made/Lost/Net cards, markets traded summary, and the full closed-trade log.
- Mobile History now opens directly on the full SHAFX History tab rather than the temporary compact-history replacement.
- Chart BUY/ASK is green and SELL/BID is red. The chart rails now follow the live `currentPrice` on every market snapshot instead of the last candle close, with a small visible Ask spread above Bid so they move together but do not stack.
- Main/production remains untouched.


### Final verification — exact ticket/history/chart restore

- Final code commit: `79453b81038cb81e93c577c6b048b046275c3419`.
- SHAFX CI run `37308854911` — **SUCCESS**.
- Render smoke run `37308848030` — **SUCCESS**.
- Render deployment `dep-db1pc25ckfvc73e0jbfg` — **LIVE**.
- The verified ticket uses the earlier SHAFX green/red BUY/SELL action design, the Auto Exits SL/TP checkpoints, and the new-trade/active-position layout; stake is capped at 2,000 on both UI and server.
- The verified History uses the earlier `TradeHistoryPerformance` design and renders the complete closed-trade history rather than the temporary compact summary.
- The verified chart uses moving live-price rails with BUY/ASK green and SELL/BID red, with Ask separated from Bid so the two lines do not stack at one price.
- Main/production was not modified.

### Regression found and fixed — account trade state, history persistence, closes, and quote rails (2026-10-05)

- User retest found that the restored ticket/history/chart looked correct visually but the live trade state was still broken: BUY/SELL display prices appeared stacked, active P/L/current price stayed at 0.00, trades disappeared after browser restart, History did not repopulate the full account history, and Winning/Losing/All close controls were not connected from the app shell.
- Root cause: `src/integrations/deriv/adapter.ts` created `DerivAccountStreamTransport` without forwarding its `onEvent` callback. The transport was already receiving `portfolio`, `proposal_open_contract`, and `profit_table` messages, but the account stream events were being dropped before reaching `App.tsx`.
- Fixed: Deriv adapter now forwards account stream position/order events; the account stream now requests up to 500 `profit_table` records per page and paginates using `count`/`offset`, so browser restart can rebuild Open and History state from the authenticated Deriv account.
- Fixed: immediate purchased-trade state now carries the quote spot as `currentPrice`; live `proposal_open_contract` updates then replace it with the current spot and P/L.
- Fixed: App now wires the existing SHAFX Winning/Losing/All bulk-close controls to the real Deriv close endpoint, and each open trade row remains individually closable regardless of the currently selected market.
- Fixed: History keeps the recovered SHAFX performance design while showing account-currency stake traded and stake per closed trade.
- Fixed: BUY/ASK and SELL/BID rails now have a minimum visible SHAFX display spread at the pair's native precision, so they cannot collapse to the same displayed value.
- Verification required before marking this regression passed: SHAFX CI, Render smoke, Render LIVE deploy, and a re-check that main remains untouched.

### Verification failure — CI type check on history pagination (2026-10-05)

- SHAFX CI run `37311585216` for commit `784e488403b5aa1513a0e181abf72d1d54520d2c` failed at `npm run build` because the new `profit_table.count` field was not yet declared in the local Deriv message type.
- Fixed in the next test commit by declaring `profit_table.count` as `number | string` so the full-history pagination code remains type-safe.
- Reverification is required after this compile fix; no production/main changes are permitted.

### Verification pass — live trade state/history/close regression (2026-10-05)

- Fix commit under test: `423833c105cd55c638b103f6f39ecf58b2e4b2ce`.
- SHAFX CI run `37311827447` — **SUCCESS**.
- Render test smoke run `37311817414` — **SUCCESS**.
- Render deployment `dep-db1po2ff3r2c73ca33dg` — **LIVE** for the fix commit.
- Main integrity rechecked: `4d5ff9010f96dcf3a430527b49d1156e2e3f02d5` — unchanged.
- The remaining verification target is the final tracker-only commit below; authenticated Deriv behavior still requires a real browser trade/restart check because CI/smoke do not have the user's connected account session.


### 2026-10-05 — Fractional-pip BUY/SELL price sensitivity + durable handoff update

- User reported that live BUY/SELL prices were jumping in coarse steps (for example 1158.130 → 1158.140 → 1158.150) instead of showing finer movement such as 1158.140 → 1158.141.
- Root cause: chart display precision and `minMove` were derived from the full pip size, so a 0.01-pip instrument was effectively displayed at 0.01 increments. The chart price tag formatter also used the older coarse precision calculation.
- Changed `src/components/chart/CandlestickChart.tsx` so chart `priceStep` is one fractional pip (`pipSize / 10`) and the price precision retains that final digit. This gives the intended MT5-like 5-digit FX / 3-digit JPY-XAU-style display behavior without inventing additional market ticks.
- Changed `src/App.tsx` so the SHAFX display BUY/SELL values preserve the symbol's native precision and use a smaller display spread. The underlying live quote still comes from the Deriv tick stream; the displayed two-sided spread is explicitly a SHAFX estimate because the current public market stream supplies one quote rather than an authoritative broker bid/ask pair.
- Created/maintained `docs/SHAFX_CURRENT_STATE.md` as the persistent handoff document. It records the rebuild mission, active branch, account/funding model, current UI architecture, known root causes, verification rules, completed changes, and next steps so a future chat can continue without asking the user to reconstruct the history.
- Verification for the latest precision commit `1bd793ea48b976df833978875386497b6c1a138b`:
  - GitHub SHAFX CI: PASS
  - Render smoke: PASS
  - Render deployment: LIVE (`dep-db1tpnsv8u7c73e1rha0`)
- Not claimed complete: handset-level visual confirmation of live fractional-price movement is still open, and authenticated Deriv demo contract proof-of-life remains open.

### 2026-10-05 — Live account equity/free-margin state repaired

- User reported that the connected account did not behave like an MT5-style account view after an open trade: Equity, Free Margin, Used Margin, and Floating P/L were not changing with the open position.
- Root cause: the Deriv account stream only emitted the subscribed account balance snapshot. The same stream was already receiving the open-contract profit and stake values, but those values were not being folded into the account snapshot consumed by App.tsx.
- Fixed src/integrations/deriv/accountStream.ts to track currently open multiplier contracts and derive:
  - Equity = balance + aggregate floating P/L
  - Used Margin (SHAFX-derived) = aggregate stake committed to open multiplier contracts
  - Free Margin (SHAFX-derived) = max(0, equity - used margin)
  - Floating P/L = aggregate open-contract profit
- Added src/integrations/deriv/accountStream.test.ts covering the derived account-metric calculations.
- Important semantic boundary: these are MT5-style SHAFX account metrics for a Deriv Multiplier account. Deriv's current balance endpoint supplies the account balance, while open-contract status supplies live contract fields; this is not a claim that Deriv Multipliers expose MT5 CFD margin fields directly.
- Verification:
  - GitHub SHAFX CI run 37352851712 — SUCCESS.
  - Render deployment dep-db1uc0blthtc73a43kc0 for commit f946d16a95c7184c329caeb5e227738e1fd46841 — LIVE.
  - Render build completed successfully and the replacement Node server started cleanly.
- Remaining human verification: open a real controlled demo Multiplier in the authenticated browser session and confirm the visible Equity/Free Margin/Floating P/L values move with the contract.

### 2026-10-05 — Bot rebuild diagnostic checkpoint

- Existing bot UI/engine contains substantial reusable analysis logic: multi-timeframe candle loading, market structure, liquidity, support/resistance, setup detection, multi-timeframe bias, learning/research, 5-round unit state, progress-ring UI, and authenticated daily usage accounting.
- The current test branch deliberately disables autonomous broker execution in src/engine/agent/executeDerivTrade.ts; it now returns no order while the Deriv-native manual bridge is being proven.
- The old live-bot implementation on fix/deriv-live-bot-scanner was lot/Forex-oriented and hard-coded a multiplier, so it should not be restored wholesale.
- The recommended rebuild is two separate products sharing one analysis/data core:
  1. SHAFX Signal Radar — read-only multi-timeframe scanner that returns the strongest three timeframe opportunities and hands the selected setup to the existing manual ticket.
  2. SHAFX Autopilot Unit — server-owned five-round execution run using the working Deriv proposal/buy/contract-monitor/close path.
- The browser should become the presentation/control surface, not the source of truth for an autonomous run. A run must survive refresh/disconnects and continue from persisted server state.
- The next engineering gate is architecture/schema/API design for those two independent bot services before restoring autonomous execution.

### 2026-10-05 — Account metrics forwarding root cause corrected + Signal Radar integrated

- A second account-state diagnosis was required after the first derived-metrics patch: src/integrations/deriv/accountStream.ts correctly calculated Equity, Used Margin, Free Margin, and Floating P/L, but src/integrations/deriv/adapter.ts was dropping those fields when converting the snapshot into the provider account event.
- Fixed: the Deriv adapter now forwards equity, usedMargin, freeMargin, and floatingPL to the app account state.
- Latest functional account-state chain is therefore: Deriv balance + open-contract profit/stake -> DerivAccountStreamTransport -> Deriv provider adapter -> ProviderAccountStream -> App.tsx -> Account/terminal UI.
- The remaining human proof is the user's active authenticated demo trade after a hard refresh: the displayed Equity/Free Margin/Floating P/L must move with the open contract.
- Added src/engine/bot/signalRadar.ts and tests. Radar scans the existing SHAFX timeframe set (M1/M5/M15/M30/H1/H4/D1/W1), ranks up to three strongest opportunities, exposes a SHAFX strength score, and hands the selected setup to the existing manual ticket.
- Integrated Signal Radar into SignalDeskPanel.tsx; no automatic broker execution was enabled.
- The durable Supabase bot-run schema remains prepared for future run-state orchestration, but there is currently no unattended broker execution worker/API on this branch.
- Latest verified Render deployment for the integrated Signal Radar: dep-db1vakvavr4c73a2eh1g — LIVE.
undefined