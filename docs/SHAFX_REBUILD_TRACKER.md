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
- **Latest rebuild commit at tracker update:** `e52f1949b49428c2cea9be598dd7c7293fabc48f`
- **Cloudflare production:** `sharfx` — not being changed by this test
- **Render test service:** `sharfx-deriv-test2`
- **Render URL:** https://sharfx-deriv-test2.onrender.com
- **Render service ID:** `srv-dav8cfmgekts73fvv54g`
- **Render workspace:** `tea-dav85cugekts73fv54i0`
- **Render region:** Frankfurt
- **Render plan:** Free
- **Render branch:** `test/rebuild-deriv-native-manual-20260930`
- **Render build command:** `npm install && npm run build`
- **Render start command:** `npx wrangler dev --local --ip 0.0.0.0 --port $PORT`

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

- [x] Render logs show the service process is live
- [x] Render logs also show repeated Cloudflare Workerd/NOSENTRY warnings:
  `NOSENTRY RPC connection broken for non-DISCONNECTED reason`
- [x] Render metrics currently show no HTTP request data for the observed period
- [ ] Determine whether the warning is harmless or prevents reliable HTTP serving
- [ ] Fix the runtime/start strategy if necessary
- [ ] Verify an actual HTTP response from the Render service
- [ ] Verify the SHAFX UI loads
- [ ] Verify API routes required by SHAFX are reachable

### 5. Broker proof-of-life

- [ ] Sign into SHAFX test deployment
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
- Confirmed deployment reached LIVE.
- Retrieved runtime logs and found repeated Workerd/NOSENTRY warnings.
- Render HTTP metrics for the observation window contained no request data.
- **Current gate:** runtime/HTTP verification.

## Handoff rule for future chats

Start by reading this file before changing the rebuild.

Do not:
- claim a build is passed because it started
- claim a deployment is verified because Render reports LIVE
- claim a broker trade succeeded without a real returned contract ID
- merge PR #57 before the checklist reaches the merge gate

When a new action is completed, append it to the action tree and change its checkbox only after verification.
