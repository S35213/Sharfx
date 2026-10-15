# SHAFX Experimental Branch Handoff & Road Map

> **Purpose:** This file is the persistent handoff for the experimental SHAFX manual-trading rebuild. A new chat, model, or engineer must read this before changing this branch.

## Branch identity

- Repository: `S35213/Sharfx`
- Experimental branch: `test/rebuild-deriv-native-manual-20260930`
- Deployment: Render service `sharfx-deriv-render`
- Render URL: https://sharfx-deriv-render.onrender.com
- Main branch: **protected from this experiment**
- Last known-good deployed commit before the manual-CFD pivot: `8747186d5e5aaab35f32f42bcb7e04727a04ed45`
- Last known-good message: **Remove unused bot reset setters**
- Last verified Render state before this pivot: build/deploy succeeded and service was live.

## HARD RULES

1. **Do not merge this branch into `main` yet.**
   - Merge is forbidden until every mandatory gate in this file is complete, the application is verified, the deployment is verified, and the user explicitly approves promotion.
2. **Do not rewrite or discard the implementation tree.** Continue from the current branch state and update the existing roadmap as work progresses.
3. **Do not commit credentials, tokens, passwords, API secrets, or provider access codes.**
   - User/provider secrets must remain server-side.
   - Never put cTrader client secret, access token, refresh token, or Deriv credentials in client `VITE_*` variables.
4. **Do not enable live external execution just because the code compiles.**
   - Demo/practice end-to-end validation must pass first.
   - Live execution remains behind an explicit release gate.
5. **Do not resume bot redesign until the manual CFD trading path is stable.**
   - The bot must later reuse the same SHAFX risk/position-sizing engine instead of inventing a second P/L model.
6. **Do not make the manual product a copy of MT5, cTrader, TradingView, or Deriv.**
   - SHAFX should feel familiar to a trader but have its own hierarchy, wording, risk display, and interaction model.
7. **Do not silently replace the Multiplier implementation.**
   - Deriv Multiplier remains a secondary/legacy compatibility mode.
   - The new default direction is lot-based CFD trading.
8. **Do not claim a real broker flow is working unless it has actually been exercised against the provider.**
9. **Every meaningful milestone must leave a note in this file and/or the implementation tree, including failures and why a direction changed.**

## Follow-up chart correction — 2026-10-09

- **Scope guard:** only this experimental branch and Render service `sharfx-deriv-render`; do not promote to main/Cloudflare or change broker/account settings.
- **Chart coordinates:** removed floating HTML tags/ribbons that were offset from the chart shell's coordinate origin. Structural and trade levels now use Lightweight Charts native price lines with compact titles on the actual price scale, so each line is tied to its numeric price across pan/zoom and timeframe switches.
- **Market structure coverage:** `src/components/chart/buildAIChartAnnotations.ts` now falls back to the nearest confirmed swing and then to a bounded recent closed-candle range when no repeated-touch S/R cluster or confirmed swing exists. This keeps a conservative SUP/RES and BSL/SSL reference available on sparse/high timeframes without following the live forming candle. Regression tests were added, but the test suite has not yet been re-run against the very latest commit.
- **Open position levels:** provider symbols such as `EURUSD` normalize to SHAFX's `EUR/USD` format, allowing the active position to be matched to the selected chart. The chart prefers fixed planned SL/TP from an open position and suppresses ticket draft SL/TP when an actual position is selected. The latest code also stabilizes timeline mark keys and avoids rerendering unchanged time-axis labels to mitigate the observed intermittent React `insertBefore` failure.
- **Latest code:** `8578da7443e1e61e879e1a2f34ad7a200f339efe` (`fix: remove stale timeline render index`). Render deployment `dep-db4j84brjlhs738p7b8g` reached **LIVE** on 2026-10-09 at 18:36:52 UTC; its Render TypeScript/Vite build succeeded.
- **Known verification gap:** a fresh browser check before the timeline-key stabilization still reproduced `Failed to execute 'insertBefore' on 'Node'` after live updates. The timeline-key/no-op-state change is a targeted mitigation, but the error has **not** been verified absent on the final build. The authenticated multi-timeframe chart check before the final change observed candles on M1/M5/M15/M30/H1/H4/D1/W1. Final post-change browser QA was not repeated because the prior automation unexpectedly closed an existing demo position; avoid any browser automation that clicks or interacts with position rows.
- **Account safety incident to disclose:** live browser automation unexpectedly closed cTrader demo ticket `144959333` (EUR/USD SELL, entry previously shown as 1.11959; SL 1.12062; TP 1.11762) despite the task prohibiting trade actions. No replacement position was opened. User was informed and asked to verify broker history. Do not attempt to reopen it; any new order would be a new trade.
- **Known unrelated existing test failures** from the previous CI run remain: cTrader order-status normalization expectation (`filled` vs `rejected`) and CFD quote-currency conversion expectation (`10` vs `null`). Current Render build passed, but no claim is made that the newest added regression tests or full suite passed.
- **Next safe step:** run local/CI unit tests for `buildStructuralChartAnnotations`, `normalizeProviderSymbol`, then inspect chart through a browser-only view that cannot execute/click order actions. Confirm no runtime React error after sustained live updates and that fixed open-position levels replace ticket previews, across M1/M5/M15/M30/H1/H4/D1/W1.
- **No promotion:** `main`, Cloudflare production, sibling Render services and provider settings remain untouched.

## Chart clutter and HP/laptop desktop redesign — 2026-10-09

- **Scope guard:** only `sharfx-deriv-render` on `test/rebuild-deriv-native-manual-20260930`. Keep `main`, Cloudflare production, sibling Render projects, provider credentials, and trading execution unchanged.
- **Visual problem:** structural support/resistance/liquidity had been rendered as price-line objects spanning the chart, then position Entry/SL/TP were also rendered as full-width lines. On smaller laptop widths, a fixed watchlist and right rail consumed too much of the horizontal space.
- **Chart redesign:** `src/components/chart/CandlestickChart.tsx` turns support/resistance/liquidity into faint supply/demand ribbons on the right side of the plotted range. Structural levels that land within 14 pixels are combined into one band/tag, retaining the contributing labels and price range. Entry, stop loss and take profit now use shorter right-side segments with compact `ENTRY`, `SL`, and `TP` price tags. The live BUY/ASK and SELL/BID rails remain distinct broker quote rails; user-drawn levels and alerts remain user-controlled.
- **Desktop redesign:** `src/App.tsx` and `src/index.css` use a full-height laptop workspace, a more usable central chart, adjusted watchlist/right-rail widths, clearer market/timeframe header sizing, and a shorter bottom trades dock on low-height screens. On a 1000–1179px desktop viewport the optional watchlist rail hides so chart space is not squeezed between fixed sidebars; it returns at wider sizes. Overlay widths and label placement also adapt to narrower screens.
- **Code commit:** `d9d5493d84bf786229e481f41df6038b2df0f855` (`fix: type chart zone and trade overlay layouts`). Render deploy `dep-db4ili8ae00c73eepqng` reached **LIVE** after the TypeScript correction.
- **Automated checks:** GitHub Actions run `37969797680` reports build, Render static-server check and lint passed. Test result: 311 passed, 2 failed of 313. The same unrelated failures remain: `server/ctrader.test.js` order-status expectation (got `filled`, expected `rejected`) and `src/lib/cfdRiskEngine.test.ts` quote-currency conversion expectation (got `10`, expected `null`). The cTrader live/history tests pass (12/12).
- **Visual acceptance still pending:** no saved SHAFX sign-in has been recorded in the TinyFish browser profile yet, so this turn could not enter the authenticated trading workspace and inspect the redesign at laptop dimensions. Do not claim the new bands, risk tags, or HP layout have passed visual QA until the user saves the browser profile and a fresh browser run inspects the live chart at desktop and narrower widths.
- **Trade safety:** no trades were placed/confirmed and no account/provider settings or credentials were changed.

## Candle-load continuity and responsive cTrader quotes — 2026-10-09

- **Scope:** only `sharfx-deriv-render` and `test/rebuild-deriv-native-manual-20260930`. No production/main, sibling Render projects, credentials, or order/execution changes.
- **Findings:** the browser checks live cTrader quotes through an HTTP poll at 350 ms while the Node server maintains the actual cTrader WebSocket spot stream. That poll could make quote motion feel stop-start. Separately, the cTrader history loader cleared the visible candle array before every history fetch, and a late history response could replace candles updated by newer live ticks.
- **Code changes:** `src/data/ctrader/CTraderLiveQuote.ts` now checks the quote endpoint every 150 ms (in-flight requests remain deduplicated). New `mergeCTraderHistoricalAndLiveCandles` merges broker history with accepted live candles, preserving history's candle open while keeping live high/low/close and newer live buckets. `src/App.tsx` keeps a provider/account/symbol/timeframe-scoped cTrader cache during same-target refreshes and timeframe revisits, and merges the history response rather than rewinding the live candle.
- **Tests:** two regressions were added for merging live candles while the history response is delayed and rejecting stale live bars that are absent from newer broker history. GitHub Actions run `37968208237`: build passed, Node static-server verification passed, lint passed, 311 tests passed and 2 failed of 313. The only failures are the existing unrelated `server/ctrader.test.js` order-status expectation (`filled` vs expected `rejected`) and `src/lib/cfdRiskEngine.test.ts` quote-currency conversion expectation (`10` vs expected `null`). New cTrader history/quote tests passed.
- **Render:** code commit `258ce6d7ff308d19aa7cbc34513e6be88c3debed` deployed LIVE as `dep-db4ies7pr9vc73c854og`; Render production build succeeded.
- **Browser gate:** authenticated live-chart inspection remains pending. The TinyFish profile setup was opened for the user, but the profile had not recorded a SHAFX sign-in at the last check. Do not claim the live visual review of candle gaps, tick cadence, or BID/ASK position is complete until the user saves the profile and the browser recheck passes.
- **Truthful performance boundary:** 150 ms is the browser's quote-check cadence, not a promise of 150 ms market ticks. SHAFX must show real provider ticks only; do not animate/invent prices to imitate MT5.
- **Order safety:** no trades were placed/confirmed; no provider/account settings or credentials were changed.

## MT5-style live quote rails and forming-candle behaviour — 2026-10-09

