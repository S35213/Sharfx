# SHAFX Bot Project Map

**Last updated:** 2026-10-19  
**Purpose:** durable handoff notes for a new ChatGPT conversation. Update this file whenever bot work changes.

## Guardrails — do not skip

- Repository: [S35213/Sharfx](https://github.com/S35213/Sharfx).
- Experimental application branch: `test/rebuild-deriv-native-manual-20260930`.
- Latest focused implementation branch: `fix/tradebot-balance-aware-lot-sizing-20261019` (PR #74 merged into the experimental branch; live on Render at commit `2a9efb80f772e2ed5f14d7c8a4a8089623706157`).
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

- [x] Build and TypeScript checks pass on deployed commit `2a9efb80f772e2ed5f14d7c8a4a8089623706157` — [SHAFX CI run 39234633194](https://github.com/S35213/Sharfx/actions/runs/39234633194).
- [x] ESLint passes on the same code revision.
- [x] Vitest suite passes on the same code revision.
- [x] Node static-server smoke and production-only dependency audit pass (same CI run).
- [x] Manual CFD verification passes — [workflow 39234633020](https://github.com/S35213/Sharfx/actions/runs/39234633020).
- [x] Live Render smoke passes — [workflow 39234634357](https://github.com/S35213/Sharfx/actions/runs/39234634357). The workflow checked the HTML, bundled assets, health endpoint, expected unauthenticated auth response, public Deriv feed and responsive desktop/mobile UI.
- [x] Visual-preview workflow passed, including desktop and mobile preview capture — [workflow 39234633310](https://github.com/S35213/Sharfx/actions/runs/39234633310).
- [x] Render service identity, experimental branch, live commit and start logs verified; latest deploy is `dep-dbaulorm8hqs73bqfs90`.
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
