# SHAFX Provider Operations Runbook

## 1. Provider connection failure

1. Confirm the user is authenticated in SHAFX.
2. Inspect public.shafx_provider_connections for state, last_seen_at, expires_at, and auth_method.
3. Inspect public.shafx_provider_audit_events for the latest provider error.
4. Confirm the provider secret reference exists and is readable through the server-only Vault RPC.
5. Never expose or copy provider access tokens into browser storage, logs, GitHub, or support tickets.

## 2. Account synchronization failure

Check that the provider-native account ID is stored in provider_account_id, not the Supabase account-row UUID. For a single-account refresh, use the single-account upsert path so sibling accounts on the same connection remain active.

## 3. Rate-limit response

Provider adapters should use the shared connection-scoped limiter. A RATE_LIMITED provider error should be treated as retryable with backoff. Do not increase polling frequency to recover from a rate limit.

## 4. Stream failure

Check the stream identity tuple:

providerId + connectionId + accountId + environment

A reconnect must replace only the same identity. Sibling provider/account streams must remain alive.

## 5. Symbol mismatch

Use the normalized SHAFX symbol as the internal symbol and the provider mapping registry to translate it into the provider-native symbol. Do not embed provider symbol syntax throughout the UI.

## 6. Vercel deployment failure

For the current Hobby deployment, confirm the Serverless Function count. SHAFX previously exceeded the 12-function limit when provider-specific OANDA route files were introduced; those routes were consolidated into the generic provider endpoint.

After a deployment is READY, run the production concurrency workflow and inspect runtime logs for new errors.

## 7. Supabase security check

Confirm:
- provider tables keep RLS enabled;
- anon/authenticated direct access remains denied;
- Vault secret RPC execution remains restricted to service_role;
- provider credentials never appear in client-side VITE_* configuration.

## 8. Node runtime warning

SHAFX pins Vercel builds/functions to Node 24 in package.json and uses the WHATWG `URL` API for request query parsing in the auth and provider-connections handlers. The latest READY production deployment was exercised on 2026-09-22 and produced no warning/error runtime logs for those routes. Historical Vercel error aggregation may still show DEP0169 entries from older deployments; do not treat those historical entries as evidence of a current source-level `url.parse` call.

## 9. Release gate

A provider change is not considered complete until:
- SHAFX CI passes;
- Provider Architecture CI passes;
- preview/production deployment is READY;
- production concurrency test passes;
- relevant provider tests pass;
- the implementation tree is updated with evidence.
