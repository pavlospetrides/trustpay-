# Jinius integration boundary

TrustPay currently has a synthetic `DemoJiniusAdapter` and a disabled `LiveJiniusAdapter` in [app/jinius.py](../app/jinius.py). No live Jinius request, payment instruction, or bank account verification is implemented.

## What official sources establish

[Jinius support](https://business.jinius.com.cy/support/) describes invoice and remittance integrations and directs developers to contact Jinius for the next integration steps. Its separate Bank of Cyprus 1bank B2B payment flow requires a company application and authorization; that description does not grant TrustPay payment authority. The [Jinius permissions guide](https://help.jinius.com.cy/hc/en-us/articles/4409285999505-Users-Permissions) distinguishes viewing invoices, managing integrations, approving payables, and paying invoices. A [Marketplace API key guide](https://help.jinius.com.cy/hc/en-us/articles/23333712658961-How-to-get-your-API-Key) documents how Marketplace sellers obtain an API key; it does not establish that the key grants business invoicing or remittance access. Public sources reviewed on 23 November 2026 did not provide an invoice API base URL, endpoint schema, sandbox credentials, or permitted scopes for this project.

## Proposed read-only integration

1. Obtain the official participant or partner API contract and a dedicated sandbox tenant from Jinius. Confirm invoice read permissions, data fields, pagination, authentication, rate limits, error codes, webhook signatures, and whether historical remittance data is available. Record the contract version and access scope before writing a live adapter.
2. Keep credentials server-side. Associate each authorized Jinius connection with one TrustPay organization. Require an explicit administrator connection step, store secrets outside frontend code, and show `connected` only after a successful authenticated sandbox read.
3. Normalize only documented invoice fields into a typed intake record: provider invoice ID and revision, supplier identity, invoice number/date/due date, amount/currency, and payment destination **when the contract actually supplies them**. Missing IBAN or supplier identity must enter human review. Preserve the original provider reference and source label; do not call an imported invoice “uploaded” or “synthetic.”
4. Run normalized invoices through the same field review, supplier resolution, and deterministic `assess_payment` path as uploaded invoices. Enforce idempotency by organization, provider, external ID, and revision; retain the exact source evidence and an auditable sync outcome. Do not use AI text as payment authority.
5. Provide a read-only sync/status surface with last successful sync time, safe error state, and record count. Keep the existing synthetic adapter as an explicitly labeled fallback for the hackathon. Leave payment initiation and automatic approval disabled even if a broader banking API is later authorized.

The Open Day questions and proof checklist are in [JINIUS_OPEN_DAY.md](JINIUS_OPEN_DAY.md). Before implementing `LiveJiniusAdapter`, the team needs Jinius's actual sandbox specification and permission to use it; no endpoint, credential format, payload, or bank capability should be inferred from the Marketplace article.
