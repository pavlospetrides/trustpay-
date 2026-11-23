# AI Invoice Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver an authenticated upload → extract → review → persist risk → verify/approve workflow using private Supabase storage and the existing risk engine.

**Architecture:** A tenant-scoped encrypted intake row tracks each private document and its review state. A local PDF text reader and an optional OpenAI vision adapter produce proposed fields; reviewers confirm data before the existing PostgreSQL risk engine persists an assessment. The Crystal frontend calls FastAPI and never handles provider or database secrets.

**Tech Stack:** FastAPI, Pydantic 2, psycopg 3, pypdf, OpenAI Python SDK, PostgreSQL/RLS, Next.js 16, React 19.

**Spec:** [Phase 2 design](../specs/2026-11-23-ai-invoice-phase2-design.md) and the user-supplied Phase 2 brief.

## Global Constraints

- Preserve SQLite demo and existing approval guards.
- Do not send a document externally without a server-only key and explicit development enablement.
- Use synthetic fixtures; do not mutate the hosted project for development tests.
- Keep every tenant lookup scoped by authenticated organization.
- Do not treat a model explanation or score as payment authority.

## Review Focus

- Cross-tenant intake IDs must return 404, including retry, correction, and document reads.
- An uploaded document containing instructions must not change approval policy or fabricate fields.
- Missing IBAN, invalid amount, or mismatched MIME/signature must not create an assessment.
- Retrying an upload with the same idempotency key must not create duplicate objects or invoices.
- A database, Storage, or model outage must leave a visible retryable state and no fake success.

---

### Task 1: Extraction boundary

**Files:** `app/invoice_ai.py`, `tests/test_invoice_ai.py`, `requirements.txt`, synthetic PDF fixtures.

**Interfaces:** `extract_invoice(data: bytes, content_type: str, provider: InvoiceProvider | None) -> ExtractionResult`; strict `InvoiceFields` and `ReviewedInvoice` schemas; optional `OpenAIInvoiceProvider`.

- [ ] Write tests for text PDF fields, missing/invalid fields, scanned/image provider path, malicious text, provider failure, and explicit method/status.
- [ ] Run tests and observe expected failures.
- [ ] Implement bounded PDF text extraction, conservative local labels, structured vision adapter, and provider timeout/error mapping.
- [ ] Run extraction tests and full Python suite.

### Task 2: Private intake persistence and API

**Files:** `supabase/migrations/20261123000300_invoice_intake.sql`, `app/intake_store.py`, `app/documents.py`, `app/main.py`, `tests/test_invoice_intake_api.py`, `supabase/tests/database/tenant_policies_test.sql`.

**Interfaces:** tenant-scoped `IntakeStore` create/get/update/retry/analyze methods; `/api/v1/invoice-intakes` upload, detail, correction, retry, and analysis routes.

- [ ] Write failing API tests for role, organization, file validation, idempotency, encrypted draft, and storage/provider errors.
- [ ] Run tests and observe expected failures.
- [ ] Add migration/RLS and implement private upload, encrypted draft state, and retryable extraction with bounded input.
- [ ] Run Python and disposable Supabase RLS/API tests.

### Task 3: Reviewed analysis and history

**Files:** `app/postgres_store.py`, `app/intake_store.py`, `app/main.py`, `tests/test_invoice_analysis.py`, `tests/rls/test_phase2_api.py`.

**Interfaces:** reviewer-confirmed draft → existing `PostgresStore.create_assessment`; `assessment_history(invoice_id, principal)` and detail; model narrative stored separately from policy record.

- [ ] Write failing tests for changed account after 14 payments, duplicate, amount, unknown supplier, approval bypass, audit trail, and cross-tenant reads.
- [ ] Run tests and observe expected failures.
- [ ] Implement same-organization supplier resolution, atomic assessment persistence and intake linkage, assessment history/detail, and evidence explanation.
- [ ] Run full Python and disposable database integration suites.

### Task 4: Crystal review flow

**Files:** `frontend/src/app/app/payments/new/page.tsx`, new intake review page/components, `frontend/src/lib/api.ts`, `frontend/src/lib/types.ts`, `frontend/src/app/app/payments/[id]/page.tsx`, Crystal CSS, frontend tests.

**Interfaces:** typed upload/retry/correct/analyze API client; reviewed fields form; persisted assessment display.

- [ ] Write failing frontend tests for file validation, field correction, API error state, and assessment navigation.
- [ ] Run tests and observe expected failures.
- [ ] Implement drag/drop, review, risk result, history, and clear retry/error states using existing Crystal tokens.
- [ ] Run frontend tests, typecheck, lint, production build, and browser workflow checks.

### Task 5: Delivery

**Files:** `.env.example`, docs, OpenAPI export, CI workflow, README.

- [ ] Document provider configuration, extraction, score and security limits, Jinius boundary, and exact test results.
- [ ] Review diff for secrets, run `git diff --check`, Python/frontend/disposable database tests, and browser check.
- [ ] Push dedicated branch and open a PR for human review with verification evidence and remaining gaps.
