# TrustPay AI Invoice Intelligence — Phase 2 Design

## Intent

An authenticated reviewer uploads a synthetic invoice, checks extracted fields, and submits a reviewed record to the existing deterministic risk engine. The same PostgreSQL assessment and approval policy remains authoritative. The UI shows the document, field uncertainty, supplier history, masked account comparison, risk signals, and audit events.

## Scope and constraints

- Support PDF, PNG, and JPEG invoices up to 10 MB. Extract text from text PDFs locally; use an optional OpenAI vision provider for scanned PDFs and images. A missing provider returns an explicit retry state. A synthetic text PDF remains usable without an API key through labeled local extraction.
- External document transmission is disabled by default. It requires a server-only OpenAI key and explicit development setting. The demo uses synthetic documents only. Never expose provider keys or raw document text in browser bundles, logs, or public Git.
- Model output is untrusted data. It may propose fields and a narrative, but cannot select an organization, authorize a supplier, set a score, verify an account, approve an invoice, or initiate payment. The reviewer confirms or corrects fields before analysis.
- Draft fields and full IBANs are encrypted at rest with the existing account key. Uploaded files remain in the private Supabase Storage bucket. Tenant IDs and actor IDs come from validated Auth tokens and membership, not request bodies.
- Existing Jinius adapters remain a source boundary. Any future authorized sandbox invoice must normalize into the same reviewed assessment input; no endpoint or sandbox behavior is invented here.
- Preserve the SQLite demo and existing Crystal design. The Phase 2 intake workflow requires PostgreSQL mode; the old manual assessment path remains available.

## Flow

1. Upload an invoice through FastAPI. Validate signature, size, page count, role, and idempotency key; store the file privately and a tenant-scoped intake row.
2. Extract fields with the configured provider or local text rules. Return field values plus named uncertain fields and an extraction method; no fabricated confidence percentage.
3. The reviewer edits fields, selects an existing supplier or explicitly confirms a new supplier, and submits a valid IBAN, date, amount, and invoice number.
4. FastAPI persists the assessment with the existing risk engine. Supplier matching and history are scoped to the authenticated organization. The result includes historical payment count, masked prior/current account, signals, a deterministic evidence explanation, and server-calculated approval state. An optional model narrative is stored separately and never controls policy.
5. The invoice detail page shows the persisted result, assessment history, private document link, and existing human verification and approval actions. The audit trail records upload, correction, analysis, verification, and approval.

## Decisions and limits

- No model is trained on the tiny synthetic history. The existing median comparison and account/duplicate checks remain the only score rules.
- An unknown supplier is created only after the reviewer explicitly confirms the supplier name in the intake review. It then receives the existing insufficient-history signal.
- A missing IBAN or unreadable document stays in review/error state; no assessment is created until the reviewer provides the required fields.
- No OpenAI key is configured in this checkout, so live model behavior cannot be claimed locally. Provider calls use the official Responses API with Pydantic structured output when the operator explicitly enables external transmission.
- The hosted development project is available, but its quotas and migration tracking have not been verified. New schema and full workflow tests run against isolated disposable Supabase in CI before any hosted migration.