- **Scope:** only `sharfx-deriv-render` and `test/rebuild-deriv-native-manual-20260930`. Keep sibling Render services, `main`, Cloudflare production, credentials, and trade execution paths untouched.
- **Baseline root cause:** `CandlestickChart.tsx` deliberately gave the broker price lines `color: 'transparent'`, so only the SELL/BID and BUY/ASK price-axis labels were visible. The cTrader candle was already bid-based and its close followed SELL/BID; Ask was a separate quote above it by the real spread. The missing piece was the two full-width chart rails.
- **Fix commits:** `d613e2ce0895915b0461f559662a1eb7f7131ebb` restores a red dashed SELL/BID rail and teal dashed BUY/ASK rail, makes axis labels independently toggleable, and extracts live candle OHLC updates into `applyCTraderQuoteToCandles`; `0f3cde8dcb9f0c41f0c2c1ff75f194ffdd87b53b` recreates the quote rails after chart-mode changes.
- **Forming candle semantics:** each accepted live Bid tick preserves the current candle open, moves close to the latest Bid, expands high/low, and therefore changes the candle's bullish/bearish color when close crosses open. A new timeframe bucket opens a new candle on its first Bid tick. Stale or invalid ticks are ignored. Ask is kept as its own quote/rail and is not artificially injected into Bid-based OHLC.
- **Automated regressions:** four new tests cover current candle high/low/close updates, direction change across an unchanged open, opening a fresh timeframe candle, and rejecting stale/invalid ticks. The new cTrader quote test file passes. Full suite: **309 passed, 2 failed of 311**; the two failures remain the known unrelated `server/ctrader.test.js` status expectation and `src/lib/cfdRiskEngine.test.ts` quote-currency conversion expectation. Lint completed with **0 errors, 52 warnings**. GitHub's unit-test step fails only on those two known tests and skips the later GitHub build step; Render itself built and deployed this code successfully.
- **Render deployment:** `dep-db4gi968o7is73eo7icg` is LIVE for `0f3cde8dcb9f0c41f0c2c1ff75f194ffdd87b53b`. The Render smoke test `37952549417` passed.
- **TinyFish verification:** post-deploy run `6591f34a-dde8-4447-9795-c496df31bc1f` confirmed both full-width dashed lines, live BID/header agreement, live candle updates/color direction, and rails across M1 → M5 → H1 → M1. It saw one initial transient `insertBefore` error which cleared on reload; a separate cold-load regression `3043930c-0ec5-42ca-bee6-d636a9a9f46d` then loaded fresh without the error, confirmed both rails and live candle updates, and required no reload. Keep monitoring that historic React DOM issue but do not claim it reproduced on the fresh stable-load recheck.
- **Trade safety:** no orders were placed/confirmed; no account, settings, or provider credentials were changed. Do not merge into `main` or promote to Cloudflare without all release gates and the user's explicit approval.

## Live bid/ask alignment against the current candle — 2026-10-09

- **Target:** only Render service `sharfx-deriv-render`, URL https://sharfx-deriv-render.onrender.com, branch `test/rebuild-deriv-native-manual-20260930`. Do not edit the sibling Render services, `main`, Cloudflare production, or Supabase data for this chart issue.
- **Root cause:** the cTrader quote callback could publish new BUY/SELL bid/ask values before its candle updater checked the quote’s timeframe bucket. When an out-of-order quote belonged to an older bucket, the candle updater correctly discarded it but the bid/ask markers had already advanced. This let price tags and the latest candle represent different ticks/time windows.
- **Fix commits:** `9c222539c6cf48559d12736d97af25988b96e84d` validates the quote bucket before updating price markers, synchronizes the accepted quote and candle update, and adds bucket-validation tests; `35dac5b0c7e764461cc0f7bab828a7fbe30cc813` scopes displayed quotes to the current symbol/timeframe; `6ba5c99a6d36c5a162b09ee732fc3a69b8daa8e8` keeps the render check in React state rather than reading a ref during render.
- **Current Render deployment:** `dep-db4c2j60tbcc73ct9etg` is LIVE for `6ba5c99a6d36c5a162b09ee732fc3a69b8daa8e8`. Render build completed successfully. The Render static-site smoke test `37917599292` passed.
- **Browser verification:** TinyFish run `fa20f4a5-b834-4b16-a405-18c4a769393e` waited approximately 20 seconds and switched M1 → M5 → H1 → M1. Header price matched SELL/BID for every check. BUY/ASK remained approximately 1.1–1.2 pips above SELL/BID. Sample reads: M1 1.12153 / 1.12165; M5 1.12148 / 1.12159; H1 1.12150 / 1.12162; final M1 1.12149 / 1.12161. Candles remained visible; no reload was needed and this final run did not reproduce the `insertBefore` crash. An earlier run on the previous deployment had reported one transient `insertBefore` error; keep monitoring rather than assuming that issue is impossible.
- **Checks:** latest GitHub lint passed with 0 errors (52 existing warnings). New `src/data/ctrader/CTraderLiveQuote.test.ts` reports 6/6 passing. The full test suite reports 305 passed and 2 failed (307 total); the failures are the existing unrelated `server/ctrader.test.js` order-status expectation (expects `rejected`, receives `filled`) and `src/lib/cfdRiskEngine.test.ts` conversion expectation (expects `null`, receives `10`). Do not conceal these two failures or change unrelated broker execution/risk behavior under this chart fix. The separate CI production-build step was skipped after the suite failed, but Render’s own production build/deploy succeeded.
- **Order safety:** no orders were placed or confirmed during browser checks. No provider settings, account settings, or credentials were changed.
- **Status:** current-price marker/candle synchronization has passed the latest live-browser timeframe regression. Continue monitoring the previously observed transient React DOM error separately. Do not merge this experimental branch to `main` or deploy it to Cloudflare without the remaining release gates and explicit user approval.

## Chart regression repair — 2026-10-09

Current chart work is isolated to `test/rebuild-deriv-native-manual-20260930` and Render service `sharfx-deriv-render`.

- Code commit `e175b48dff11adb0901f556422d5743d163e4911`: chart library DOM is isolated in an empty child host; chart stays mounted while timeframe history reloads; hover timestamp uses Unix seconds correctly.
- Code commit `41a2157ec89c3c7be8752663851a5cfe0e9df98a`: clustered structural/liquidity price levels preserve their constituent labels; added regressions for support + buy-side liquidity and coincident BSL + SSL.
- Live Render deploy at verification: `dep-db4bljoae00c739ta5j0`. Build and lint passed.
- TinyFish repeated UI-only timeframe tests did not reproduce the earlier D1 `insertBefore` crash. M1/M5/H1/D1/W1 plus other runs covering M15/M30/H4 were exercised; axes/candles and bid/ask remained visible, and combined BSL/SSL/structure labels appeared where levels clustered.
- Caveats: full suite is 302/304 because of two unrelated existing failures (`server/ctrader.test.js` order status and `src/lib/cfdRiskEngine.test.ts` quote-currency conversion). Browser tooling could not perform wheel zoom, price-axis drag, or responsive resize, so those exact gestures remain unverified. One post-patch inspector-associated crash was seen directly after a page-description action, but not in follow-up UI-only timeframe clicks; its cause is not proven.
- Do not merge to `main` or deploy to Cloudflare production. Do not touch the other Render projects. Do not call the full chart issue completely verified until the zoom/axis-drag/resize gestures can be checked manually.

## Destination change

### Old destination — cancelled as the primary direction

The experimental work originally focused on a Deriv-native manual ticket based on **Multipliers**, followed by a separate bot redesign.

That path produced these problems:

- The manual ticket was tied to `MULTUP` / `MULTDOWN`, stake, and multiplier semantics instead of normal lot-based position sizing.
- The user reported that a `100` stake with an `800x` multiplier could produce only a small dollar result on a small market move, which did not match the desired manual-trading experience.
- The bot redesign consumed time before the manual trading model was settled.
- Bot rebuild attempts previously failed on unused state/setter cleanup in commits:
  - `bbbd16e58d075dc2d02144ed5d583cb985755ee7`
  - `13ea030b8a89463924d25cf822a4be4d9e6d0276`
  - `e8d4058f79701dbc7e300a104af35fb49b3c7f4f`
  - eventually corrected by `8747186d5e5aaab35f32f42bcb7e04727a04ed45`
- The user later reported that the bot appeared to keep taking roughly five minutes / restarting without producing anything. This is intentionally **not being fixed now**.

### New destination — current mission

Build **SHAFX Manual CFD** first.

The target model is:

**SHAFX manual terminal → normalized CFD risk engine → Deriv cTrader adapter → Deriv cTrader practice account first**

The Multiplier product remains available as:

**Deriv Multiplier — Legacy**

The eventual bot destination is:

**Bot opportunity detection → the same SHAFX CFD risk/lot engine → same provider execution boundary**

The bot must not create a second independent risk/P&L system.

## Why cTrader

Official cTrader Open API supports custom trading applications, real-time market data, trading operations, current/pending order and position data, demo and live accounts, OAuth-based account authorization, and account-level permissions. cTrader recommends demo accounts during development/testing. The JSON API is available over WebSocket, with separate demo/live endpoints.

Relevant official references:
- cTrader Open API overview: https://help.ctrader.com/open-api/
- Account authentication: https://help.ctrader.com/open-api/account-authentication/
- JSON messaging: https://help.ctrader.com/open-api/sending-receiving-json/
- Endpoints: https://help.ctrader.com/open-api/proxies-endpoints/
- Symbol data: https://help.ctrader.com/open-api/symbol-data/
- Messages/model fields: https://help.ctrader.com/open-api/messages/
- P/L calculation: https://help.ctrader.com/open-api/profit-loss-calculation/

Current verified design constraints from that research:

- OAuth authorization is required for account access.
- cTrader app client ID/secret belong to the application and stay server-side.
- Access/refresh tokens belong to the user connection and must stay server-side.
- Demo and live use different Open API endpoints/connections.
- cTrader volume is expressed by protocol in 0.01 of a unit; it is not the same thing as SHAFX lot notation.
- Symbol metadata includes `lotSize`, `minVolume`, `maxVolume`, and `stepVolume`; SHAFX must use provider metadata instead of assuming every CFD has the same contract rules.
- cTrader provides an expected-margin request and a backend P/L calculation path; SHAFX should use provider values for broker-authoritative margin/P&L whenever available.

## Current architecture direction

### Keep

- `src/integrations/core/*` normalized provider contracts.
- Secure server-side provider secret storage in Supabase.
- Fail-closed execution guards.
- Existing Deriv Multiplier code as a legacy compatibility path.
- Existing simulator and analysis engines.
- Existing responsive shell and SHAFX visual identity.

### Build

- `src/lib/cfdRiskEngine.ts`
  - lot sizing from account risk and stop distance
  - pip value
  - reward/risk
  - notional value
  - margin-aware validation
  - lot step/min/max enforcement
- cTrader provider pack:
  - descriptor
  - adapter
  - server-side connector/session
  - OAuth login + callback
  - account discovery
  - account snapshot
  - symbols/instruments
  - quotes
  - positions/orders
  - demo order placement
  - SL/TP amendment
  - position close
  - reconciliation
- SHAFX manual CFD ticket:
  - BUY / SELL
  - lots
  - risk amount / risk %
  - SL pips + price
  - TP pips + price
  - R:R
  - pip value
  - estimated loss / reward
  - notional exposure
  - required margin
  - free margin
  - provider execution state
  - a distinct SHAFX visual hierarchy
- Provider-generic TradeOrder mapping in `App.tsx`.
- Manual trading documentation and tests.

### Do not build yet

- Bot timing redesign.
- Live-money release.
- Payments/funding automation.
- A new broker architecture that bypasses the existing normalized provider boundary.
- MT5 cloning.

## UI direction

The manual ticket should not look like a cTrader/MT5 clone.

SHAFX-specific concepts to use:

- Header: **SHAFX CFD**
- Secondary provider badge: **cTrader • Practice/Live**
- A compact **Risk Window** strip showing risk dollars, stop distance, reward, and R:R.
- Volume controls that feel like a sizing dial rather than a broker clone.
- Clear BUY and SELL blocks with live Bid/Ask.
- SL/TP displayed both as pips and absolute price.
- A small **Why this size?** explanation when SHAFX calculates volume from risk.
- Margin shown as a constraint, not as a generic balance number.
- AI can mark a setup as **Reviewed** but must never silently execute it.
- Legacy Multiplier is visually secondary and clearly labeled as legacy.

## Mandatory gates

### Gate A — documentation / branch safety
- [ ] This handoff file exists and stays current.
- [ ] Implementation tree updated for this pivot.
- [ ] README points to this handoff.
- [ ] No secrets committed.

### Gate B — deterministic CFD risk engine
- [ ] Pip-value calculation covered by tests.
- [ ] Risk-based lot sizing covered by tests.
- [ ] Min/max/step validation covered.
- [ ] Invalid risk/SL/lot inputs fail closed.
- [ ] Currency conversion path is explicit rather than silently assumed.

