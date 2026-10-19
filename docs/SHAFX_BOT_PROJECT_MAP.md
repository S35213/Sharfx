# SHAFX Bot Project Map

**Last updated:** 2026-10-19  
**Purpose:** durable handoff notes for a new ChatGPT conversation. Update this file whenever bot work changes.

## Guardrails — do not skip

- Repository: [S35213/Sharfx](https://github.com/S35213/Sharfx).
- Experimental application branch: `test/rebuild-deriv-native-manual-20260930`.
- Current isolated implementation branch: `fix/tradebot-balance-aware-lot-sizing-20261019` (in progress, based on the experimental branch; not deployed until merged back).
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

## Evidence / status tracking

Update the lines below after the related checks run; do not mark them complete earlier.

- [ ] Build and TypeScript checks pass on this branch.
- [ ] ESLint passes.
- [ ] All Vitest tests pass, including the added freshness and replay-metric tests.
- [ ] Render static-server smoke and dependency audit pass.
- [ ] Live browser check on the active Render app confirms a stale weekend quote shows a paused/stale market state and does not animate a false candle countdown.
- [ ] Live browser check confirms Signal Bot stays idle until clicked, scans visibly across timeframes, and does not auto-rescan.
- [ ] Live browser check confirms Trade Bot cycles surface a stale quote/no-setup/held-gate reason rather than implying execution happened.
- [ ] No broker order was submitted as part of QA.
- [ ] Review Render deployment identity and branch before any deploy; do not touch `main` or Cloudflare production.

## Next actions

1. Complete build, lint and unit-test checks for the isolated branch.
2. Fix any failures before asking for or merging into the experimental branch.
3. Open/review a pull request targeting only `test/rebuild-deriv-native-manual-20260930`; keep `main` untouched.
4. After CI is green, merge only into the experimental branch if safe; verify the active Render service deployed the expected commit.
5. Run interactive live-browser QA against https://sharfx-deriv-render.onrender.com with order submission intercepted. Do not claim the countdown or bot issue is fixed unless the browser evidence confirms it.
6. Report the actual outcome and update this file's checkboxes, changed files, commit IDs and remaining blockers.

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
## 2026-10-19 — Trade Bot balance-aware lot sizing (in progress)

- Confirmed Render workspace: **Shari's workspace** (`tea-dav85cugekts73fv54i0`).
- Confirmed target service: **sharfx-deriv-render** / **Shafek Derive Render**, service ID `srv-dav8hrt9fdbs73d690s0`, URL https://sharfx-deriv-render.onrender.com.
- Render follows `test/rebuild-deriv-native-manual-20260930`; last observed live deployment is `dep-dbadps1srm7s73abbrkg`, commit `831868a1904e0f929f6c0bae22db013a3aaec527` (deployed 2026-10-18 14:52 UTC). Runtime logs show the server started normally again on 2026-10-19 02:46 UTC; this does not prove the authenticated bot UI works.
- Verified code limitation: Trade Bot sizes initial lots from current broker balance and a stop-risk cap (lower of 0.5% of balance or 10 account-currency units), then previously rejected a setup when estimated broker margin exceeded free margin. It did not calculate a smaller affordable volume.
- Isolated change under development on `fix/tradebot-balance-aware-lot-sizing-20261019`: calculate broker-step-aligned affordable lots from live account free margin; retain a 10% free-margin reserve; query cTrader again for each reduced lot; re-check risk/reward; submit only after broker margin is verified. Order quantity remains explicitly `lots`, not a cash trade amount.
- Added unit tests for proportional lot reduction, stepped rounding, minimum-lot rejection and no order when the account cannot support minimum margin. Added a visible planned-lot estimate and a note if margin checking reduces the final size.
- [ ] SHAFX CI/build/lint/all tests pass for the exact change commit.
- [ ] Render deploy points at the resulting change commit after merge into the experimental branch.
- [ ] Authenticated browser acceptance confirms Signal Bot manual scan progress/results and the Trade Bot's visible blocker/freshness state.
- [x] Source inspection and Render deployment/log identity checked; no broker order was submitted, modified or closed.
- [ ] Do not call the bot fixed until exact-commit CI, deployed-commit verification and authenticated browser QA succeed.
- Browser automation was not started on 2026-10-19 because the connected TinyFish wallet returned an insufficient-credit error. No authenticated UI test occurred during this inspection.
- Safe next action: review the sizing patch and unit tests, run CI on the feature branch, then merge only into `test/rebuild-deriv-native-manual-20260930` if green. Let that specific Render service auto-deploy and verify the exact commit. Keep `main`, Cloudflare production and sibling Render services untouched.
