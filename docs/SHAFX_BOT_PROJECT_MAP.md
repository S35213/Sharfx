# SHAFX Bot Project Map

**Last updated:** 2026-10-19  
**Purpose:** durable handoff notes for a new ChatGPT conversation. Update this file whenever bot work changes.

## Guardrails — do not skip

- Repository: [S35213/Sharfx](https://github.com/S35213/Sharfx).
- Experimental application branch: `test/rebuild-deriv-native-manual-20260930`.
- Latest focused fixes: PR #74 (margin-aware lot sizing), PR #75 (cTrader quote timestamp normalization), PR #76 (editable lot input and simplified Run feedback), and PR #77 (strategy fallback + visible signal pipeline), all merged into `test/rebuild-deriv-native-manual-20260930`. Current live code commit: `ddabec62952cae01c0019f6fed94df67984ef240`.
- Active Render service: **Shafek Derive Render** — https://sharfx-deriv-render.onrender.com — service ID `srv-dav8hrt9fdbs73d690s0`.
- Do **not** use Render services `Shafek Derive Test 2`, `Shafek Derive Test`, `Shafex Deriv Test 2`, or any similarly named sibling service.
- Do not merge into `main`, deploy to Cloudflare production, or place real/demo broker orders while performing QA unless the user separately authorizes that specific action.
- Do not say a problem is fixed solely because a commit exists or a build passed. Report code checks, live browser checks and broker execution evidence separately.
- Never copy OANDA execution code from FXBot into the cTrader execution path.

## Product boundaries

### Signal Bot
- Independent from the Trade Bot.
- Scan starts only after a user taps the bottom Scan button.
- Should visibly advance through the supported timeframes, return meaningful results, and must not auto-rescan.
- Signal Bot failures must not affect manual trading or the Trade Bot.

### Trade Bot
- Independent market loader and decision state; currently limited to the selected cTrader **practice/demo** account.
- Do not silently fall back to Deriv or enable live-account trading.
- A cycle should explain: cycle number, selected symbol/timeframe/account, data source, last history check, last genuine candle-snapshot change, actual cTrader quote timestamp/age, candle sufficiency, structure and higher-timeframe decision, verified instrument specification, risk and reward checks, and exactly why an entry was held or submitted.
- A setup score alone is not proof of an order. An order is only considered open after broker confirmation and stop-loss/take-profit protection confirmation.
- Stopping the bot or changing its market/timeframe/account must stop the session and cancel pending preflight before order submission where possible.

## Current work — FXBot-inspired improvements

Reference repository: [trentstauff/FXBot](https://github.com/trentstauff/FXBot).

Useful concepts to adapt:
1. A repeated polling cycle must be distinguished from a new market event.
2. Historical replay should report performance measures and make execution-cost assumptions explicit.
3. A later chronological holdout is more informative than reporting only the same full historical sample used during development.
4. Keep backtesting/replay offline and deterministic; it must not create broker orders.

Do not transplant the FXBot's Python/OANDA-specific classes. SHAFX is React/TypeScript and its broker path is cTrader. FXBot's pinned Python dependencies and simple fixed-unit live execution are not appropriate replacements for SHAFX's contract-aware sizing and guarded demo execution. No FXBot source code has been copied as part of this work; its repository currently declares no license.

### Changes being prepared on the isolated implementation branch

- Normalize cTrader quote timestamps (ISO strings, Unix seconds, milliseconds and numeric strings) at the provider boundary.
- Do not replace a missing/invalid provider timestamp with the local wall clock; that could make a stale quote appear live.
- Request a cTrader quote independently of history polling. A successful candle-history HTTP response must not refresh quote freshness.
- Separate the last history-request completion time from the quote timestamp and last candle-snapshot change time.
- Keep Trade Bot blocked from new entries when the broker quote is stale or absent, and surface the exact freshness gate in Bot activity and diagnostics.
- Improve historical replay with net R, net expectancy, profit factor, net win rate, maximum drawdown and a separate final-30% chronological holdout.
- Apply a configurable pip-equivalent round-trip cost estimate to replay results. It is an assumption, not historical bid/ask, commissions or fill simulation; calibrate by symbol and broker.
- Add unit coverage for quote-timestamp normalization, stale quotes despite successful history polling, replay metrics and the chronological holdout.
- Maintain this project map for future-chat handoff.

## Evidence / status tracking — last verified 2026-10-19

- [x] Build and TypeScript checks pass on lot-sizing commit `2a9efb80f772e2ed5f14d7c8a4a8089623706157` — [SHAFX CI run 39234633194](https://github.com/S35213/Sharfx/actions/runs/39234633194).
- [x] Trade Bot lot-input UI and requested-lot sizing pass build, static-server, lint, all tests, and production dependency audit before merge — [feature CI run 39245515890](https://github.com/S35213/Sharfx/actions/runs/39245515890).
- [x] Post-merge CI passes on lot-input commit `2a867c41d394c76525404bcbc8bbc031fb038979` — [SHAFX CI run 39245701769](https://github.com/S35213/Sharfx/actions/runs/39245701769).
- [x] Strategy fallback + signal pipeline commit `ddabec62952cae01c0019f6fed94df67984ef240` passes build, static-server, lint, all tests and production dependency audit — [SHAFX CI run 39248665020](https://github.com/S35213/Sharfx/actions/runs/39248665020).
- [x] Quote timestamp fix commit `1bb00b121c05ce76641f4e2226cb922dfef93103` passes build, static-server smoke, lint, unit tests and production dependency audit — [SHAFX CI run 39238439339](https://github.com/S35213/Sharfx/actions/runs/39238439339).
- [x] ESLint passes on the same code revision.
- [x] Vitest suite passes on the same code revision.
- [x] Node static-server smoke and production-only dependency audit pass (same CI run).
- [x] Manual CFD verification passes for lot sizing — [workflow 39234633020](https://github.com/S35213/Sharfx/actions/runs/39234633020).
- [x] Manual CFD verification passes after quote timestamp fix — [workflow 39238439337](https://github.com/S35213/Sharfx/actions/runs/39238439337).
- [x] Post-merge manual CFD verification passes on lot-input UI commit — [workflow 39245701778](https://github.com/S35213/Sharfx/actions/runs/39245701778).
- [x] Manual CFD verification passes on the strategy fallback + signal pipeline commit — [workflow 39248665135](https://github.com/S35213/Sharfx/actions/runs/39248665135).
- [x] Live Render smoke passes for lot-sizing deploy — [workflow 39234634357](https://github.com/S35213/Sharfx/actions/runs/39234634357). The workflow checked the HTML, bundled assets, health endpoint, expected unauthenticated auth response, public Deriv feed and responsive desktop/mobile UI.
- [x] Live Render smoke also passes after quote timestamp fix — [workflow 39238439335](https://github.com/S35213/Sharfx/actions/runs/39238439335).
- [x] Visual-preview workflow passed, including desktop and mobile preview capture — [workflow 39234633310](https://github.com/S35213/Sharfx/actions/runs/39234633310).
- [x] Post-merge desktop/mobile preview passes after Trade Bot lot-input redesign — [workflow 39245701765](https://github.com/S35213/Sharfx/actions/runs/39245701765).
- [x] Strategy fallback + signal pipeline desktop/mobile preview passes — [workflow 39248665106](https://github.com/S35213/Sharfx/actions/runs/39248665106).
- [x] Render service identity, experimental branch, live commit and start logs verified; latest code deploy is `dep-dbb0cenlk1mc73dbcl70` at commit `ddabec62952cae01c0019f6fed94df67984ef240` (LIVE at 2026-10-19 12:00:56 UTC).
- [x] Live Render smoke passes after Trade Bot lot-input redesign — [workflow 39245701779](https://github.com/S35213/Sharfx/actions/runs/39245701779).
- [x] Live Render smoke passes after strategy fallback + signal pipeline — [workflow 39248665141](https://github.com/S35213/Sharfx/actions/runs/39248665141).
- [x] No broker order was submitted, modified or closed during this verification.
- [ ] Authenticated browser check still needed for the signed-in user's Signal Bot scan interaction and Trade Bot cycle/blocker state.
- [ ] Observe a cTrader practice-account monitoring cycle and verify the margin-resized bot behavior in-session; automated execution tests use mocked broker responses.
- [ ] Do not state the entire bot is fixed until the authenticated in-session check passes.
- Note: the connected TinyFish browser automation declined to start because its wallet balance was negative. No authenticated browser session was opened. Public automated smoke is not a substitute for authenticated bot testing.
- Note: `npm install` reports 11 vulnerabilities in the full installed tree (2 moderate, 9 high); the configured production-only dependency audit passes. Track full-tree/dev dependency remediation separately.

## Next actions

1. Open https://sharfx-deriv-render.onrender.com in the user's own signed-in session, select the desired cTrader practice account and inspect the Trade Bot's actual cycle/blocker reason. Do not click Start or send an order just for QA.
2. If the exact authenticated UI needs interactive testing by an assistant browser, make browser automation available (the previous attempt was blocked by the TinyFish wallet balance) or have the user share a screenshot of the Bot panel and its expanded Decision diagnostics.
3. If an in-session blocker remains, record the visible reason and fix that specific cause. Do not randomize signal results or bypass quote freshness, instrument-spec, risk, margin or broker protection guards.
4. Keep real-money order execution disabled; the Trade Bot remains cTrader practice/demo-only. Keep `main` and Cloudflare production untouched.

## Handoff format for future work

For every follow-up, record:
- **Problem / root cause**
- **Files changed**
- **Commit(s) and branch**
- **Checks run and exact pass/fail outcome**
- **Live Render/browser verification**
- **Not verified / remaining issue**
- **Next safe action**

If a new conversation starts, read this file first, then inspect the live branch/deployment state before editing.
## 2026-10-19 — Trade Bot strategy fallback + visible signal pipeline (deployed; authenticated demo run pending)

- **User symptom:** Trade Bot kept cycling on EUR/USD M5 with the generic "no setup passed the structure and liquidity rules" message, without useful visible scan/pass/blocked stages or outcome feedback.
- **Root causes confirmed in source:** (1) `src/engine/bot/tradeBotDecision.ts` used only the strict structure + support/resistance + unswept-liquidity candidate, with no fallback. (2) missing/unclear higher-timeframe bias was mapped to `Unclear` and then treated as a hard veto. (3) the main view surfaced only one text result; strategy checks and hypothetical results were hidden. The generic message meant the strategy rejected the current candidate, not that cTrader cannot trade EUR/USD.
- **Strategy change:** retain structure/liquidity setup when valid; otherwise evaluate closed-candle EMA(9/21) + RSI(14) + ATR(14) momentum continuation, with scored trend/slope/price/RSI/price-action checks. The fallback derives the protective stop from ATR/recent range and targets 1.8R. A score is a confluence score, **not a win probability or profitability promise**.
- **Higher timeframe:** unclear/mixed bias is informational rather than a veto. A candidate that opposes a directional higher-timeframe bias is held when at least two directional higher-timeframe frames support that bias and confidence is at least 65%. Fresh quote, instrument validity, balance, lot sizing, stop-risk, minimum R:R, margin, exposure and broker protection checks remain.
- **Closed-candle timing:** the last potentially-forming bar is excluded from signal detection. The selected closed-candle timestamp is passed through execution deduplication and hypothetical outcome evaluation.
- **UI:** added `Signal pipeline` (Market → Strategy → Risk → Broker), scan/pass/watch/block states, individual strategy checks, EMA/RSI values, score, and an explanation for holds. Added `Strategy outcomes` counts for WIN/LOSS/AMBIGUOUS/PENDING. These are explicitly **hypothetical signals, not broker trade results**; only later closed candles touching stop/target resolve them. If one candle touches both, it is ambiguous.
- **Files changed in PR #77:** `src/engine/bot/tradeBotStrategy.ts`, `src/engine/bot/tradeBotStrategy.test.ts`, `src/engine/bot/tradeBotDecision.ts`, `src/engine/bot/tradeBotDecision.test.ts`, and `src/components/ai/TradeBotPanel.tsx`.
- **PR:** [#77 — Make Trade Bot find explainable setups and show a live signal pipeline](https://github.com/S35213/Sharfx/pull/77), merged only into `test/rebuild-deriv-native-manual-20260930`.
- **Live code/deploy:** commit `ddabec62952cae01c0019f6fed94df67984ef240`, Render deployment `dep-dbb0cenlk1mc73dbcl70`, LIVE at 2026-10-19 12:00:56 UTC on **Shafek Derive Render**.
- **Checks passed:** [pre-merge CI](https://github.com/S35213/Sharfx/actions/runs/39248448381), [post-merge CI](https://github.com/S35213/Sharfx/actions/runs/39248665020), [manual CFD verification](https://github.com/S35213/Sharfx/actions/runs/39248665135), [live Render smoke](https://github.com/S35213/Sharfx/actions/runs/39248665141), and [desktop/mobile preview](https://github.com/S35213/Sharfx/actions/runs/39248665106).
- **Still unverified:** no authenticated cTrader practice order was placed during implementation; no profitability claim is made. Automated checks don't prove the signed-in account's actual quote is fresh or that the fallback will be profitable.
- **Next step for user:** refresh https://sharfx-deriv-render.onrender.com, open Bots → Trade Bot, select EUR/USD and M5, set the intended lot, press Run bot, and inspect the new pipeline. If it waits, the Strategy card shows the exact waiting checks; if Broker is WAIT/HELD, inspect Advanced diagnostics for quote age/instrument gate and share a screenshot.
- **Guardrails:** validate on cTrader DEMO only; do not bypass stale quote or risk/protection gates; keep `main`, Cloudflare production and sibling Render services untouched.

## 2026-10-19 — Trade Bot lot-input redesign (deployed; authenticated workflow pending)

- **User pain confirmed:** the main Trade Bot UI showed `$10` as a risk ceiling, a read-only `Planned lot size`, a `Margin safeguard 90% maximum` card, a large strategy card, and a sticky `Last bot issue / held check` message. User asked for a proper editable lot size field and fewer technical details on the main screen.
- **UI change deployed:** replace risk ceiling/planned-lot/margin cards with a prominent editable **Lot size** numeric input next to the selected market. Main action is **Run bot**; the panel shows `CHECKING MARKET` in accent colors while the request is loading. Strategy diagnostics, cycle traces, shadow outcomes and replay controls are behind `Advanced diagnostics (optional)`.
- **Lot algorithm:** the user's lot input is the requested maximum, not a cash stake. It is passed into both the strategy decision and final cTrader practice execution. Resolver `src/engine/bot/tradeBotLotSizing.ts` rounds down to broker increments only, caps at broker max and account stop-risk allowance, and refuses the entry if even the broker minimum exceeds that allowance. The broker's fresh margin check can reduce it further while reserving 10% of free margin; it rechecks cTrader margin after a reduction. It never increases the user's lot and never bypasses quote/exposure/risk/reward/protection checks.
- **Run/issue feedback:** the running state now prioritizes `CHECKING MARKET` while history is loading rather than prematurely showing `WAITING FOR QUOTE`; a successful fresh quote/history cycle clears an old blocker. A current failed gate can still show a concise `Needs attention` message, without the old message claiming it stays until a future fill.
- **Code files changed in PR #76:** `src/components/ai/TradeBotPanel.tsx`, `src/engine/bot/tradeBotDecision.ts`, `src/engine/bot/tradeBotExecution.ts`, new `src/engine/bot/tradeBotLotSizing.ts`, new `src/engine/bot/tradeBotLotSizing.test.ts`, and `src/engine/bot/tradeBotExecution.test.ts`.
- **PR:** [#76 — Simplify Trade Bot controls and use the requested lot size](https://github.com/S35213/Sharfx/pull/76), merged only into `test/rebuild-deriv-native-manual-20260930`.
- **Current deployed code commit:** `2a867c41d394c76525404bcbc8bbc031fb038979`; Render deployment `dep-dbb00rqvcj2c73amgo90` is LIVE at 2026-10-19 11:36:21 UTC.
- **Checks passed:** [feature-branch CI](https://github.com/S35213/Sharfx/actions/runs/39245515890), [post-merge CI](https://github.com/S35213/Sharfx/actions/runs/39245701769), [post-merge manual CFD verification](https://github.com/S35213/Sharfx/actions/runs/39245701778), [post-merge Render smoke](https://github.com/S35213/Sharfx/actions/runs/39245701779), and [desktop/mobile visual preview](https://github.com/S35213/Sharfx/actions/runs/39245701765) passed.
- **Not proven yet:** authenticated in-session cTrader quote/market cycles and visible bot behavior have not been captured by assistant browser automation, which was unavailable. CI and public smoke prove build/server behavior, not a successful order in the user's session.
- **No broker order:** no live or practice broker orders were submitted or modified during implementation and checks.
- **Next user-facing verification:** refresh https://sharfx-deriv-render.onrender.com, open Bots → Trade Bot, confirm the new `Lot size` field appears where the old risk/planned-lot/margin cards were, enter a target such as `0.01` (respect the on-screen cTrader minimum/step), and press `Run bot`. It should show a current quote/history check and then explain whether an entry qualified. Do not expect every Run to place a trade: it must find a qualifying setup and fresh cTrader price. If it still blocks, capture the current `Needs attention` text or open `Advanced diagnostics (optional)` and screenshot the `Broker quote` gate.
- **Guardrails:** cTrader practice/demo only; never loosen quote freshness or stop/risk/margin/protection gates to force trades. Keep `main`, Cloudflare production, and sibling Render services untouched.

## 2026-10-19 — cTrader quote timestamp fix (deployed; authenticated UI pending)

- **Screenshot symptom:** Trade Bot displayed `WAITING FOR QUOTE`, planned lot `—`, and a blocked/held-check panel. This prevents the bot from advancing to a validated setup and preflight.
- **Source defect fixed:** `server/ctrader.js` assumed cTrader spot event timestamps were milliseconds. If serialized as Unix seconds or a numeric string, they could be interpreted as a 1970-era date. It also substituted local server time when the broker omitted a timestamp, which could falsely label an undated quote fresh. Client freshness and the Trade Bot diagnostic gate also disagreed (60s vs 45s). The signed-in account's actual timestamp payload was not captured, so these are confirmed source defects, not proof they were the only reason for the screenshot.
- **Fix deployed in PR #75:** normalize numeric seconds/milliseconds (including numeric strings); preserve missing/invalid provider timestamps as null instead of faking freshness; make the client quote type nullable; use one 45-second freshness rule for provider validation and Trade Bot diagnostics.
- **Regression tests:** seconds/ms numbers and strings, missing/invalid values, and the shared 45-second cutoff. The first CI found a TypeScript mismatch and an over-escaped numeric-string matcher; both were corrected before merge. The final exact-commit CI is green.
- **Files changed for PR #75:** `server/ctrader.js`, `server/ctrader.test.js`, `src/data/ctrader/CTraderLiveQuote.ts`, `src/data/ctrader/CTraderLiveQuote.test.ts`, `src/engine/bot/tradeBotDiagnostics.ts`, and `src/components/order/CTraderManualTicket.tsx`.
- **PR:** [#75 — Fix cTrader quote timestamps blocking the Trade Bot](https://github.com/S35213/Sharfx/pull/75), merged only into `test/rebuild-deriv-native-manual-20260930`.
- **Code/deploy commit:** `1bb00b121c05ce76641f4e2226cb922dfef93103`; Render deployment `dep-dbav4f942hec73e1pt10` is LIVE (2026-10-19 10:35:42 UTC). Build and server startup succeeded.
- **Checks passed:** [SHAFX CI](https://github.com/S35213/Sharfx/actions/runs/39238439339) passed build, static-server, lint, tests and production dependency audit; [manual CFD verification](https://github.com/S35213/Sharfx/actions/runs/39238439337) passed; [Render live smoke](https://github.com/S35213/Sharfx/actions/runs/39238439335) passed; [desktop/mobile visual preview](https://github.com/S35213/Sharfx/actions/runs/39238439343) passed.
- **Still unverified:** authenticated cTrader quote freshness and Signal Bot scan results inside the signed-in account. Browser automation could not open a session because its wallet was out of credit. Public smoke does not prove the exact account quote is fresh.
- **No broker orders:** no real or practice order was submitted, modified or closed.
- **Next action:** refresh the app and check `Bots → Trade Bot → Decision diagnostics`, especially `Broker quote` age/status and `Last bot issue / held check`. If it remains `WAITING FOR QUOTE`, capture that exact issue text and diagnostic gates. Do not bypass freshness or trading safety checks. Keep `main`, Cloudflare production and sibling Render services untouched.

## 2026-10-19 — Trade Bot balance-aware lot sizing (deployed; authenticated UI pending)

- **Root cause found in source:** Trade Bot calculated its initial lot from account balance and stop-loss risk, but rejected the setup outright whenever the initial broker-margin quote was too large for current free margin. It did not try a smaller broker-valid lot.
- **Fix:** starting lot still follows the account-balance/stop-loss risk ceiling (lower of 0.5% of balance or 10 account-currency units). If cTrader's live margin quote is too high, SHAFX reduces the position by broker lot steps, leaves at least 10% of current free margin unused, re-queries cTrader for the smaller lot, and revalidates the risk plan and minimum 1.5:1 risk/reward. If even the minimum lot cannot fit the reserve, it blocks without submitting an order.
- **Units:** the order quantity remains explicitly a lot size (`quantityUnit: 'lots'`), not a dollar amount. Lot sizing is bounded by the actual margin required and broker-instrument rules; leverage means notional size need not equal cash balance, so free margin is the key final affordability check.
- **User-facing clarity:** the Trade Bot now shows its planned lot size and estimated stop risk separately and makes clear the risk ceiling is not the trade amount. It reports when the margin check reduced the final lot.
- **Files changed:** `src/engine/bot/tradeBotExecution.ts`, `src/engine/bot/tradeBotExecution.test.ts`, `src/components/ai/TradeBotPanel.tsx`, and this map.
- **PR:** [#74 — Make Trade Bot lot sizing respect account balance and free margin](https://github.com/S35213/Sharfx/pull/74), merged only into `test/rebuild-deriv-native-manual-20260930`.
- **Code/deploy commit:** `2a9efb80f772e2ed5f14d7c8a4a8089623706157`.
- **Render service:** `Shafek Derive Render`, service `srv-dav8hrt9fdbs73d690s0`, deployment `dep-dbaulorm8hqs73bqfs90` is LIVE (2026-10-19 10:04:12 UTC). Build output shows `tsc -b && vite build` succeeded; the new server started and reported `Your service is live`.
- **Checks passed:** [SHAFX CI](https://github.com/S35213/Sharfx/actions/runs/39234633194), [manual CFD verification](https://github.com/S35213/Sharfx/actions/runs/39234633020), [Render live smoke](https://github.com/S35213/Sharfx/actions/runs/39234634357), and [desktop/mobile visual preview](https://github.com/S35213/Sharfx/actions/runs/39234633310). The test cases confirm lot-step reduction, current-margin rechecking and no order if the broker minimum is unaffordable. These execution tests stub cTrader; they do not place a broker trade.
- **Not proven yet:** no authenticated browser session was available. The connected TinyFish wallet blocked the previous interactive run before it started. Render's unauthenticated smoke and desktop/mobile preview passed, but the signed-in Signal Bot and Trade Bot cycle still need the user's actual in-app check.
- **No trading action:** no live or demo broker order was submitted, modified or closed as part of these checks.
- **Next safe action:** inspect the Bot tab in the user's signed-in session and read `Decision diagnostics` plus `Last bot issue / held check`. If a block persists, fix the displayed cause without bypassing freshness, minimum-lot, risk, margin or protection checks.
