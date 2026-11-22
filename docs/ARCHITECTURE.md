# TrustPay AI Architecture / Build Plan

## Current end-to-end data flow

```
Browser (HTML + JS)
       |
       | JSON REST API
       v
FastAPI (request validation)
       |
       +--> SQLite history by supplier
       |       |
       |       v
       +--> Risk engine (pure deterministic rules)
       |       |
       |       v
       +--> Assessment + evidence + server-controlled state
       |       |
       |       v
       +--> Append-style SQLite demo audit events

No path to a bank payment system.
```

## State transitions

- `ready` → `approved` (low risk, human demo approval).
- `needs_review` / `hold` → `ready` (with recorded independent evidence) → `approved` (separate simulated actor).
- `blocked` (duplicate paid invoice) → cannot verify or approve within this demo.
- `approved` → cannot be approved or held again.
- Every accepted change adds an audit event in SQLite.

## Suggested hackathon priorities

**P0 (before demo):** lock the core story, hard-block changed IBAN until evidence, duplicate invoice hard-block, ensure no accidental money movement, demo test flows, source labeling and no invented APIs.

**P1 (after official Jinius sandbox documentation):** one genuine Jinius read integration (invoice or supplier data), normalized data mapping, robust retry/idempotency, visible last-sync/status, optional genuine remittance historical read if permitted. No live payment required to demonstrate value.

**P2:** AI OCR of uploaded synthetic documents with source citations; careful grounded explanations; reconciliation, RBAC and legitimate maker/checker identities; PostgreSQL tenant isolation and RLS; deployment.

## Evaluation-friendly demonstration (90 sec)

1. Show one synthetic imported invoice from the Jinius adapter, label as *mock*.
2. Show 14 historical payments all using the same account.
3. Show newly requested account +75 risk signal and the backend refusing direct approval.
4. Record a simulated independent callback; only then show the separate finance manager approval.
5. Show an exact duplicate paid invoice blocked even after trying to approve.
6. Open Audit Trail to prove persistent event record.
7. For the final hackathon demo, replace step 1 with a **genuinely connected Jinius sandbox read** and show a live request outcome if officially available.

## Business positioning

Target ICP: 10–500-employee companies managing recurring supplier payments. Value: reduce invoice-redirection and duplicate-payment risk by providing transaction-history context at the decision point. Do not promise guaranteed fraud prevention, proof of account ownership or regulatory compliance without evidence.
