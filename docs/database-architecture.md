# Supabase database architecture

## Scope and modes

`TRUSTPAY_BACKEND=postgres` selects the tenant-aware PostgreSQL adapter. The API verifies a Supabase Auth access token with GoTrue on every protected request, resolves the user from `auth.users`, and checks membership in the requested active organization before querying with a privileged database connection. Every business query also includes `organization_id`; a client-supplied organization header is never sufficient on its own. PostgreSQL failures return an error and do not switch to SQLite. `TRUSTPAY_BACKEND=sqlite` remains the explicit local synthetic demo mode.

The SQL source is in `supabase/migrations/`. No migration is run by the application. The pure policy engine in `app/risk.py` is unchanged. Its 0–100 result is a **review priority score**, not a calibrated fraud probability.

## Records

| Table | Purpose | Client Data API access |
| --- | --- | --- |
| `organizations`, `organization_memberships` | Tenant and Supabase Auth user roles | Member-scoped read; no client writes |
| `suppliers` | Tenant-specific supplier identity; duplicate names allowed for warning | Member-scoped read; no client writes |
| `supplier_bank_accounts` | Encrypted IBAN, keyed fingerprint, last four, candidate/verified/rejected state | No direct client access |
| `invoices`, `payment_records` | Invoice versions and historical paid outcomes using `numeric(18,2)` | Member-scoped read; no client writes |
| `risk_assessments`, `risk_signals` | Append-only policy snapshots and evidence | Member-scoped read; no client writes |
| `verification_requests`, `payment_approvals`, `audit_logs` | Human actions and security record | Member-scoped read; no client writes |
| `integration_connections`, `sync_runs` | Provider status and sanitized receipts, without API secrets | Member-scoped read; no client writes |
| `invoice_documents` | Metadata pointing to a private Storage object | Member-scoped read; no client writes |

Composite foreign keys bind supplier, account, invoice, assessment, and payment records to the same organization. Assessment, signal, approval, and audit records reject update/delete. Once an invoice has an assessment, a trigger rejects changes to its material evidence fields; a correction needs a new invoice version. A historical paid invoice number is intentionally not unique: duplicates are flagged as risk events.

## Account protection and risk

The Python server validates IBAN format and check digits, normalizes whitespace and case, encrypts the normalized value with AES-256-GCM using a random nonce, and computes a separate HMAC-SHA256 fingerprint. The two 32-byte keys are supplied by server-only environment variables and never stored in PostgreSQL or sent to the browser. Bank account rows are born as `candidate`; existing synthetic history is marked verified only by the explicit development seed. The risk engine compares fingerprints and paid amount history. API responses contain last-four masks, not ciphertext, fingerprints, or full IBANs. Rotating the encryption key requires re-encryption; rotating the fingerprint key requires a coordinated fingerprint rebuild.

## Authorization and transitions

`owner`, `admin`, and `analyst` can assess, upload evidence, hold, and record independent verification. `owner`, `admin`, and `approver` can approve. A verifier or invoice creator cannot approve the same case. A creator cannot verify their own case. Approval requires `ready` status and, for a score of at least 40, a distinct recorded verifier. Duplicate paid invoices are blocked. Verification, approval, and audit writes occur in one PostgreSQL transaction under a row lock. There is no payment initiation endpoint.

RLS is enabled on every tenant-owned table. A locked `SECURITY DEFINER` membership function avoids recursive membership policies, and direct client writes are revoked. The private `invoice-documents` Storage bucket permits organization-scoped authenticated reads; uploads go through FastAPI, which checks role, invoice scope, content signature, MIME type, and 10 MB size. FastAPI returns documents only after its own authorization check, with no permanent public URL.

## Current limits

There is no real Jinius connection, OCR/AI decision authority, production deployment, invoice-edit workflow, automated migration of existing SQLite records, or production retention policy. The PostgreSQL adapter opens a connection per operation; production scale needs a reviewed pool and connection limit. The migrations and security tests passed on a disposable local Supabase stack in CI; a hosted development project has not been configured or tested.
