# SHAFX Current State / Handoff

> This file is the handoff document for future ChatGPT sessions. Read this file first, then `docs/SHAFX_REBUILD_TRACKER.md`, before changing SHAFX.
>
> **Production/main is OFF-LIMITS for this rebuild.** All work described here belongs to the isolated test branch below.

## 1. Current project

- Repository: `S35213/Sharfx`
- Experimental branch: `test/rebuild-deriv-native-manual-20260930`
- PR: #57
- Experimental Render service: `sharfx-deriv-render`
- Render URL: https://sharfx-deriv-render.onrender.com
- Render service ID: `srv-dav8hrt9fdbs73d690s0`
- Render branch: `test/rebuild-deriv-native-manual-20260930`
- Persistent detailed tracker: `docs/SHAFX_REBUILD_TRACKER.md`

## 2. Non-negotiable workflow

1. Do not modify `main` or the production deployment.
2. Diagnose the repository/current implementation before making a patch.
3. Work only on the isolated test branch and Render service.
4. Do not call a change "fixed" while it is only running. Wait for build, CI, smoke, and deployment verification.
5. Record important changes, failures, fixes, verification results, and next steps in the tracker.
6. Preserve a durable handoff note so a new chat can continue without the user re-explaining the project.

## 3. Product direction

SHAFX is being rebuilt as:

**MT5-familiar trader experience + Deriv-native execution + SHAFX-native visual identity.**

Do not fake MT5 Forex execution on Deriv. SHAFX currently uses Deriv Multipliers (`MULTUP` / `MULTDOWN`) through the Deriv Options trading environment.

The user's desired visual standard is a professional trading terminal: clean chart, readable BUY/SELL controls, visible pips/price context, trade levels on the chart, useful history, and no clutter that makes the app look improvised or AI-generated.

## 4. Deriv funding/account model

For the current real-money architecture:

`Deriv Wallet → Deriv Options trading account → SHAFX authenticated trading connection → Deriv Multiplier trade`

Wallet money is not automatically available to the trading API merely because the user connected Deriv. The client normally transfers funds from Wallet to the relevant trading account first.

SHAFX's current OAuth connection uses the trade permission, not the payment scope. Automatic Wallet→Options transfers are therefore **not implemented**. Do not add silent transfers. A future funding feature would need an explicit user action and the Deriv payment scope/API.

Current test execution remains constrained to the connected demo account while release testing is in progress.

## 5. Manual trading ticket — current design

The ticket is Deriv-native, not a fake Forex-lot ticket.

Current controls/features:
- BUY / SELL direction selection with SHAFX green/red active state.
- Deriv direction semantics remain BUY UP / SELL DOWN at the product level.
- Stake and multiplier controls.
- Minimum stake guard of 10 account-currency units.
- Auto Exits: monetary Stop Loss / Take Profit choices.
- Pre-trade live Deriv proposal review.
- Active-position monitor with contract ID, entry, current price, P/L, stake, multiplier, trade age, SL/TP, and close.
- Chart synchronization for trade levels.

Important semantics:
- Pip/price-distance values are chart estimates for the user's familiar trader view.
- Deriv proposal values are authoritative for the actual monetary protection attached to a multiplier contract.

## 6. Chart — current direction

The chart is being kept visually close to a professional MT5-style terminal without copying MT5.

Recent fixes already implemented:
- Removed full-width Bid/Ask rails that crowded the candles.
- Removed the blue pre-trade entry rail.
- BUY/SELL live price tags now anchor beside the latest candle instead of spanning the chart.
- Actual open trades can display entry / SL / TP lines.
- Entry line color follows trade direction: BUY green, SELL red.
- Structural Support/Resistance are suppressed when too close to current market price.
- Liquidity labels were shortened to BSL/SSL and levels are kept farther from the current price.
- Timeline and chart zoom/fullscreen behavior remain part of the existing SHAFX chart workspace.

### Current precision change under verification

The user reported that a price such as **1158.140** was effectively displaying/moving in larger jumps such as **1158.130 → 1158.140 → 1158.150**, rather than showing finer movement.

Root cause identified: the live Deriv tick values are available with their raw precision, but the SHAFX display precision for XAU/USD was only 2 decimals, and the chart live-price tag precision was derived directly from pip size without retaining the extra fractional-pip digit.

Changes made on the test branch:
- XAU/USD display precision changed from **2 → 3** decimals.
- Chart live-price tag precision now keeps **one fractional-pip digit beyond the pip size**, so a 0.01 pip-size instrument can display 0.001 increments (for example 1158.130, 1158.141, 1158.150) when Deriv supplies those tick values.
- This change affects display precision; it does not manufacture market ticks. The actual sensitivity still comes from the Deriv tick stream.

Latest verified precision implementation commit: `1bd793ea48b976df833978875386497b6c1a138b`.

Verification for this precision change: **PASS**
- GitHub SHAFX CI: PASS
- Render smoke: PASS
- Render deployment: LIVE
- Render deploy: `dep-db1tpnsv8u7c73e1rha0`
- The change is still awaiting the user's handset-level visual confirmation of tick-to-tick movement.

## 7. Trade chart/history problems already diagnosed

The user previously reported:
- executed trades were not visible on the chart;
- History appeared blank after closing a trade;
- trades disappeared after refresh;
- active P/L/current price could stay at zero;
- open/close controls were not consistently wired.

