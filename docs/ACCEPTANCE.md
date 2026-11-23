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

The feature branch includes executable tests for two-organization RLS reads and denied direct writes (`supabase/tests/database/tenant_policies_test.sql`), plus disposable-PostgreSQL API scenarios (`tests/rls/test_postgres_api.py` and `tests/rls/test_phase2_api.py`). [Phase 2 CI run 45245609886](https://github.com/pavlospetrides/trustpay-/actions/runs/45245609886) passed both jobs, including migrations, pgTAP, API tests, Python and frontend checks. On the confirmed hosted development project, `tests/hosted/test_phase2_browser.py` passed twice (80.72 and 80.80 seconds) against real Auth, Storage, FastAPI, PostgreSQL and Next.js. It verified the 14-payment changed-IBAN score 75, tenant isolation, private PDF access, blocked direct approval and maker self-verification, independent verifier and approver actions, and audit persistence. Direct Supabase REST returned one intake row to the maker and none to the outsider; private Storage returned the PDF to the maker and denied the outsider. `tests/hosted/test_policy_scenarios.py` then passed in 21.12 seconds: duplicate blocked, clean invoice approved, large amount flagged, and no-history supplier flagged. These are synthetic data and human-recorded verification steps; no bank ownership or payment execution was tested. Live OpenAI extraction is pending an API key.
