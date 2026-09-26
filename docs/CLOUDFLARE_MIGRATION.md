# SHAFX Cloudflare migration

## CPU investigation and safeguard

Vercel paused SHAFX after the free team exceeded its Fluid Active CPU allowance. Runtime logs also showed heavy traffic on `/api/auth` and `/api/bot/usage`.

A concrete self-inflicted load source was found in `.github/workflows/load-test.yml`: it was configured to run a 50/100/200/1000 concurrency test automatically after every successful Production deployment against `https://shafx.vercel.app`. That trigger is now removed. The load-test script also refuses to run unless an explicit `SHAFX_LOADTEST_URL` is supplied.

The desktop layout was also mounting a hidden second `TradingAgentPanel`, causing an extra `/api/bot/usage` request on desktop. That duplicate mount is now prevented.

These findings explain a real and preventable part of the CPU/request usage, but they do not prove that every byte of the 309% CPU came from these two causes.

## Cloudflare architecture

- React/Vite frontend remains in `src/`.
- Existing SHAFX API handlers remain under `api/`.
- `worker/index.ts` adapts the existing Vercel-style handlers to the Cloudflare Workers Request/Response runtime.
- Supabase remains the authentication/database provider.
- Cloudflare Workers serves the Vite static assets and API routes.
- Deriv public market-data WebSocket traffic is kept separate from authenticated account/trading WebSocket traffic.
- Secrets/configuration stay in Cloudflare Worker environment variables.

## Required Cloudflare environment variables

Configure the values already used by SHAFX, as applicable to enabled features:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (secret)
- `SHAFX_ADMIN_KEY` (secret)
- `SHAFX_DERIV_SESSION_SECRET` (secret; at least 32 characters)
- `DERIV_CLIENT_ID`
- `DERIV_CLIENT_SECRET` (secret)
- `PAYSTACK_SECRET_KEY` (secret, when Paystack payments are enabled)
- `SHAfx_SITE_URL` (use the active Cloudflare URL for password-reset redirects)

Do not put service-role keys, provider API secrets, payment secrets, or admin keys in `VITE_*` variables.

## Deployment

Connect the `S35213/Sharfx` GitHub repository to Cloudflare Workers Builds and use the `cloudflare-migration` branch for the first migration deployment. Cloudflare can automatically deploy pushes from the connected Git branch.

After the Worker is verified, make the intended production branch the Cloudflare production branch and update Deriv/payment callback URLs to the final Cloudflare hostname.

## Verification checklist

Before switching broker OAuth or payment callbacks:

- `/api/auth?action=me` returns 401 when signed out.
- Login uses email + password only.
- Signup verification uses the 6-digit email code.
- `/api/bot/usage` returns the expected signed-out response.
- `/api/providers/connections` remains protected.
- `/owner` serves the owner page.
- Deriv OAuth callback uses the Cloudflare hostname.
- Paystack callbacks use the Cloudflare hostname, if enabled.