Root causes found in the experimental code included:
- account-stream events were previously dropped before reaching `App.tsx`;
- history recovery needed authenticated `profit_table` pagination;
- open-trade callbacks cleared the chart trade lines;
- closed-stream normalization did not preserve enough of the original trade metadata;
- mobile History was rendered with the wrong `TradesPanel` mode.

Those areas were repaired and subsequently verified by SHAFX CI, Render smoke, and Render deployment. However, an authenticated browser trade/restart test is still the final human-level proof for account-session behavior.

## 8. Structural/liquidity logic

Current chart analysis uses:
- swing highs/lows;
- clustered support/resistance;
- unswept buy-side and sell-side liquidity pools.

The intended chart behavior is **not** to put a label directly on top of the current price simply because the nearest structural calculation happens to be close.

Recent spacing rules:
- Support/resistance require a small minimum distance from current price before being drawn.
- BSL/SSL require a larger minimum distance.
- Duplicate/near-duplicate annotation handling remains in the chart annotation builder.

## 9. Trade history

The History workspace is intended to be the SHAFX account history, not a fake simulator log.

Current behavior includes:
- open positions;
- pending area where applicable;
- closed history;
- account-currency stake/P&L information;
- timeframe captured with trades;
- live age for open positions;
- close actions.

Mobile History now opens on the History tab rather than being forced into a positions-only view.

## 10. Verification standard and latest known pass

The latest fully verified rebuild before the current precision change had:
- SHAFX CI: PASS
- build: PASS
- static server verification: PASS
- lint: PASS
- tests: PASS
- production dependency audit: PASS
- Render rebuild verification: PASS
- Render smoke: PASS
- Render deployment: LIVE

After the precision change, **re-run the full verification before declaring it passed**.

## 11. Next work

Immediate next step:
1. Verify the new live-price precision build/deployment.
2. On the user's handset, check that live BUY/SELL prices can visibly move through fine increments without artificial rounding.
3. Check chart zoom and whether the BUY/SELL tags remain attached to the latest-candle area without obscuring candles.
4. Re-test opening a demo trade, seeing its entry/SL/TP on chart, closing it, seeing the closed trade in History, and refreshing the browser.
5. Only after those checks should the next UI changes be considered complete.

After that, review the remaining professional-terminal polish and only then consider any path toward production/main.

## 12. History/tracker rule

The full chronological record is in `docs/SHAFX_REBUILD_TRACKER.md`.

Whenever a significant change is made:
- add what was changed;
- record the root cause if a bug was fixed;
- record failed verification attempts honestly;
- record the final passing commit/deploy/checks;
- state what remains unverified.

Never erase a failure just because a later commit passes. The history is intentional and is part of the project's continuity.

## 13. Latest account-state repair and bot direction

### Account metrics repair — 2026-10-05

The connected Deriv account stream now derives an MT5-style SHAFX account view from the authoritative balance plus live open Multiplier contracts:

- Equity = balance + floating P/L.
- Used Margin = current open Multiplier stake committed by SHAFX.
- Free Margin = equity - used margin, floored at zero.
- Floating P/L = aggregate open-contract profit.

These values are explicitly SHAFX-derived for the Deriv Multiplier product; they are not presented as native MT5 CFD margin fields.

Latest account-state verification:
- GitHub SHAFX CI 37352851712 — PASS.
- Render deploy dep-db1uc0blthtc73a43kc0 — LIVE.
- Human authenticated-demo-trade confirmation remains open.

### Bot rebuild direction

The current bot implementation already contains reusable market analysis and a five-round unit state state machine, but its autonomous execution path is intentionally disabled on this rebuild branch.

The target architecture is now:

Signal Radar
- scans the selected market across the available timeframes;
- ranks the strongest three distinct opportunities;
- shows direction, signal strength, structure/liquidity context, and freshness;
- opens the existing manual Trade Ticket when the user reviews a signal;
- has no broker-execution responsibility.

Autopilot Unit
- receives user stake and multiplier mode;
- creates a durable server-side five-round run;
- performs a fresh analysis before each round;
- requests the Deriv proposal, buys only after all execution guards pass, monitors the actual contract, and closes according to the configured round-exit policy;
- records the real P/L and advances from Round 1/5 through Round 5/5;
- continues after browser refresh/disconnect because run state is server-owned.

The browser should not run the autonomous bot with browser timers as the authoritative scheduler. Shared market analysis should be computed once per market/timeframe and fanned out to users; account-specific execution should be isolated per user/account.

## 14. Latest verified continuation point — 2026-10-05

### Account metrics

The initial derived-metrics implementation was not enough because the provider adapter was discarding those fields before the UI saw them. The corrected chain now forwards all four dynamic fields:

- equity
- usedMargin
- freeMargin
- floatingPL

from the Deriv account stream into the provider account event and then App.tsx.

This is the exact correction required for the current open demo trade to affect the SHAFX MT5-style account display. The user still needs to hard-refresh the live Render app and observe the authenticated demo trade for final human confirmation.

### Bot status

Signal Radar is implemented and integrated.

It uses the existing SHAFX analysis engine rather than a replacement AI model:

market structure + support/resistance + liquidity + setup detection + multi-timeframe bias

and produces the top three current opportunities with a SHAFX signal-strength score.

The score is deliberately labeled as a SHAFX strength score, not a guaranteed win probability.

Autopilot execution remains disabled in this rebuild.

The durable five-round database state has been created in staging so the architecture is ready, but no unattended broker-execution worker has been left in the branch. Manual Deriv execution remains the controlled execution path during this rebuild.
