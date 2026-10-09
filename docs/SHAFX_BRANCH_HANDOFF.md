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
