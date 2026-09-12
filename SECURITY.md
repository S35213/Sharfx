# Security Policy

## Current security boundary

SHAFX is simulator-first. The browser application must never contain broker passwords, private keys, client secrets, access tokens, or provider API keys.

Live market and broker communication must go through explicitly configured gateways. Credentials belong on the server side, not in `VITE_*` variables or committed files.

## Before production

1. Deploy market-data and broker gateways behind HTTPS.
2. Keep broker/provider credentials server-side and rotate them regularly.
3. Enforce authentication and authorization at the gateway.
4. Use least-privilege broker permissions and separate paper/live accounts.
5. Enforce fresh-price, confirmation, risk, and position limits server-side as well as in the UI.
6. Log order decisions, approvals, gateway responses, and safety rejections without logging secrets.
7. Add monitoring, alerting, incident response, backup, and recovery procedures.
8. Run dependency and security audits before every production release.
9. Complete independent paper-trading and end-to-end failure testing before enabling live execution.
10. Complete applicable Kenyan regulatory, privacy, tax, consumer-protection, and contractual reviews before offering regulated services.

## Reporting a vulnerability

Do not publish credentials, tokens, personal data, or exploit details in a public issue. Report security concerns privately to the project owner and rotate any accidentally exposed credential immediately.

## Scope

This document describes engineering safeguards. It is not legal advice and does not certify SHAFX for regulated financial activity.