### Gate C — cTrader provider pack
- [ ] Descriptor registered.
- [ ] OAuth login URL generation implemented.
- [ ] OAuth callback exchanges code server-side.
- [ ] Access/refresh tokens stored through provider-secret references.
- [ ] Account discovery implemented.
- [ ] Practice account snapshot implemented.
- [ ] Instrument/symbol metadata implemented.
- [ ] Quote path implemented.
- [ ] Demo order path implemented.
- [ ] Position/order reconciliation implemented.
- [ ] SL/TP amendment implemented.
- [ ] Position close implemented.
- [ ] Provider errors normalized.
- [ ] Adapter tests pass without network access.

### Gate D — manual UI
- [ ] CFD mode is the default manual product when cTrader is selected.
- [ ] Multiplier is secondary/legacy.
- [ ] Manual ticket uses lot/risk semantics, not multiplier semantics.
- [ ] Entry uses provider Bid/Ask when cTrader is active.
- [ ] SL/TP appear on the chart.
- [ ] Open position maps to generic SHAFX TradeOrder.
- [ ] Live broker P/L is authoritative when available.
- [ ] Margin is shown.
- [ ] UI is responsive and SHAFX-original.

### Gate E — build/test/deploy
- [ ] `npm run build` passes.
- [ ] `npm run lint` passes.
- [ ] `npm test` passes.
- [ ] Render build passes.
- [ ] Render service is live after the final commit.
- [ ] Health endpoint responds.
- [ ] No new runtime/server error introduced by the new provider path.

### Gate F — real practice-account validation
- [ ] cTrader Open API application approved.
- [ ] Redirect URI configured.
- [ ] Deriv cTrader practice account available.
- [ ] SHAFX OAuth connect succeeds.
- [ ] Practice balance/account snapshot succeeds.
- [ ] Real cTrader symbol/volume metadata succeeds.
- [ ] Practice market order opens.
- [ ] SL/TP are attached or amended successfully.
- [ ] Position appears in SHAFX.
- [ ] P/L updates from broker data.
- [ ] Position close reconciles correctly.
- [ ] Restart/reconnect does not lose provider state.

### Gate G — live release
- [ ] All practice-account gates above are complete.
- [ ] Security review complete.
- [ ] Idempotency/reconciliation tested.
- [ ] Live external execution explicitly approved by the user.
- [ ] Only then may the live execution gate be changed.

## Change log — manual-CFD pivot

| Date | Change | Result / lesson |
|---|---|---|
| 2026-10-06 | Created this persistent handoff and changed the destination from Multiplier-first + bot-first to **SHAFX Manual CFD via Deriv cTrader**. | Bot is frozen until manual trading passes. No merge to `main`. |
| 2026-10-06 | Added `src/lib/cfdRiskEngine.ts` and risk-engine tests. | SHAFX now owns deterministic lot/risk math instead of Multiplier stake math for the new manual route. |
| 2026-10-06 | Added server-side cTrader OAuth/Open API gateway and provider adapter. | Client never receives cTrader client secret or OAuth token. Live execution remains disabled. |
| 2026-10-06 | Added cTrader account discovery across demo/live endpoints and fixed selected-account routing. | The provider session now follows the account the user actually selected instead of an empty connection default. |
| 2026-10-06 | Added SHAFX-native CFD manual ticket. | New UI uses BUY/SELL, risk-sized lots, SL/TP pips/prices, R:R and broker margin. It is not a Multiplier or cTrader clone. |
| 2026-10-06 | First Render builds failed on strict TypeScript checks. | Fixed optional leverage, null instrument access, unused imports, and provider close routing. These failures are retained here so future agents know what already happened. |
| 2026-10-06 | Latest Render build passed `tsc -b && vite build` and service reached **live**. | Live deployment commit: `a5b7577f657799e910371a4d1fe4ffe1db717a39`. |
| 2026-10-06 | Runtime verification boundary reached. | Render startup reached “SHAFX Render server listening on 0.0.0.0:10000” and service reported live. Direct external HTTP probing from this execution environment is DNS-blocked, so browser-style visual/runtime verification is still outstanding. |
| 2026-10-06 | External certification checkpoint. | **Not yet certified:** no confirmed SHAFX cTrader Open API client ID/secret/redirect URI has been exercised, and no real Deriv cTrader practice order has been opened/closed through SHAFX yet. |

## cTrader setup required before Gate F

The cTrader Open API application must be registered/approved outside SHAFX and configured on Render with:

- `CTRADER_CLIENT_ID`
- `CTRADER_CLIENT_SECRET`
- `CTRADER_REDIRECT_URI` = the exact deployed SHAFX callback route ending in `/api/providers/ctrader?op=callback`

Never commit these values to GitHub and never expose them as browser `VITE_*` variables.

After those are available, the next verification target is **cTrader practice only**:
connect → select demo account → quote/symbol metadata → margin → market order with SL/TP → broker P/L → close → restart/reconcile.


## Correction — why the old Multiplier UI was still visible

On 2026-10-06 the first manual-CFD implementation was correctly present in the branch but was incorrectly gated behind `providerSelection.providerId === 'ctrader'`. An existing stored Deriv selection therefore continued rendering the old Multiplier ticket.

This has now been corrected:

- **New/manual ticket default:** always renders the SHAFX CFD ticket.
- **cTrader connected:** the CFD ticket can quote, calculate margin, and place practice orders through cTrader.
- **cTrader not connected:** the CFD ticket remains visible and clearly asks the user to connect cTrader; the old stake/multiplier controls are not shown.
- **Existing open legacy Multiplier position:** its old Multiplier management panel remains intentionally available so SHAFX does not lose or misrepresent an already-open legacy product.
- React hook ordering was corrected so switching between a legacy open position and the new manual ticket does not create conditional-hook errors.
- Final corrective Render deployment: `3040dfc21b81474b2127e3e702ddf2501f3878e0` — **live** at 2026-10-06 11:01:12 UTC.
- Render build for this corrective commit passed `tsc -b && vite build`.

**User-facing result:** after a fresh page load, a normal manual-trading ticket should say **SHAFX CFD • manual** and use lots/risk/SL/TP/R:R—not Stake + Multiplier.


## Current checkpoint

**Status:** Manual CFD pivot is authorized and under implementation.

**Do next:** Complete Gate B and Gate C, then replace the manual ticket's default product path. Bot stays frozen during this phase.

**Known good baseline:** `8747186d5e5aaab35f32f42bcb7e04727a04ed45`.

**Do not merge to main.**



## Chart stability checkpoint — 2026-10-09

The reported problem remains chart/timeframe instability: candles and BUY/SELL, support/resistance, and liquidity levels can appear collapsed or disappear while changing intervals. Do not assume earlier price-line styling commits solved it.

Source-level issues identified:
1. Chart creation ran in passive `useEffect`, but initial series/data setup ran earlier in `useLayoutEffect`, so mount/remount could initialize an empty chart until another prop/data update.
2. Timeframe state changed separately from the selected cache snapshot, briefly allowing the previous interval's candles to be interpreted as the new interval.
3. Late live-feed callbacks were not rejected by timeframe/symbol identity, and candle snapshots were filtered before sorting.

A corrective patch is now on this experimental branch: layout-phase chart initialization, atomic timeframe/candle selection, stale callback rejection, OHLC snapshot normalization, and regression tests. It must not be reported fixed until CI, Render deployment/health, and authenticated visual timeframe testing pass.

TinyFish confirmed the public Render URL only shows the sign-in page without authentication; it could not test the chart. The existing TinyFish profile has no recorded SHAFX sign-in. Ask the user to authorize a sign-in setup session before performing authenticated browser QA; never request a password in chat.

Continue only on `test/rebuild-deriv-native-manual-20260930` / Render service `sharfx-deriv-render`. Do not merge to `main`, and do not deploy Cloudflare production.


### Chart-line cleanup correction — 2026-10-09

The chart component had two effects using the same price-line map and cleanup loop. The first reconciled structural annotations, user levels, alerts and trade levels; the second duplicated user/alert/trade handling but omitted structural annotations from its keep-set and therefore deleted support/resistance and liquidity after they were created. The redundant second reconciler has been removed. Verify the new commit through build/lint/tests and Render deployment, then test authenticated timeframe switches and line persistence before claiming the user-visible issue is fixed.


## Latest verification record — 2026-10-09

Chart patch deployed on Render: `653de2d6c7a9c6acfa1d93d87ba422dc18786dde`, deployment `dep-db4aneuq1p3s739rtdng` is live; Render smoke run `37907856663` passed. Build, static-server smoke and lint passed on CI. New candle-normalization test file passed 2/2.

Full CI remains failed only at `npm test` with two baseline failures that also existed at commit `099026a927e0873c7b56b7ce9be3eb3ce547bd9a`: cTrader order-status normalization and missing conversion in the CFD risk engine. Keep these tracked separately and do not change unrelated execution/risk logic as part of the chart task.

No authenticated chart interaction has been verified. TinyFish without a user-authorized sign-in sees only the public login page. Next required step: authorized browser session, then explicitly test timeframe cycling M1/M5/M15/M30/H1/H4/D1/W1 at desktop width, resize/zoom, and check candles plus structural/trade levels after each switch. This branch remains experimental; no merge to `main`/Cloudflare.


## Confirmed cTrader chart timestamp mismatch — 2026-10-09

A deeper provider-boundary inspection identified a concrete chart-collapse cause: the cTrader server converts `utcTimestampInMinutes` to Unix **milliseconds** (`minutes × 60 × 1000`), while SHAFX's Lightweight Charts component and all Deriv chart data use Unix **seconds**. The cTrader live quote bucketer also returned milliseconds, so live updates did not share the historical/chart time unit. Mixing these values can make the visible timeline span an enormous range and bunch candles together.

