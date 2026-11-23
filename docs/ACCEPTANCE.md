# Acceptance and demo evidence

Capture the command, environment, commit SHA and actual outcome for each implemented check. These are acceptance criteria awaiting application import, not results.

| Scenario | Expected outcome |
| --- | --- |
| Known supplier, verified historical account, normal invoice | Explanation of checks and human approval path |
| New IBAN after 14 historical payments | Change flagged, verification pending, approval blocked until resolved |
| Authorized verification of a legitimate new account | Evidence and reviewer recorded, case reassessed before approval |
| Duplicate or repeated ingestion | Duplicate identified or existing ingestion returned without duplicated effects |
| Unusual amount | Policy reason and comparison data shown without declaring fraud |
| Missing history or failed provider request | Unknown/insufficient evidence visible with a defined review path |
| Invoice or account changed after review | Earlier approval invalidated; stale concurrent update rejected |
| Unauthorized role or different business | Server denies access or transition; client controls alone do not grant access |
| Document contains instructions for the AI | Input handled as document data; policy and approvals unchanged by embedded instructions |
| Demo network unavailable | Explicitly labeled simulation, with provider success claims tied to actual receipts |

Keep a short demo script covering import, explanation, hold, verification and decision. Use synthetic invoices and accounts. Record timing for the same cases under declared baseline and assisted conditions. Report the sample size and false alerts alongside time saved. The risk score is a documented policy output until validated as a predictive measure.

## Supabase Phase 1 acceptance gate

The feature branch includes executable tests for two-organization RLS reads and denied direct writes (`supabase/tests/database/tenant_policies_test.sql`), plus a disposable-PostgreSQL API scenario (`tests/rls/test_postgres_api.py`) that submits a changed-account invoice after 14 payments, rejects cross-tenant reads and unauthorized approval, records independent verification, then records approval and audit events. These tests require a migrated disposable Supabase database and have not yet been executed in this checkout. SQL parsing, Python unit tests, and frontend checks do not substitute for this gate.
