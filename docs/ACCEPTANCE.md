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