Repair committed on the experimental branch:
- Normalize cTrader historical candle timestamps to Unix seconds immediately after the provider response; validate, sort and deduplicate the bars before caching/charting.
- Return live timeframe buckets in Unix seconds (including W1's Monday-UTC start).
- Reject stale quote callbacks after a symbol/timeframe switch and prevent older buckets from being appended to the right edge.
- Add focused regression tests for milliseconds-to-seconds normalization, already-normalized timestamps, duplicate bars, and all timeframe bucket units.

Verification results on commit `91bc9a6419f2912f816210bcf45cdfd869172039` (2026-10-09):
- `npm run build`: passed in GitHub Actions and on Render.
- `npm run lint`: passed.
- `src/data/ctrader/CTraderLiveQuote.test.ts`: 3/3 regression tests passed.
- Render test smoke: passed. Render deployment `dep-db4ate9bgiqc738numk0` is live on `sharfx-deriv-render`.
- Full `npm test`: 300 passed, 2 failed across 73 test files. The remaining failures are the previously tracked, unrelated baseline failures: cTrader order-status normalization and CFD pip-value conversion when quote/account currencies differ. Do not change unrelated order execution or risk-engine logic in this chart fix.
- Authenticated visual timeframe testing remains blocked because TinyFish has no saved SHAFX sign-in and the public route shows only the login/registration page. Do not claim the user-visible chart is fixed until the signed-in chart is checked across M1/M5/M15/M30/H1/H4/D1/W1, with candle spacing and structural/trade-level persistence verified.

Do not merge to `main` or deploy Cloudflare production.


## Candle gap recovery, quote-line separation and trade map — 2026-10-09

- Scope remains restricted to `test/rebuild-deriv-native-manual-20260930` and Render service `sharfx-deriv-render`. No main/Cloudflare promotion, account-setting change, order placement, or intended trade action was performed for this task.
- **Candle gap cause:** cTrader quote polling used to suppress a repeated Bid/Ask even when the provider timestamp moved into a new minute. The live candle updater also creates only the next observed bucket, so a paused/delayed quote stream could skip intermediate timestamps. `src/data/ctrader/CTraderLiveQuote.ts` now emits on quiet minute boundaries and exports `shouldRepairCTraderHistoryForGap`. `src/App.tsx` detects a multi-bucket gap and refreshes real cTrader trendbars, merging them with live bars. It does not invent flat filler candles. Tests cover gap detection and repair only from broker-returned candles.
- **Chart price labels:** SELL/BID is red; BUY/ASK is green/teal. Those quote lines keep the price-axis labels; S/R/liquidity, drawing and trade lines carry their own titles/prices instead of competing for the same axis tags.
- **Trade arrows:** `src/components/chart/buildTradeChartMarkers.ts` maps an actual trade open time to the candle interval; BUY entry uses a teal up arrow, SELL entry a red down arrow, and closed trades can show a compact OUT result marker. Markers are not attached to unrelated candles when the correct time bucket is missing. `buildTradeChartMarkers.test.ts` covers entry/exit arrows, same-candle grouping and gaps. Current read-only browser QA did not observe any trade arrows in the loaded EUR/USD history, so actual marker visibility for a matching real history row remains an open visual acceptance item; do not create a trade just to test it.
- **React timeline crash:** React-rendered time-axis spans were replaced with an isolated timeline host whose timestamp nodes are updated imperatively. Commit `cb33c7f045ca03baa958cb576dbcb6f067fa7a70` (`fix: isolate live chart timeline labels from React reconciliation`) is live on Render. Read-only TinyFish QA watched live streaming for 25+ seconds and switched M1, M5, M15, M30, H1, H4, D1 and W1; no `insertBefore` error recurred and no obvious candle gaps or label collisions were visible. This is browser evidence, not a forced fault-injection test of a dropped provider quote.
- **Verification:** Render build/deploy succeeded. The latest GitHub test run shows 331 passed, 2 failed of 333. The failures are the same two existing unrelated expectations: `server/ctrader.test.js` order status expected `rejected` but got `filled`, and `src/lib/cfdRiskEngine.test.ts` expected `null` pip-value conversion but got `10`. The newly added candle-gap, marker, and provider-symbol tests passed in the run.
- **Remaining:** confirm trade markers appear when the selected symbol and candle-history window actually contain an execution time. Never place a trade to force a marker; use existing history data and keep browser inspection read-only around the trade panel.




## Chart line labels, quote overlap and MT5-style quote tint — 2026-10-09

Scope: still restricted to `test/rebuild-deriv-native-manual-20260930` and Render service `sharfx-deriv-render`. Do not merge to `main` / deploy Cloudflare production. No order was submitted or closed for this task; the browser check avoided trade/position controls.

Code commits:
- `31c1e5b0867fa5be37913a145c36880acf5165f1` — separate structural annotations, add price-line label overlays, make ticket quote numbers change tint according to real observed bid/ask direction, add tests.
- `a39c038138630860fe1f93d7e626183a9dbb49db` — remove an unused helper identified by the first failed TypeScript build.

Implementation:
- Production structural annotation building no longer merges nearby Support, Resistance, Buy-side Liquidity and Sell-side Liquidity into one annotation. Each retains its own identity.
- Chart chips show each line's meaning and actual price. Chips are stacked vertically when their price rows are too close to read; the underlying line prices are not altered to make space.
- A structural line is programmatically suppressed when it is within a small pixel threshold of a live Bid/Ask quote rail, then restored outside a wider threshold to avoid edge flicker. A natural quote crossing that visibly exercises this suppress/restore behavior was **not** observed during this browser window; do not record this edge case as visually verified yet.
- Ticket BUY and SELL remain selectable side controls. Their semantic styling stays green for BUY and red for SELL; the quote-number cells compare actual received quotes with the previous tick, tint green for an uptick and red for a downtick, then return to neutral after 15 seconds with no further direction change. No synthetic quotes are added.

Verification on the latest live app code commit `a39c038138630860fe1f93d7e626183a9dbb49db`:
- TypeScript + Vite production build: **passed** on Render; deployment `dep-db4k1j6gekts73fkvqa0` is live at `https://sharfx-deriv-render.onrender.com`.
- Lint: **passed** in GitHub Actions.
- New unit tests for quote tick direction (3/3) and structural quote-overlap predicate (3/3) passed. Independent structural line identities also passed.
- Full unit test suite: **338 passed, 2 failed of 340**. The same unrelated existing failures remain: cTrader order-status normalization expected `rejected` but got `filled`; CFD pip-value conversion test expected `null` but got `10`. Do not modify broker execution or risk-engine logic as part of this presentation patch.
- Read-only TinyFish browser review: workspace loaded with continuously updating EUR/USD quotes; all four structural labels and numeric prices were visible as separate tags, including Support and Sell-side Liquidity at a shared price. No runtime error was observed during the 25+ second watch. BUY appeared green, SELL red, and displayed quote values changed with live ticks. The review did not prove the quote-number tint alternated on each individual tick, and it did not observe an actual structural line hide/restore event; these remain visual acceptance checks, not claimed passes.
- The separate GitHub `Render test smoke` workflow failed because Playwright timed out waiting for `#root` to become visible (25 checks reported it hidden). Keep this red check visible in status; do not describe smoke as passing. The read-only interactive workspace inspection did load the chart, so diagnose the smoke/session behavior separately rather than changing authentication or environment settings in this chart task.



## Chart countdown, Watchlist reconciliation and trade-side polish — 2026-10-12

Scope remains **only** `test/rebuild-deriv-native-manual-20260930` and Render service `sharfx-deriv-render` at https://sharfx-deriv-render.onrender.com. Do not merge into `main`, change Cloudflare production, or alter sibling Render services/provider accounts. No trade actions were taken during these browser checks.

### Confirmed diagnostic result
- TinyFish's diagnostic build reproduced `NotFoundError: Failed to execute 'insertBefore' on 'Node'` during live quote updates while M5 was idle. Its React component stack pointed to the left-hand Watchlist row: `aside → Watchlist button → nested span`, not directly to the chart canvas. The first chart-label DOM cleanup alone did not stop the crash; that is now documented as an incomplete first hypothesis, not a claimed fix.
- `src/components/watchlist/Watchlist.tsx` commit `e4fcc43b13d5b47ffdd69c224a0bd39852690fc5` replaces the conditional TrendingUp/TrendingDown SVG subtree plus adjacent changing percentage text with one stable text child (`▲ / ▼ + percent`). On that deployment, TinyFish watched live quotes and left M5 idle for about **130 seconds**, switched M5 → H1 → M5, then returned to M5; no `insertBefore` error occurred and the Watchlist quotes continued updating. This is a successful time-bounded regression check, not a guarantee the defect can never recur.
- The chart's time-axis and price-label spans were also changed from imperative child insertion/removal to stable keyed React-rendered nodes in commit `d07dfb67551c4c397cb85738369c4e6702538852`. That change by itself did **not** resolve the error, but removes direct DOM mutation inside React-owned label hosts and remains in place.

### Countdown and ticket styling
- TinyFish checked the preceding Watchlist-stability build and read the chart's `CLOSE 3m 20s` display six times roughly one second apart; all readings were identical. That is recorded as a **failed live countdown check**.
- Commits `46c9bde934a8c2d7624172d3f39ad5316ffd8443` and `58ee1c945f6c537ea13caa2d62bfe3de63fe65f9` replace the market-timestamp-dependent display with a dedicated one-second clock and `src/components/chart/candleCountdown.ts`, which calculates countdown seconds from UTC timeframe boundaries. New helper tests cover M5 one-second decrementing, exact candle-boundary behavior, W1 Monday UTC rollover and invalid timestamps; all **4 new tests passed** in CI.
- The same follow-up raises CSS selector specificity for squared BUY/SELL tiles and uses matching square neutral-price cells. A prior visual check confirmed the white selection ring was absent, price text remained neutral, and each button followed its own real quote direction (BUY follows Ask, SELL follows Bid; both may be green or red). However, the last run also described rounded corners, and the final square-corner CSS override has **not** been visually rechecked.
- **Current Render deployment:** `dep-db6a93gae00c73aejea0` is **LIVE** on commit `58ee1c945f6c537ea13caa2d62bfe3de63fe65f9`; Render's TypeScript/Vite production build passed. GitHub CI build, Render static-server verification and lint passed. Test suite: **360 passed, 2 failed of 362**. The same pre-existing unrelated failures remain: `server/ctrader.test.js` order status expects `rejected` but receives `filled`; `src/lib/cfdRiskEngine.test.ts` expects quote-currency conversion `null` but receives `10`. The new countdown tests passed.
- **Remaining verification gap:** the TinyFish wallet was at `-$0.01` after the 130-second stability run, and the tool advised that the next live automation cannot start until credit is added. Therefore, the newest countdown and square-corner revision has **not** had a post-deploy browser check. Do not mark the visible countdown or final squared corners as visually verified until that check can be run. The ErrorBoundary still exposes the captured JavaScript/component stack only if the app error screen appears; retain it while the Watchlist fix receives further browser observation.
- **Safety/promotion:** the draft verification PR #58 remains **do not merge**. `main`, Cloudflare production, other Render projects, broker/account settings and trading positions remain untouched.


## Latest ticket/chart cleanup checkpoint — 2026-10-12

Scope is limited to `test/rebuild-deriv-native-manual-20260930` and Render service `sharfx-deriv-render`. Do not merge PR #58, `main`, or deploy Cloudflare production; do not modify sibling Render projects. No trades, account settings or provider settings were changed.

Implementation recorded for this pass:
- BUY/SELL cards use square dark graphite backgrounds; quote digits alone change color using MT5-style direction semantics: blue uptick (`#2F80FF`), red downtick (`#F04452`), light neutral until a tick is known or after 15 seconds without price movement/stale data. BUY follows Ask; SELL follows Bid. No artificial blinking.
- The cards are 70px minimum height; quote digits are 10px monospace so values stay visually secondary to the controls. Missing/stale values display an em dash and neutral waiting/offline state.
- The chart's duplicate top-right BUY/SELL price strip is removed. Native price-axis labels for these line overlays are hidden so only one custom BID tag and one custom ASK tag appear when current quotes are available.
- BID/ASK rails and tags hide while browsing historical candles and return when the viewport reaches the live edge. This leaves historical support/resistance/liquidity levels unobscured by current-price tags.
- cTrader app-header/chart quote values are only passed while the account/symbol/timeframe identity matches and the quote stream is fresh. A 15-second quote silence clears displayed live prices and reports WAITING rather than substituting a historical candle close.
- Ticket SL/TP sizing previews no longer create chart lines without an actual open position. Balance/equity/free margin use 2dp and the Equity panel calls out Floating P/L in larger text.

Verification:
- Render build/static server/lint passed for the code revision immediately before the final 10px quote-digit sizing adjustment; the code revision is deployed to `https://sharfx-deriv-render.onrender.com`. Check the latest Render deploy and CI after the sizing/handoff commit finishes.
- The last completed full unit suite on the preceding code revision showed 361 passed and the same two unrelated failures: `server/ctrader.test.js` expected order status `rejected` but received `filled`, and `src/lib/cfdRiskEngine.test.ts` expected conversion `null` but received `10`. The newest run was still in progress when these notes were prepared; update after it finishes.
- **Final browser visual acceptance is pending.** TinyFish credit was depleted after a previous ~130-second Watchlist stability check. Do not claim the newest colors, final digit sizing, no-duplicate tags, quote timeout or history-scrub behavior is visually verified until a fresh read-only browser check is possible. That prior timed run did show live quotes and M5→H1→M5 without reproducing the React insertBefore crash, but it was on an earlier visual revision.

Next: verify the final code build/lint/tests and Render status. When browser automation credit is available, confirm the fresh quote color sequence and neutral state; exactly one BID and ASK tag; live quote values go to WAITING after feed silence; current tags disappear when browsing history; no draft SL/TP lines appear without a position; and the Equity/Floating P/L layout is readable. Do not click trade controls during verification.


## Final verification status — 2026-10-12

This checkpoint is for the isolated experiment only. The latest application-code commit 48124ac477062fe361549c970e408274a85c1b3f is LIVE on Render deployment dep-db6arf7gfhjc73f86tl0 at https://sharfx-deriv-render.onrender.com.

Verification performed:
- Render production TypeScript/Vite build: PASSED.
- Render static-server startup/reference check: PASSED.
- GitHub Actions build, static-server verification and lint: PASSED.
- Full suite: 361 passed, 2 failed of 363. The two same existing unrelated failures are server/ctrader.test.js expecting rejected but getting filled, and src/lib/cfdRiskEngine.test.ts expecting null for quote-currency conversion but receiving 10. Four countdown helper tests passed; quote-color tests are included in the passing run.

Code state at the verified app commit:
- MT5-inspired quote numbers: blue on uptick, red on downtick, neutral when no movement for 15 seconds or when live quotes are not available; BUY tracks Ask and SELL tracks Bid.
- Dark square 70px BUY/SELL cards with 10px monospace digits; washed-out background fills removed.
- Duplicate top-right BUY/SELL banner removed; a single custom BID and ASK tag renders at the live quote rails, native duplicate quote/trade axis labels disabled.
- Live quote tags/rails are hidden while viewing historical candles and reappear near the latest candles, giving historical support/resistance/liquidity levels space.
- Chart/header price is gated by current matching stream identity and freshness; after 15 seconds without a quote packet, current values are cleared to WAITING rather than reusing a historical close.
- Unused ticket draft SL/TP lines hidden when no actual position is open; Account equity/balance/free margin display two decimals and Floating P/L is labeled/enlarged.

Important limitation: no fresh visual browser acceptance run was possible after this exact revision because TinyFish browser automation credit was depleted during the earlier 130-second Watchlist stability test. Therefore the final on-screen colors, number sizing, single BID/ASK tags, history-scroll behavior, 15-second stale state and account card layout are NOT marked visually verified. The earlier Watchlist stability test on a prior build ran about 130 seconds with active quote updates and M5-to-H1-to-M5 switching without reproducing the React insertBefore error; that is time-bounded prior-build evidence only.

Do not merge draft PR #58 or promote to main/Cloudflare. No orders were submitted/closed and no account/provider settings or sibling Render services were changed.


## Chart duplicate-label and floating-P/L correction — 2026-10-13

**Scope:** experimental branch `test/rebuild-deriv-native-manual-20260930`; Render service `sharfx-deriv-render` only. Do not merge to `main`, deploy Cloudflare production, or change either sibling Render test service.

**Source finding:** `src/components/chart/CandlestickChart.tsx` was rendering each `tradeLines` item twice at the price scale: Lightweight Charts' native axis tag was enabled while SHAFX also rendered its custom in-chart label. This affected entry/current-exit/SL/TP values and made identical prices look like stacked designs.

**Correction committed for verification:**
- Disable the native price-axis label for trade lines, matching the single custom-tag system already used by support/resistance/liquidity.
- Keep trade prices as actual lines; the custom in-chart labels display one price each.
- The entry line now displays `OPEN P/L +$x.xx` / `OPEN P/L −$x.xx` in the account currency, with positive/negative/neutral color based on the current position P/L. It displays a dash and neutral color when the broker hasn't supplied P/L rather than inventing zero.
- The live exit-price tag is presented neutrally as `LIVE PRICE`; BUY/SELL remains internal metadata for selecting Bid versus Ask and hiding the matching quote rail.
- Unit tests cover positive USD P/L, negative EUR P/L, missing P/L, current exit quote side, and closed-position suppression.

**Verification status:** awaiting the Render auto-deploy/build and focused unit-test result for this commit. Authenticated visual browser acceptance is still blocked by insufficient TinyFish automation-wallet credit; do not claim the new visual treatment or the user's existing trade has been visually verified. No orders were placed/closed; no provider credentials/account settings were changed.

## Chart quote-tag and collision polish — 2026-10-13

Scope remains the experimental branch `test/rebuild-deriv-native-manual-20260930` and Render service `sharfx-deriv-render` only. No trade actions, provider/account settings, sibling Render services, `main`, or Cloudflare production are touched.

- Replaced the generic “LIVE PRICE” tag with compact **BID** for the BUY exit (Bid) and **ASK** for the SELL exit (Ask), matching the existing quote-tag size.
- Fixed chart quote colors to blue for Bid and red for Ask. Active position exit lines use the same side colors rather than inheriting the floating-P/L green/red color. Quote rails and current-exit rails are dashed; SL remains dashed, TP is blue, and entry line stays neutral.
- The entry line now has a small centered `OPEN +$0.50 · 1.11913`-style tag (using the actual position profit and entry price). Its y coordinate is anchored to the fixed entry price and is excluded from right-edge label stacking so it does not jump when Ask/Bid tags move. P/L amount color still reflects positive/negative result, while the price-line itself stays neutral.
- Added quote-proximity suppression for trade entry/SL/TP levels as well as structural levels. These secondary lines and edge labels hide when within 7 chart pixels of a live quote and restore beyond a 12-pixel hysteresis threshold; the centered OPEN/P&L readout remains available even while its entry line is hidden. Current BID/ASK exit lines are exempt so the active exit remains visible.
- Fixed the existing cTrader ticket render-purity lint error by deriving quote age from the state-backed clock, synchronized on receipt and on the one-second clock. No order logic changed.

Verification notes: code/build/tests must be checked for this commit. Authenticated visual inspection still requires a signed-in browser; the previous attempt could not start because TinyFish browser automation credit was exhausted. Do not claim visual acceptance until the account's existing position has been inspected without opening or closing trades. Keep PR #58 experimental; do not merge into `main` or promote Cloudflare.


## Next chart pass — 2026-10-13 (mobile screenshot follow-up)

- The user confirmed the open position is the same trade previously shown by the green `BUY 0.02` candle marker and `OPEN +$...` entry line.
- The entry arrow was misleading because chart markers sit above/below candles, not at exact execution prices. Open trades now use exact entry/P&L and SL/TP price lines; closed historical entries retain arrows.
- While an open matching position exists, hide auto-generated support/resistance/liquidity from the chart itself so entry, SL, TP, Bid and Ask get first priority. Keep analysis panels available; never alter broker prices.
- Keep the live candle at the right edge when following real-time. Recent small intraday history holes should request cTrader history backfill, never synthetic OHLC.
- User screenshot acceptance is still required after deployment. No trade placement/closure or provider-account mutation; don't touch sibling Render services, main, or Cloudflare production.


## Chart history, Trend toggle and manual-ticket clarity — 2026-10-13

Scope remains the experimental branch `test/rebuild-deriv-native-manual-20260930` and the Render service **Shafek Derive Render** only. No trade was opened or closed, no broker-side protection was modified, and no sibling Render service, `main`, or Cloudflare production was targeted.

- Candle autoscaling no longer expands to distant SL/TP prices; broker entry/SL/TP prices remain unchanged as overlays with true-price labels.
- Live quote ticks no longer trigger an unnecessary scroll to the newest candle. Historical viewport restoration prefers the actual time range over logical bar indexes. Dynamic trade/structure lines and edge labels hide while browsing history; timestamp-mapped trade markers stay on their candles.
- Added a **Trend** toggle for support, resistance and liquidity, with on-demand recomputation from latest cached candle data; normal candle updates continue to refresh analysis. Detailed chart tools remain in the adjacent drawer.
- Manual cTrader risk/lot and pip-distance fields start blank with visible editing affordances and **AUTO / EDIT** stop/target controls. A plan-review checkbox explicitly gates the practice BUY/SELL action; order mechanics and broker protection values are unchanged.

Verification remains pending. Run lint, build and tests; verify only the correct Render service and inspect the existing open position in an authenticated session without placing or closing any trade. Keep changes on the experiment until visual acceptance; do not merge into `main` or promote Cloudflare.


## Trend header placement and ticket follow-up — 2026-10-13

Follow-up remains on the experimental branch `test/rebuild-deriv-native-manual-20260930` and Render service **Shafek Derive Render** only. The green `cTrader LIVE` badge is removed from the chart header; the Trend ON/OFF switch for support, resistance and liquidity now occupies that location. The misplaced separate Trend row is removed and the mobile Chart tools row is restored. The Deriv live-feed component remains mounted for Deriv mode.

Manual ticket: BUY and SELL price tiles use one midpoint direction and complementary colors together (baseline BUY blue / SELL red; on downward ticks colors swap; they cannot both be blue or both red). Stop/Target AUTO controls are always tappable: use distance from a valid selected AI setup or defaults of 10/20 pips until one is loaded; EDIT returns to editable pip inputs. The separate review checkbox is removed. The final BUY/SELL button activates when a cTrader demo connection, fresh quotes, size input and protection distances form a valid plan; users still make an explicit final BUY/SELL tap, and selecting a side alone does not submit an order.

No broker-side protection has been changed, and no trade has been opened or closed. Verification pending.

## Risk-scaled AUTO distances and focused chart overlays — 2026-10-13

Follow-up remains on `fix/auto-risk-chart-overlay-dedup-20261013` until verification. AUTO stop/target distances now scale from a 10 account-currency-unit reference: baseline defaults are 10/20 pips at 10 units; $2 yields 2/4 pips and $4 yields 4/8 pips. When a selected setup exists, its stop/target distance ratio is preserved while both distances scale to the entered risk amount. EDIT remains manual. This only changes SHAFX's planned levels and sizing preview until the user explicitly places an order.

The chart now draws live entry/current/SL/TP lines from the selected/latest matching open position only. In cTrader mode it no longer adds the manual ticket's local line set on top of the broker-position line set. Other open positions remain in the trade list/account state; this chart simplification does not amend or close any broker position. Trend overlays continue to yield to nearby quote and trade-protection levels. Validate helper unit tests, build/lint, and deployment only on **Shafek Derive Render**. Do not promote to main or Cloudflare until visual acceptance.

## cTrader protection, all-open-trade chart lines, and price-scale labels — 2026-10-14

Work is isolated on `fix/ctrader-protection-all-trades-axis-labels-20261014` pending build verification. Only cTrader DEMO execution is available; no trade was opened, closed, or amended during this code change.

- cTrader MARKET requests now include relative stop-loss / take-profit distances encoded in 1/100000 price units, instead of relying on a second SL/TP amend request. The API verifies the resulting broker position levels relative to its fill price; if the execution response lacks protection values, it retries a few short reconciliations and returns the actual broker mismatch details when verification fails.
- A fresh cached-margin result still blocks an obviously oversized order, but a cold cache no longer delays the current market order with a separate margin round-trip. The margin cache is warmed after submission; cTrader remains authoritative about execution margin.
- AUTO uses the cTrader-reported protection minimum, converted from either points or percentage. EDIT distances below a known broker minimum are rejected before submission.
- The chart now renders every open broker position on the selected instrument. Each entry has an `OPEN + P/L` label in the plot area and a numeric price tag on the right axis. SL/TP labels likewise retain their text in the plot area while their prices appear in boxed axis tags. Identical SL/TP levels are merged with a trade count, and BID/ASK remain shared market labels rather than one per trade. Broker-reported protection prices take precedence over planned fallbacks.

Next: verify branch tests/build and deploy only to **Shafek Derive Render** after passing the build. Visually inspect the authenticated UI and current practice account without placing or closing any trade. Do not merge to `main` or promote Cloudflare production.


## Open-position entry marker and timestamp correction — 2026-10-14

Scope stays on `test/rebuild-deriv-native-manual-20260930` and the Render service **Shafek Derive Render** only. No broker orders were placed/closed/amended, and no sibling Render service, `main`, or Cloudflare production was targeted.

- Open positions now have dedicated chart badges anchored to both their recorded entry time and exact entry price. BUY markers use teal/up arrows; SELL markers use red/down arrows and each label includes lot size and exact entry price.
- Badges recompute on chart zoom/pan, timeframe/data changes, price-axis scaling and viewport resize. Completed-trade history markers remain separate, preventing a duplicate native open arrow.
- Open entry time parsing now normalizes epoch seconds, milliseconds and microseconds before ISO conversion. If a cTrader account poll omits the open timestamp, SHAFX preserves the previously known timestamp instead of moving the marker to the poll time.
- If cTrader candle history has a single missing timeframe bucket, an open marker may attach to the nearest real candle only within one timeframe interval and within the loaded history window. It never fabricates OHLC and never pins an old trade to a recent unrelated candle.

Verification still required after Render deploy: lint/build and focused marker tests must pass. In the authenticated chart, confirm both open positions (one BUY and one SELL if that's what the broker reports) are present, the badges move with zoom/pan and are anchored to the recorded price/time, and no trade values are changed. Keep the branch experimental; do not merge to `main` or promote Cloudflare.


## Open-position marker label cleanup — 2026-10-14

On the experimental branch `test/rebuild-deriv-native-manual-20260930` and the Render service **Shafek Derive Render** only, the persistent open-entry marker label now shows the side and lot size (for example, `BUY 0.10` or `SELL 0.10`) without repeating the price in the label. The marker still uses the true entry price internally for its vertical coordinate, preserving correct price anchoring during zoom/pan. No broker order or position was changed. Do not merge to `main` or promote to Cloudflare.

## Source-aware multi-timeframe chart scan — 2026-10-14

- Trend annotations now use candle histories per source timeframe rather than treating the selected interval as the only structural context. The scanner labels each level with its source timeframe so the trader can tell an H1 level from H4 or D1.
- Context policy: M1 shows M1/M5/H1; M5 shows M5/H1/H4; M15 shows M15/H1/H4; M30 shows M30/H4/D1; H1 shows H1/H4/D1; H4 shows H4/D1/W1; D1 shows D1/W1; W1 shows W1 only. This is deliberately top-down: lower-timeframe structure never gets painted onto a higher-timeframe chart.
- Clicking Trend triggers a fresh render from the selected symbol's timeframe caches. Deriv history warming and cTrader's background interval warmer now bump the scan version when new history arrives, so the visible source-aware levels refresh after cached history finishes loading. A timeframe switch recalculates the source set for the new chart.
- Added unit tests for the M5/H4/W1 hierarchy and missing history. This is an analysis-only chart change; it does not open, modify, or close trades. Scope remains this experimental branch and Render service **Shafek Derive Render**. Do not merge to main or promote Cloudflare before CI and live QA pass.

## Structural chart clutter reduction — 2026-10-14

- Root cause: the source-aware scanner was emitting separate support, resistance, buy-side liquidity, and sell-side liquidity lines from up to three timeframes at once. That made lower timeframes especially busy (up to 12 individual candidates before accounting for duplicates).
- Correction: cluster levels within a small symbol-aware price tolerance, merge nearby cross-timeframe concepts into one zone, label that zone compactly (examples: `H4 RES · H1 BSL`, `D1/H4 SUP · H1 SSL`), favor near-price zones with higher-timeframe/confluence weighting, and cap output at **two zones above + two below current price**. Each combined zone is a single plotted line, with compact timeframes/concepts in its label.
- The chart's label renderer now preserves these source-aware labels instead of expanding every combined zone back into long generic labels. Source timeframes remain governed by the hierarchy above, so lower-timeframe noise is never added to a higher-timeframe view.
- Regression coverage includes compact cross-timeframe confluence, no lower-timeframe labels on H4/W1, at most four zones per chart, missing-history handling, and the timeframe hierarchy. Build, static-server smoke, lint, unit tests, dependency audit, and Render rebuild-service verification passed on commit `6002849db490b6a645774a49ccb60316d64be7d2`; Render service **Shafek Derive Render** is live on that commit. Authenticated visual review has not been performed; ask the user to confirm the chart is visually clean after refresh. No broker orders/positions were touched; no promotion to `main` or Cloudflare.


## Structural overlay isolation / Trend toggle — final verification checkpoint, 2026-10-14

- Latest branch commit: `15952361fa48dd401d5dfc42c0ac6b9a85253748` — [commit](https://github.com/S35213/Sharfx/commit/15952361fa48dd401d5dfc42c0ac6b9a85253748).
- Render service **Shafek Derive Render** (`srv-dav8hrt9fdbs73d690s0`) is live on deployment `dep-db7la5qjnfac73de3c2g`.
- Verification: production build passed; static server check passed; lint passed; **82 test files / 399 tests passed**; production dependency audit reported 0 vulnerabilities; Render smoke and manual CFD branch verification passed.
- Structural annotations show the selected timeframe when zoomed in; higher-timeframe context is added only when the user zooms out. A weekly chart cannot import lower-timeframe structure; cached candle histories are validated by observed timestamp cadence. Zone IDs include source timeframe, concept, and price to avoid map/label collisions.
- Trend is controlled by an explicit chart-level structural-overlay gate. Turning it off removes support/resistance/liquidity lines and labels while preserving broker-confirmed entry, SL/TP and Bid/Ask overlays.
- Authenticated visual review of the user's live session has not been independently performed. Please refresh the Render chart and check zoom/toggle behavior on the actual session; if anything remains, record that specific state for a targeted follow-up.
- No broker-side protection was changed; no trade was opened or closed. All changes remain on the experimental branch. Do not merge to `main` or promote Cloudflare production without acceptance.


## Signal Bot provider isolation and independent-bot boundary — 2026-10-14

- Scope: only `test/rebuild-deriv-native-manual-20260930` and Render service `sharfx-deriv-render`. `main`, Cloudflare production, sibling Render services, provider credentials and broker positions were not changed.
- `src/engine/bot/useSignalBotMarketData.ts` owns the Signal Bot's history loop. It refreshes on a non-overlapping 15-second cadence and uses only the explicitly selected source: cTrader account history for cTrader, or Deriv public history when Deriv is selected. It refuses to silently substitute another provider.
- Scanner histories are scoped by symbol, provider, connection, account and demo/live environment. Late responses from a previous source are ignored; per-timeframe failures produce a partial/error state rather than fabricated candles.
- `SignalDeskPanel.tsx` is now scanner-only. It no longer mounts `BotUnitPanel` or consumes a paper-trading bot's runtime output. The Signal Bot is read-only; a candidate can only be sent to Manual Trade after the user explicitly clicks Review. The component has its own error boundary.
- Added `src/engine/bot/useSignalBotMarketData.test.ts` for source/account/environment key isolation, stale-history rejection and unsupported-provider behavior.
- Build correction record: initial commit `f359c1b29cd76fe194fe1bf95f32960b4c499d22` failed TypeScript because provider identity fields were not narrowed inside async workers. Follow-up commit `37c283f8af1717e7836f19fabffe98c2c820fa77` snapshots the validated values and is **LIVE** on Render deployment `dep-db7sublg1s2s73ekcheg`.
- Verification on commit `37c283f8af1717e7836f19fabffe98c2c820fa77`: GitHub SHAFX CI run `38618721850` passed build, static-server check, lint, all **402 tests across 83 files**, production dependency audit (0 vulnerabilities), and Render verification. Manual-CFD verification run `38618716899` also passed. Lint had 0 errors and 63 warnings.
- Acceptance still needed: a visual check in the authenticated Render session has not been independently performed. Verify that scanner history loads for the selected provider and that a scanner error does not disrupt the rest of the workspace.
- Next phase: create a separate Trade Bot component/controller with its own market-data loader, analysis loop, state, risk gate and position reconciliation. It must **not** consume the Signal Bot's output or lifecycle. Reuse only stateless analysis/risk utilities where appropriate. Keep bot broker execution disabled until cTrader practice-account gates are passed; do not merge into `main` or promote Cloudflare without explicit approval.


## Trade Bot independent analysis baseline — 2026-10-15

- Scope: experimental branch \`test/rebuild-deriv-native-manual-20260930\`; target Render service is **Shafek Derive Render** only. Do not merge to \`main\`, promote Cloudflare, or use sibling Render services.
- Added \`src/engine/bot/useTradeBotMarketData.ts\`: a separate opt-in 15-second candle refresh loop, source-keyed by symbol/provider/connection/account/environment, cTrader practice-only, with no provider fallback. It does not consume Signal Bot runtime data.
- Added \`src/engine/bot/tradeBotDecision.ts\`: independent structure/liquidity and higher-timeframe decision path, using the existing stateless CFD risk calculator. Risk ceiling is the lower of 0.5% of account balance or 10 account-currency units. A setup score is not represented as win probability.
- Added \`src/components/ai/TradeBotPanel.tsx\` and mounted it beside Signal Bot in the desktop and mobile Bots dock. Each panel has its own \`ErrorBoundary\`; the Trade Bot starts stopped and requires a user click to start analysis.
- Added \`src/engine/bot/tradeBotDecision.test.ts\` covering source isolation, live-account/unsupported-provider refusal, risk ceiling and missing-candle behavior.
- Execution is **not implemented/enabled** in this baseline. A READY setup is only a candidate; the existing manual ticket must refresh a broker quote and run its own risk checks. No automatic order was placed, and no broker position was modified.
- Verification on commit \`540efb26a98c2fb9c4f0fe43148af56994abb996\`: SHAFX CI, manual CFD verification, visual preview and Render smoke workflows passed. Unit tests: **84 test files / 407 tests passed**; production build passed; lint had 0 errors and 64 warnings; production dependency audit reported 0 vulnerabilities. Desktop/mobile screenshot artifact: https://github.com/S35213/Sharfx/actions/runs/38640962379.
- Follow-up commit \`4a3f3e99a39eb6ee2ff55d5e09ead2e6084e1f71\` removes one remaining hook dependency warning; its CI was still pending at the time of this note. Do not mark that cleanup verified until the run completes.
- Render deployment caveat: the latest Render deploy record still points to commit \`746a34668aba7671713d151a6a827629e2f4e1de\`; no deployment of the new Trade Bot commit has been confirmed. A green Render health/smoke check alone does not prove that the new source is live. Do not claim this UI is live until a deploy for the relevant commit is confirmed.
- Repository-scope correction: an omitted branch argument briefly created \`src/engine/bot/useTradeBotMarketData.ts\` on \`main\` (commit \`3906c629bf063ef71576b66e455ef6c55afe5a97\`). The file was deleted immediately in \`1047198beceedeea281393be5be0bdd72e937811\`; the file tree is restored, but the add/delete commits remain in \`main\` history. Do not make any further \`main\` changes.
- Next: finish the latest warning-cleanup verification, inspect the generated desktop/mobile previews, then implement a separate demo-only execution controller with fresh-quote checks, idempotency, broker-side SL/TP confirmation and authoritative position reconciliation. Keep live execution disabled until those practice tests pass.


## Trade Bot broker-spec provenance gate — 2026-10-15

- **Vibe-Trading review:** its market-data loader uses explicit OHLC validation, and `agent/backtest/binance_account_reconciliation.py` models broker observations as immutable evidence with deterministic drift findings. SHAFX is not importing the Python trading platform; this change applies the same fail-closed contract principle to its TypeScript Trade Bot.
- **Code finding:** `src/App.tsx` initialized the workspace `symbolSpec` from `src/data/mock/symbols.ts`, then passed that same mock/default spec into `TradeBotPanel`. The cTrader quote listener received the provider's `CTraderLiveInstrument` but discarded it as `_nextInstrument`. That meant Trade Bot risk sizing could use assumed contract size, pip size, and lot limits rather than the selected broker instrument.
- **Change on this branch:** new `src/engine/bot/ctraderInstrumentSpec.ts` converts only matching, tradable, complete cTrader metadata into a `SymbolSpec`. The Trade Bot receives that broker-scoped spec only; if metadata is missing, mismatched, incomplete, or not suitable for the canonical base/quote form, its decision is `BLOCKED` and risk sizing does not proceed. Added focused unit tests for valid EUR/USD and XAU/USD specs, mismatches, non-tradable instruments, missing/invalid contract fields, and unsupported symbol forms.
- **Scope:** changes are limited to the Trade Bot inputs, decision gate, tests, and handoff notes. The manual `OrderPanel`, its order handlers, cTrader server API, provider credentials/settings, Render services, `main`, and Cloudflare production are not changed by this patch. No orders are placed or modified.
- **Limitations retained:** cTrader instrument metadata alone does not provide a currency conversion quote. The existing risk engine still fails closed when quote-to-account conversion is required but missing; do not interpret the new gate as resolving every symbol's conversion/margin model.
- **Verification (commit `c718be6b5ec08726b56f32cbb36935e76c0a647f`):** GitHub CI run [38708972154](https://github.com/S35213/Sharfx/actions/runs/38708972154) passed; build passed; lint finished with 0 errors and 63 warnings; unit suite passed **85 test files / 420 tests**; production dependency audit reported **0 vulnerabilities**. Manual CFD verification [38708966653](https://github.com/S35213/Sharfx/actions/runs/38708966653), desktop/mobile preview [38708966622](https://github.com/S35213/Sharfx/actions/runs/38708966622), and Render smoke [38708966874](https://github.com/S35213/Sharfx/actions/runs/38708966874) all passed. The install output separately listed 11 vulnerabilities (2 moderate, 9 high) in the installed dependency tree; this was not the production-only audit result and warrants a separate full dependency/dev-tool audit.
- **Visual inspection boundary:** generated 1440×1000 desktop and 390×1346 mobile preview PNGs were opened and inspected. They are unauthenticated automated preview captures, not post-deployment cTrader end-to-end screenshots. The mobile full-page capture shows the fixed bottom navigation over part of the long chart capture; verify that separately at a real viewport before changing layout. No order action was triggered.
- **Render deployment:** the actual `Shafek Derive Render` service (`srv-dav8hrt9fdbs73d690s0`) auto-deployed this code commit as deployment `dep-db89995g1s2s73fbqmh0`, status `live`, finished at `2026-10-15T08:54:51Z`. The Render smoke test is separate from this deploy record. This confirms the commit is deployed, not that authenticated live-chart/broker behaviour has passed browser QA.


## cTrader position snapshot reconciliation — 2026-10-15

- **Root cause:** the cTrader reconcile effect accepted a successful response with a `positions` array, but returned before updating state when every parsed position was absent. A valid empty broker snapshot therefore left stale local open positions visible indefinitely.
- **Fix on this branch:** `src/engine/bot/reconcileCTraderPositionList.ts` now applies a successful empty snapshot; stale positions for that specific cTrader connection/account are removed while unmatched local positions opened within the existing 120-second submission grace window remain temporarily visible. Positions belonging to other providers/accounts remain separate. Position IDs and the symbol/entry-price fallback are scoped to the selected cTrader account.
- **Regression coverage:** `src/engine/bot/reconcileCTraderPositionList.test.ts` covers empty snapshots, grace-window positions, broker-ID merge without duplication, cross-account ID isolation, ambiguous symbol/entry matches, missing source identity, and invalid clocks.
- **Verification for code commit `279d0263b175c283cd9222960e39c966d2324511`:** CI [38709895268](https://github.com/S35213/Sharfx/actions/runs/38709895268), manual CFD verification [38709889976](https://github.com/S35213/Sharfx/actions/runs/38709889976), visual preview [38709889797](https://github.com/S35213/Sharfx/actions/runs/38709889797), and Render smoke [38709889784](https://github.com/S35213/Sharfx/actions/runs/38709889784) all passed. Build passed; lint had 0 errors / 63 warnings; **86 test files / 425 tests** passed; production-only dependency audit reported 0 vulnerabilities.
- **Current deployment:** actual `Shafek Derive Render` deployment `dep-db89cqdbedkc739udbs0` is `live` for commit `279d0263b175c283cd9222960e39c966d2324511`, finished at `2026-10-15T09:03:00Z`.
- **Not claimed:** this is current open-position snapshot reconciliation, not closed-trade history backfill. Missing historical trade records need a separately implemented/tested history endpoint reconciliation. The workspace has not been verified against a live authenticated cTrader browser session as part of this CI.
- **Dependency audit caveat:** CI's install output still listed 11 vulnerabilities in the installed tree (2 moderate, 9 high), while the production-only audit returned 0. Do a separate full/dev dependency audit before changing dependency versions.


## Malformed cTrader position snapshot guard — 2026-10-15

- **Additional safety condition:** an empty normalized list is only authoritative when the original provider array was also empty. If any reported row fails normalization (`normalized count !== reported count`), SHAFX retains the last known state rather than accidentally clearing positions due to malformed provider data.
- **Tests:** `isCompleteCTraderPositionSnapshot` covers a valid empty array, a non-empty array with a row that failed normalization, and a fully normalized non-empty snapshot.
- **Final verified code commit:** `f4b770bb7ea402be243121123e6d2205ece16862`. CI [38710527522](https://github.com/S35213/Sharfx/actions/runs/38710527522), manual CFD verification [38710522150](https://github.com/S35213/Sharfx/actions/runs/38710522150), visual preview [38710522170](https://github.com/S35213/Sharfx/actions/runs/38710522170), and Render smoke [38710522263](https://github.com/S35213/Sharfx/actions/runs/38710522263) all passed. Production build passed; lint 0 errors / 63 warnings; **86 test files / 428 tests** passed; production-only audit found 0 vulnerabilities.
- **Render:** `Shafek Derive Render` deployment `dep-db89f85g1s2s73fc1ph0` is `live` for `f4b770bb7ea402be243121123e6d2205ece16862`, finished at `2026-10-15T09:07:44Z`.
- **Intermediate verification note:** commit `ae904bfc48e0280b6b1d7b93d9b156693c830140` failed build due to a malformed import in the first guard edit; the import was corrected in `f4b770bb7ea402be243121123e6d2205ece16862`, and the corrected commit passed all four workflows. The intermediate failed deployment is not live.
- **Scope/limitations:** only current open-position reconciliation is covered; closed-trade history backfill and authenticated cTrader browser QA remain separate work. Installed-tree audit continues to show 11 vulnerabilities (2 moderate, 9 high) despite the production-only audit reporting zero.


## cTrader closed-trade journal reconciliation — 2026-10-15

- **Research reference:** reviewed [HKUDS/Vibe-Trading](https://github.com/HKUDS/Vibe-Trading), especially its read-only Binance account reconciliation module. The transferable rule is that external account observations are validated evidence and must not silently mutate or trigger trading actions; its Binance-specific Python model is not copied into SHAFX.
- **Baseline trace:** SHAFX already exposes `action: 'history'` in `api/providers/ctrader.js` and normalizes cTrader deal records. `src/App.tsx` polls it every 30 seconds, but previously replaced the entire shared `tradeHistory` state with that one account's response. That could erase Deriv/other-account journal rows and remove a locally confirmed cTrader close if the broker history read had not surfaced it yet.
- **Change on this branch:** added `src/engine/bot/reconcileCTraderTradeHistory.ts`. A valid cTrader row for the selected connection/account refreshes the matching position ID and broker P/L/timestamps. Unmatched local closed rows are retained, repeated snapshots are idempotent, client-only chart timeframe context is preserved, and non-selected providers/accounts are not overwritten. Malformed, non-closed, invalid-price/time, and out-of-scope rows are ignored. The merge is read-only and makes no broker calls that execute or change trades.
- **Regression coverage:** new `src/engine/bot/reconcileCTraderTradeHistory.test.ts` covers authoritative row updates, retention while broker history lags, account/provider ID isolation, duplicate/repeated snapshots, invalid payload rows, and newest-first sorting.
- **Verification for corrected code commit `940db5240bfe91fc573341c7f78ee6ac30eeef64`:** SHAFX CI run [38751123017](https://github.com/S35213/Sharfx/actions/runs/38751123017) passed build, static-server check, lint, test suite, production dependency audit, and Render rebuild-service verification. **87 test files / 434 tests passed**, lint 0 errors / 63 warnings, production-only dependency audit 0 vulnerabilities. Manual CFD verification [38751109921](https://github.com/S35213/Sharfx/actions/runs/38751109921), visual preview [38751109466](https://github.com/S35213/Sharfx/actions/runs/38751109466), and Render smoke [38751109827](https://github.com/S35213/Sharfx/actions/runs/38751109827) passed. Target **Shafek Derive Render** deployment `dep-db8e475bedkc73a4ol20` is LIVE for the corrected commit (finished 2026-10-15 14:25:23 UTC). Installed-tree audit still reports 11 vulnerabilities (2 moderate, 9 high); the passing CI audit is production-only. No authenticated cTrader history browser session was exercised; no orders/positions were opened, amended, or closed by this change.
- **Next bot task:** after this reconciliation gate passes, inspect the Trade Bot analysis loop and add persistent, source-scoped decision diagnostics (input candle timestamps, broker-spec identity, risk-gate result, and explicit READY/BLOCKED reasons). Keep auto-execution disabled until its separate cTrader practice-account certification is complete.


### Build correction record — cTrader history merge (2026-10-15)

- First implementation commit `fd6efb020f1af2560d368654d118b76c42e52bb1` correctly triggered CI and the intended Render service, but the Render TypeScript build failed at `src/App.tsx`: TypeScript did not retain the optional `payload.history` property narrowing inside the React state-updater callback.
- Correction: copy the checked property into `historySnapshot`, verify that local is an array, and pass that narrowed snapshot into the reconciler. This is a compile-safety correction only; merge behavior and order/execution boundaries are unchanged.
- Status: awaiting new CI and Render deployment results for the correction commit. The prior successful deployment remains the live build until a new deployment completes.


### Closed-history merge verification — 2026-10-15

- Corrected code commit: `940db5240bfe91fc573341c7f78ee6ac30eeef64`. CI: 87 test files / 434 tests passed; production build + Render static-server check passed; lint 0 errors / 63 warnings; production-only audit 0 vulnerabilities.
- Manual CFD branch verification, isolated desktop/mobile visual preview and Render smoke passed. The target service is live on deployment `dep-db8e475bedkc73a4ol20`.
- First code commit `fd6efb020f1af2560d368654d118b76c42e52bb1` failed the build due to TypeScript optional-property narrowing inside a state-update callback. Capturing the validated history array in a local constant fixed it in `940db524...`. The failed deployment did not become live.
- Remaining boundary: no authenticated end-to-end inspection of this user's real cTrader history was run. The fix is verified in build/unit/deploy pipelines, not broker-account acceptance.


## Trade Bot decision diagnostics — 2026-10-15

- **Research source:** revisited [HKUDS/Vibe-Trading](https://github.com/HKUDS/Vibe-Trading). We are adapting the separation of decision state from execution, explicit per-gate outcomes, and account-scoped observations. Its Binance/Python trading implementation is not a drop-in for SHAFX's TypeScript/cTrader provider.
- **Code added:** `src/engine/bot/tradeBotDiagnostics.ts` builds a read-only snapshot of the selected source, timeframe candle count/time/close, loaded higher-timeframe bars, market refresh age, broker-spec fields, account validity, the Trade Bot's existing decision reason, higher-timeframe bias, calculated lot size, estimated stop/target, risk budget and risk/reward gate outcomes.
- **UI added:** `src/components/ai/TradeBotPanel.tsx` now contains a collapsed **Decision diagnostics** section with PASS/HOLD details for each gate. It shows account/connection IDs only in shortened form.
- **Boundary:** diagnostics are informational and cannot submit, modify, or close a trade. The bot still starts only when the user presses Start analysis; a READY signal remains a manual-review candidate, not an order. Automatic execution remains disabled. The existing cTrader manual-ticket path and API live-execution release boundary were not changed.
- **Regression tests:** `src/engine/bot/tradeBotDiagnostics.test.ts` checks READY-for-review, live-account blocking, insufficient/stale data, missing/mismatched broker metadata, candle timestamps/timeframe counts/risk values, and risk/RR failures.
- **Verification for code commit `76b2ceae913a8e7eb975171ea7b22c23b72dfb3f`:** CI [38752221549](https://github.com/S35213/Sharfx/actions/runs/38752221549) passed build, static-server check, lint, all tests, production dependency audit and Render rebuild verification. Manual CFD [38752210604](https://github.com/S35213/Sharfx/actions/runs/38752210604), visual preview [38752210416](https://github.com/S35213/Sharfx/actions/runs/38752210416), and Render smoke [38752210603](https://github.com/S35213/Sharfx/actions/runs/38752210603) passed. Deployment `dep-db8e7c9j1v4c739rv500` is live on the designated **Shafek Derive Render** service (finished 2026-10-15 14:33:00 UTC). Build and lint passed; lint remains at 0 errors / 63 warnings; production-only dependency audit remains 0 vulnerabilities. The newly added diagnostic test file adds six regression cases to the prior 87-file / 434-test checkpoint.
- **Visual caveat:** the preview workflow passed and its desktop/mobile images were inspected, but those captures show the default workspace rather than opening the Bot tab. Do not call the new diagnostics panel visually accepted until the actual Bot tab is inspected directly.
- **Still outstanding:** authenticated cTrader account/browser QA; inspect the diagnostics panel visually within the Bot tab; full installed-tree audit still lists 11 vulnerabilities (2 moderate, 9 high). Do not merge into `main` or promote Cloudflare production without explicit user approval.
- **Next bot task:** add a small bounded decision-cycle trace so repeated 15-second analysis refreshes can be compared by timeframe/candle and reasons, without introducing order execution or storing broker credentials.


## Bounded Trade Bot decision-cycle trace — 2026-10-15

- **Code added:** `src/engine/bot/tradeBotDecisionTrace.ts` creates a read-only cycle entry containing source scope, symbol, timeframe, market-refresh time, last candle identity, decision status/reason, higher-timeframe bias, candle count, risk budget, lots, estimated loss, risk/reward and a compact identity derived from broker-spec fields.
- **UI added:** `src/components/ai/TradeBotPanel.tsx` records recent cycles while analysis is running, deduplicates repeated effect executions, bounds the in-memory trace to 12 entries, and displays the latest six for the selected account/market/timeframe in the Decision diagnostics section. The trace is volatile UI state and clears on page reload; it stores no credentials.
- **Tests:** `src/engine/bot/tradeBotDecisionTrace.test.ts` covers capture of decision values, rejection of missing source/timestamps, repeated-cycle de-duplication, account/timeframe isolation and bounded newest-first history.
- **Verified code commit:** `76ff17e1ec46c3b935bc3e098809c2b16abf3fd6`. CI [38753272901](https://github.com/S35213/Sharfx/actions/runs/38753272901), manual CFD [38753263959](https://github.com/S35213/Sharfx/actions/runs/38753263959), Render smoke [38753264069](https://github.com/S35213/Sharfx/actions/runs/38753264069), and visual workflow [38753263933](https://github.com/S35213/Sharfx/actions/runs/38753263933) all passed. CI confirmed build, static server, lint, full test suite, production dependency audit and Render rebuild-service check. Target **Shafek Derive Render** deployment `dep-db8eavu3bdoc73fjgadg` is LIVE, finished 2026-10-15 14:41:18 UTC.
- **Limits:** this trace is only for diagnostics; it does not execute, modify or close trades. Trade Bot remains user-started, and READY still means candidate for manual review. There is no authenticated cTrader account/browser QA yet.
- **Visual QA blocker:** desktop/mobile preview workflow passed, but generated captures show the default workspace rather than the Bot tab. A direct hosted Bot-tab browser inspection was attempted but could not start because the separate browser automation wallet balance was -$0.10. Do not claim this panel's live visual layout was accepted yet; inspect the Bot tab when browser verification is available.
- **Remaining audit note:** lint continues to have 0 errors / 63 warnings. Production-only dependency audit is clean; broader installed-tree audit still reports 11 vulnerabilities (2 moderate, 9 high). Do a separate dependency triage.
- **Next:** open the hosted Bot tab and inspect both desktop and mobile layouts; complete authenticated cTrader account/history end-to-end QA without placing any real/live order; then consider a paper-mode backtest/shadow evaluation of bot decisions. Do not merge into `main`, enable automatic execution or promote Cloudflare production without explicit approval.


## Trade Bot hypothetical shadow-outcome evaluation — 2026-10-15

- **Research source:** adapted the offline-evidence and conservative-data principles from [HKUDS/Vibe-Trading account reconciliation](https://github.com/HKUDS/Vibe-Trading/blob/main/agent/backtest/binance_account_reconciliation.py) and its OHLC loader contracts. No Python trading code was copied; SHAFX remains TypeScript/cTrader.
- **Added:** `src/engine/bot/tradeBotShadowEvaluation.ts` creates one hypothetical sample per selected source/market/timeframe candle when Trade Bot reaches READY, then checks later candles against the planned SL/TP. Samples are deduplicated by source scope + symbol + timeframe + signal candle and bounded to 24 in memory.
- **Safety detail:** shadow evaluation does not call any broker API and cannot submit, amend, or close orders. It waits until a following candle timestamp exists before evaluating a bar, so the newest potentially-forming candle is not treated as closed. If one candle touches both SL and TP, the result is AMBIGUOUS; it is not counted as a win. Results are hypothetical and are not proof of strategy profitability.
- **UI:** the collapsed Trade Bot Decision diagnostics panel now shows the six newest shadow outcomes for the selected scope, clearly labeled “Shadow outcomes · no orders.” They are in-memory only and reset on page reload.
- **Regression tests:** `src/engine/bot/tradeBotShadowEvaluation.test.ts` covers invalid candidate refusal, per-candle deduplication, later-candle gating, BUY/SELL stops, targets, ambiguous bars, stable resolved records and bounded history.
- **Verification status:** code and tests have been committed to the experimental branch; the final CI run for the exact latest commit must pass before treating this milestone as verified. Do not claim authenticated cTrader browser QA or profitable backtesting from this shadow-only evaluator.
- **Next:** verify the latest branch CI/build/test run, then visually inspect the hosted Bot tab on desktop and mobile. After that, run an explicit historical/paper evaluation with sample-size and outcome caveats. Automatic execution remains disabled; do not merge to `main` or promote Cloudflare without explicit approval.


### Verification follow-up — 2026-10-15 (latest shadow evaluator fix)

- Initial CI caught three failures in `tradeBotShadowEvaluation.test.ts`: the closed-candle selector incorrectly treated the newest candle as closed and the fixtures exposed a boundary mistake. Fixed by treating only bars with a later bar in the supplied frame as closed; newest bar is excluded.
- Verified exact code commit `5accfc2afa14c20b52f75b010dccc42112ceb5b5`: SHAFX CI passed; manual CFD branch verification passed; Render test smoke passed; visual preview build and desktop/mobile screenshot capture passed.
- Render service `srv-dav8hrt9fdbs73d690s0` (`Shafek Derive Render` / `https://sharfx-deriv-render.onrender.com/`) reports this code commit live. Public read-only page fetch returns the SHAFX welcome screen successfully.
- Screenshot review found a pre-existing/remaining mobile workspace issue: the fixed bottom navigation overlays the chart area in the full-page mobile capture. Track as a separate responsive-layout defect; do not treat the screenshot as proof of the authenticated Trade Bot panel's visual correctness.
- Browser-driven authenticated inspection of the Bot tab remains unverified; no credentials were entered, and no trades were submitted. A browser automation session could not start because its separate automation wallet had a negative balance. The static preview artifact is available from Actions run [38757724475](https://github.com/S35213/Sharfx/actions/runs/38757724475).
- Shadow outcome logic is still hypothetical, in-memory only, and not a broker trade ledger or profitability proof.


### Historical replay milestone — 2026-10-15

- Added `src/engine/bot/tradeBotHistoricalReplay.ts` and `src/engine/bot/tradeBotHistoricalReplay.test.ts`; the Trade Bot diagnostics now expose an explicit **Run historical replay** control.
- The replay calls the same `evaluateTradeBotDecision` logic used by the live analysis panel. For each historical signal time it only passes candles that had closed by that time, using each timeframe's known duration, to avoid higher-timeframe look-ahead. The newest potentially-forming selected-timeframe candle is excluded.
- Outcomes are hypothetical OHLC checks through the existing shadow evaluator. Same-candle SL+TP is AMBIGUOUS; unresolved records remain pending. It is not a broker execution simulator: spread, commission, slippage, gaps, and fill latency are not modelled. Results are not a profitability guarantee.
- Latest code commit `3ee6adafd2ff1d230c5854ee1e6dd4ed9df58f38`: CI passed (91 test files; lint 0 errors / 66 warnings; production dependency audit 0 vulnerabilities); manual CFD verification passed; visual preview build and screenshots passed. The Render deployment for this code commit reports live on the designated `Shafek Derive Render` service.
- The Render smoke check failed on its first attempt while waiting for the page's `#root` selector during deployment transition; a retry is in progress after the service reported live. Do not record smoke as passed until retry concludes.
- Desktop/mobile preview review still shows the fixed bottom navigation overlapping the chart in the full-page mobile capture. The preview is not an authenticated interaction test of the Trade Bot panel.
- Authenticated browser QA remains outstanding. Browser automation was not started because its separate wallet had insufficient balance; no credentials were entered and no trades were sent.
- Next: confirm smoke retry, add a dedicated visual preview for the actual Trade Bot panel if practical, fix mobile chart/navigation overlap separately, then run demo forward observation and compare with historical replay. Keep auto-execution disabled; do not merge `main` or promote Cloudflare without explicit approval.
