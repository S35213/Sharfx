# SHAFX Test-Project Rebuild Tracker

> Single source of truth for the SHAFX broker-rebuild test project.
>
> **Rule:** A checkbox is marked `[x]` only after the corresponding action is actually verified. A deployment being "started" is never recorded as passed.

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
- [ ] Runtime stability is NOT yet marked passed
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
- [ ] Verify the SHAFX UI loads interactively in a browser
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
