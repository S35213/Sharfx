# SHAFX Cloudflare Agent Instructions

This repository is a Cloudflare Workers project. Follow current Cloudflare Workers best practices.

## Cloudflare workflow
- Treat `wrangler.jsonc` as the source of Worker configuration.
- Use TypeScript and ES modules.
- Use Wrangler for local development, deployment, migrations, and Worker-specific operations.
- Use Cloudflare MCP for account-level operations and current Cloudflare API access.
- Use the Cloudflare documentation MCP when Cloudflare product behavior or APIs need verification.
- Never hard-code secrets, API tokens, OAuth client secrets, or provider credentials.
- Prefer least-privilege bindings and validate/sanitize request inputs.
- Keep security headers, CORS, rate limits, error handling, and observability appropriate for production.
- Run build, lint, and tests before deployment.
- Do not claim a deployment succeeded unless the Cloudflare deployment/build status has actually been checked.

## SHAFX-specific deployment rule
- Preserve the existing SHAFX application architecture and user-facing sections.
- Do not replace the app with a minimal Worker or remove the Bot, Chat, History, Funds, Account, chart, or broker flows.
- Cloudflare is the production deployment target.
- Supabase remains the application's data/auth integration where already used.
- Deriv is the live trading provider currently wired into SHAFX.
- Treat real-money trading paths as high-risk: never introduce simulated execution where the live Deriv path is intended, and never expose provider secrets to the browser.

## Cloudflare configuration
- Keep `wrangler.jsonc` valid and current.
- Use Workers Static Assets for the existing frontend when applicable.
- Keep observability enabled.
- Add bindings only when the application actually needs them.

## Verification
Before saying "deployed", verify:
1. Cloudflare build/deployment status.
2. The deployed version corresponds to the intended Git commit.
3. Rollout/traffic is serving the intended version.
4. The public Worker URL responds successfully.
5. The production app's critical login/broker/live-data routes are smoke-tested when practical.
