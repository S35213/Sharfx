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

## External infrastructure — required

- [ ] Secure HTTPS market-data gateway deployed
- [ ] Real market-data provider selected and contracted
- [ ] Secure broker gateway deployed server-side
- [ ] Regulated broker selected and account integration approved
- [ ] Server-side authentication/session management
- [ ] Secret storage and rotation
- [ ] Paper-trading environment
- [ ] Production observability, alerts, audit logs, backups and recovery
- [ ] Independent end-to-end testing, including rejected, duplicated, stale and disconnected orders
- [ ] Disaster/failover testing

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

If SHAFX itself will conduct or facilitate regulated online foreign-exchange activity in Kenya, obtain current advice on the Capital Markets Authority licensing framework before launch. CMA publishes the applicable regulations and licensee information. If SHAFX processes personal data, assess the applicable Data Protection Act/ODPC obligations before collecting production user data.

## Release rule

Until every applicable external gate above is completed and independently verified, keep SHAFX in simulator/paper mode. Do not enable real-money execution merely because the frontend CI passes.
