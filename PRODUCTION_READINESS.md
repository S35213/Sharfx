# Production Readiness Checklist

SHAFX is not approved for real-money trading by this checklist. It is a release gate describing what must be completed before production use.

## Engineering — repository side

- [x] Strict TypeScript build
- [x] Lint and automated tests
- [x] High-severity dependency audit in CI
- [x] Simulator-first default
- [x] No client-side broker secrets
- [x] Live market validation and freshness gates
- [x] Fail-closed broker execution policy
- [x] Explicit user approval and confirmation
- [x] Fresh-price execution guards
- [x] Deterministic backtesting and no-lookahead replay
- [x] Production security policy
- [x] Durable server-side authentication rate limiting
- [x] Per-email signup cooldown to reduce repeated transactional-email abuse
- [x] Provider-neutral runtime boundary with verified Deriv adapter path
- [x] Production Vercel deployment verified healthy

## External infrastructure — required

- [ ] Custom SMTP or Send Email Hook configured and verified for transactional Auth email delivery
- [ ] Secure HTTPS market-data gateway deployed
- [ ] Real market-data provider selected and contracted
- [ ] Secure broker gateway deployed server-side
- [ ] Regulated broker selected and account integration approved
- [x] Server-side authentication/session management
- [ ] Secret storage and rotation process independently verified
- [x] Simulator/paper environment
- [ ] Production observability, alerts, audit logs, backups and recovery
- [ ] Independent end-to-end testing, including rejected, duplicated, stale and disconnected orders
- [ ] Disaster/failover testing

### Current email-delivery blocker

The connected Supabase project is on the Free plan and its shared/default email service has reported bounce-back restrictions. Supabase's current documentation recommends configuring a custom SMTP provider for production Auth email delivery. Custom SMTP is available on the Free plan, but the SMTP provider account, verified sender/domain and credentials must be supplied outside this repository. SHAFX therefore must not claim transactional email is production-ready until that external configuration is verified.

The application now adds a durable per-email signup cooldown in addition to the existing IP/user-agent abuse controls so repeated signup attempts cannot continuously generate confirmation-email attempts from the same address.

## Regulatory and business — required before regulated live service

- [ ] Determine the exact regulated activity and licensing position in each target market
- [ ] Obtain required regulatory/legal advice and approvals
- [ ] Privacy/data-protection assessment and required registrations
- [ ] Terms of service, privacy notice, risk disclosures and user-consent flows
- [ ] Customer-support and complaint process
- [ ] Tax/accounting treatment
- [ ] Business entity, contracts and payment arrangements
- [ ] Insurance/risk-transfer review where appropriate

## Kenya note

If SHAFX itself will conduct or facilitate regulated online foreign-exchange activity in Kenya, obtain current advice on the Capital Markets Authority licensing framework before launch. If SHAFX processes personal data, assess the applicable Data Protection Act/ODPC obligations before collecting production user data.

## Release rule

Until every applicable external gate above is completed and independently verified, keep SHAFX in simulator/paper mode. Do not enable real-money execution merely because the frontend CI passes.
