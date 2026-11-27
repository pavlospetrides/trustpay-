# TrustPay development readiness audit — 27 November 2026

Branch: `audit/full-system-20261127`. This records verified work in the designated development project. It is not a production certification.

## Confirmed findings and changes

| Priority | Finding and root cause | Change and evidence |
| --- | --- | --- |
| P1 | Hosted `public.duplicate_reviews` was absent although the API queries it and the repository has an additive migration. The hosted project has no reconciled CLI migration history. | Applied only `20261126000200_duplicate_reviews.sql` in a transaction under verified TLS. The table exists with RLS and one read policy. All 17 repository tables and 12 declared indexes are now present. No reset or `supabase db push` was used. |
| P1 | The replacement project had zero paid-history rows, so the documented 14-payment changed-account scenario could not run there. | Added a guarded, idempotent synthetic Aegean supplier and 14 paid fixture records to the staffed demo organization. The script requires an explicit project ref for writes, refuses non-fixture paid history, validates each fixture row, and preserves the existing supplier and invoice. A second `--apply` kept the count at 14. These records are explicitly synthetic and send no payment. |
| P2 | Browser localization tests used a previously built client with Supabase Auth enabled while their server used SQLite. Protected routes redirected to sign-in. | The Playwright configuration now builds its own production bundle with empty public Supabase settings and an isolated SQLite path. The full 15-test browser suite passed after the hosted-copy edit. |
| P2 | Hosted overview, payments, and insights pages still described organization records as a local demo. | Added mode-specific copy in English, Greek, Russian, and Hebrew. The local demo wording remains. `i18n:review` and `i18n:check` passed with 770 keys after integrating the latest homepage change. |
| P3 | `API_CONTRACT.md` still claimed real authentication was missing, contradicting the implemented Supabase token and membership checks. | Corrected the contract wording and health-mode description. |

## Verified environment and security boundaries

- A clean Windows `npm ci` installed 499 packages and reported zero npm vulnerabilities.
- Unit and integration suite: 279 passed, 10 skipped; typecheck, lint, localization check, and production build passed at baseline and after the changes. Localization browser suite: 15 passed after the changes. Hosted E2E suite: 2 skipped because private test-account credentials are not configured.
- Hosted `/api/health` returned `supabase-postgres`; `/login` returned 200 with an email/password form; unauthenticated `/api/v1/invoices` returned 401.
- The PostgreSQL pooler connection used the project's CA certificate with `rejectUnauthorized: true` and a successful read query.
- Hosted public data tables have RLS enabled. The `invoice-documents` Storage bucket is private; Storage has a read policy for its objects. Server code scopes PostgreSQL reads and writes by organization and checks a verified Supabase user and membership per request. The latter code paths were inspected; signed-in cross-tenant behavior remains to be exercised.
- The database has two organizations, four Auth users and four memberships. Existing invoice and supplier rows were preserved. No bank payment endpoint was found.

## Integration and feature limits

- The local fraud unit test confirms 14 historical payments with a changed account score of 75/100. The hosted data now has 14 synthetic history rows, but a hosted assessment and approval rehearsal awaits private test-account credentials.
- Local PDF/OCR tests passed in the 279-test suite. The previously documented 14-document result was 456/456 fields for both the OCR candidate and Vision baseline; no fresh live accuracy measurement was made here.
- The audit worktree has external OpenAI document processing disabled. The adapter is present, server-side, schema-validated, and opt-in; no billable live OpenAI call was made in this audit.
- Jinius remains a labeled synthetic adapter. No official sandbox contract or authorized live credential was available; live connection, credential management, and supplier confirmation through Jinius are unverified.
- The deterministic accounting review endpoint exists, but no app screen invokes it. Supplier spending and monthly expense analytics are not implemented; the current Insights page summarizes invoice assessments only.
- No comparative performance benchmark, authenticated browser run, production assessment, or cross-browser test was completed. PostgreSQL and RLS disposable-stack tests were skipped because the local Supabase CLI and Docker are unavailable.

## Remaining checks and owner actions

1. Privately configure the four `TRUSTPAY_E2E_*` account personas in `frontend/.env.local`, then run `npm run test:e2e`, `npm run test:hosted`, and `$env:RUN_HOSTED_READ_TEST='1'; npm run test` from PowerShell against the designated development project only. The hosted workflow tests create synthetic records.
2. Rehearse a new synthetic invoice end to end and record upload, extraction, assessment, verification, approval, audit, and tenant-isolation evidence in `docs/ACCEPTANCE.md`.
3. Supply the official Jinius sandbox contract and permitted credentials before implementing or claiming live connectivity.
4. Rotate the database password previously printed into this private session's tool output and update both ignored `.env.local` files.
5. Review draft PR #47 (`https://github.com/pavlospetrides/trustpay-/pull/47`) with a human teammate before merge. The local code review findings were fixed in commit `0a339b0`.

## Startup

From `frontend`, with ignored `.env.local` configured for the designated project and the CA certificate path set: `npm ci`, then `npm run dev`. Open `http://127.0.0.1:3000/login`. For a public synthetic local fallback, use SQLite mode with public Supabase settings unset, then `npm run dev` and open `/app/overview`.
