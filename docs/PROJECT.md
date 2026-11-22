# Product brief

## User and outcome

Finance staff at small and medium-sized businesses review a proposed supplier payment before money is transferred. TrustPay flags changes against the business's prior supplier and invoice records, shows why a check fired and routes the case through verification and human approval.

## Demo scope

A fictional supplier has 14 prior payments to one account. A new €8,420 invoice contains a changed IBAN. Import the invoice, compare it against trusted history, show the triggered rule and policy score, hold approval, and record independent verification with an authorized reviewer. Also demonstrate a clean invoice and a duplicate. Treat a changed account as a reason to verify.

Original invoice data stays intact. A newly supplied account remains a candidate until independently verified. Preserve the old and proposed account, reviewer, evidence reference, time and decision. Human approval authorizes the reviewed invoice version. Changes to amount, supplier or account invalidate earlier approval.

## Product components

| Name | Responsibility |
| --- | --- |
| TrustPay Guard | Rules, anomaly signals and explanations |
| TrustID | Supplier identity and verified account history |
| TrustFlow | Verification and approval transitions |
| TrustLedger | Case events and provenance |
| TrustInsights | Summary views derived from recorded cases |

These are responsibilities within one application. The first demo can show them in one case screen and review queue.

## Reported state and planned work

The team reports Python, FastAPI, SQLite and deterministic risk rules in an existing MVP. Import and inspect that source first. Proposed additions include a Next.js/TypeScript frontend, AI-assisted invoice analysis, PostgreSQL/Supabase and Jinius adapters. Confirm data access and the existing code before selecting implementation details.

Jinius access depends on the participant endpoints and permissions. Record a real sandbox request with redacted evidence when available. Clearly identify synthetic, simulated and sandbox data on relevant screens. Use synthetic data for public demo material and retain the final human approval in the workflow.

## Boundaries and open questions

The MVP analyzes and reviews payments. Production transfers are outside the current scope. An IBAN format check or a match to past payments establishes a limited fact. Bank-account ownership requires authoritative verification evidence. A 0–100 policy score needs documented rules and weights, and needs labeled outcomes before making probability claims.

Confirm invoice and historical account fields, how trusted history is established, which Jinius operations are available, approval roles, tolerated alert burden and success measures. Measure review time and correct/incorrect flags on declared fixtures before claiming savings.
