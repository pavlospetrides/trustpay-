# Proposed architecture

Status is proposed pending inspection of the existing MVP. Preserve working behavior while documenting the actual module paths and API schema after import.

## Flow

Invoice upload or permitted Jinius ingestion → validated invoice version → supplier/account history lookup → deterministic risk assessment → case review → independent verification → authorized human approval → recorded status.

The FastAPI service owns validation, assessment and workflow transitions. SQLite is the reported starting store. The proposed Next.js client presents server results. PostgreSQL/Supabase is a proposed storage/auth choice to evaluate against team needs and migration work. Keep policy scoring and permission decisions deterministic. AI may extract candidate fields or draft explanations with source references, followed by validation.

## Records and invariants

| Record | Data and constraint |
| --- | --- |
| Supplier | Stable internal identity and original source identifiers scoped to a business |
| Supplier account | Candidate/verified state, provenance, verification event and account history |
| Invoice version | Original evidence, supplier, amount, currency, account and content version |
| Assessment | Rule/policy version, input version, triggered rules and evidence |
| Review decision | Authorized actor, time, reason, evidence and exact assessed version |
| Audit event | Business/case scope, actor, action and referenced versions |
| Integration receipt | Provider, mode, request identifier and sanitized outcome |

Use decimal monetary values or integer minor units with explicit currency. Enforce business-level data isolation at server reads and writes. Approval and edits use transactions/version checks so concurrent changes cannot reuse a stale approval. Duplicate detection needs business/supplier/invoice identity and explicit handling for legitimate revisions and credit notes. Replayed ingestion must be idempotent.

A supplied invoice cannot update verified supplier bank details. Verification contacts come from a previously trusted source. Record the verification outcome, with sensitive evidence stored outside public artifacts. Access rules and retention details need an implementation decision after source import.

## API contracts

Import the FastAPI source and export its actual OpenAPI schema before the frontend depends on endpoints. Agree the invoice, assessment and case transition payloads in the API-contract issue. Document error states and authorization behavior alongside the contract. Implement only the integration operations supported by verified Jinius documentation.
