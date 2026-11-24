# Node.js backend migration checklist

This document tracks the migration branch `feat/node-typescript-backend-migration`. It is not a completion claim. Baseline: `d50d3e5` on 24 November 2026. PR #11 remains marked draft on GitHub, but its three commits are ancestors of current `main`; later Jinius work is also present.

## Baseline and boundaries

- [x] Preserve the original checkout's unrelated `frontend/package-lock.json` change in a separate worktree.
- [x] Record baseline tests: Python `47 passed, 6 skipped`; frontend Vitest `19 passed`.
- [x] Inventory Python modules: `main.py` routes; `database.py` local SQLite; `postgres_store.py` tenant transactions; `intake_store.py` intake and audit; `invoice_ai.py` extraction; `documents.py` validation and Storage; `auth.py` GoTrue verification; `security.py` encryption; `risk.py` policy; `fixtures.py` and `jinius.py` synthetic adapters.
- [x] Inventory active proxy: `frontend/next.config.ts` rewrites `/api/*` to localhost:8000 and `/docs` to FastAPI. `frontend/scripts/dev.mjs` provisions Python and starts two servers.
- [x] Inventory Supabase schema: four additive SQL migrations, RLS read policies, server-only writes, private `invoice-documents` bucket, append-only policy/audit triggers, encrypted bank accounts and intake drafts. Migration history remains unreconciled on the designated hosted development project.
- [x] Preserve risk weights: duplicate 100 hard block; changed account 75; no history 45; amount >=2.5x median 65; amount >=1.75x median 40; score capped at 100; critical >=75, review >=40. The score is a policy priority, not a probability.
- [x] Port and test deterministic risk, local synthetic store, maker-checker decision checks, tenant selection, and Python AES-GCM ciphertext reads.
- [x] Port PostgreSQL repository and verify tenant filters and atomic decision transitions.
- [x] Port GoTrue token verification with the Supabase JS SDK and verify membership on every request.
- [x] Port intake, private Storage, PDF/image validation, extraction and review.
- [x] Port OpenAI structured extraction and masked evidence explanation; live calls remain opt-in and unverified without a key.
- [x] Port all API handlers with Zod request validation and compatible status codes.
- [x] Remove proxy and Python launcher after Node routes passed the compatibility tests.
- [x] Verify local and hosted signed-in browser workflows, direct RLS and Storage isolation, typecheck, lint, tests, and production build.
- [ ] Open PR and obtain human review before merge.

## API compatibility matrix

All paths are served under `/api` and return `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`. PostgreSQL requests require a verified bearer token and tenant membership except `/health`.

| Method | Path | SQLite | PostgreSQL | Key responses / controls |
| --- | --- | --- | --- | --- |
| GET | `/health` | Synthetic mode | DB health, provider status | 200, 503 if database unavailable |
| GET | `/v1/me/organizations` | Demo organization | Verified memberships | 200, 401 invalid token |
| GET | `/v1/invoices` | Demo list | Tenant list | 200, 401/403 |
| POST | `/v1/invoices/assess` | New demo invoice | Authorized tenant assessment | 201, 403/404/409/422 |
| GET | `/v1/invoices/{id}` | Demo detail | Tenant detail | 200, 404 |
| GET | `/v1/invoices/{id}/assessments` | 404 | Tenant assessment history | 200, 404 |
| GET | `/v1/invoices/{id}/assessments/{assessment_id}` | 404 | Assessment detail | 200, 404 |
| POST | `/v1/invoices/{id}/verify` | Simulated analyst | Authorized independent verifier | 200, 403/409/422 |
| POST | `/v1/invoices/{id}/approve` | Simulated manager | Authorized distinct approver | 200, 403/409 |
| POST | `/v1/invoices/{id}/hold` | Simulated analyst | Authorized hold | 200, 403/409 |
| GET | `/v1/suppliers` | Demo history | Tenant history | 200 |
| GET | `/v1/audit` | Demo events | Tenant append-only log | 200 |
| GET | `/v1/integrations` | Disconnected mock | Tenant connection and sync state | 200 |
| POST | `/v1/integrations/jinius/sync` | 403 | Owner/admin synthetic sync | 200, 403; idempotent imports |
| POST | `/v1/invoice-intakes` | 403 | Private upload and extraction | 201, 403/409/422/429 |
| GET/PATCH | `/v1/invoice-intakes/{id}` | 404/403 | Tenant read/human review | 200, 403/404/422 |
| POST | `/v1/invoice-intakes/{id}/extract` | 403 | Limited retry | 200, 403/404/422/429 |
| POST | `/v1/invoice-intakes/{id}/analyze` | 403 | Deterministic assessment | 200, 403/404/422 |
| GET | `/v1/invoice-intakes/{id}/document` | 404 | Private download | 200, 404/503 |
| GET/POST | `/v1/invoices/{id}/documents` | Empty list / 403 | Tenant list/upload | 200/201, 403/404/422 |
| GET | `/v1/invoices/{id}/documents/{document_id}` | 404 | Private download | 200, 404/503 |
| POST | `/v1/demo/reset` | Local reseed only | 403 | 200, 403 |

## Security constraints

PostgreSQL writes must run in transactions. Every assessment, verification, approval, hold, document, intake, and sync query must restrict by organization. Approval must lock the invoice row before checking status and write the decision plus audit in one transaction. A caller-supplied organization header only selects among verified memberships. Ciphertext must retain Python nonce + ciphertext + tag serialization; fingerprints are HMAC-SHA256 of normalized IBANs. No bank payment endpoint is allowed.

## Verification evidence (24 November 2026)

- Before removal, the original Python suite reported `47 passed, 6 skipped` and frontend Vitest `19 passed` at `d50d3e5`.
- Migrated Vitest: `71 passed, 1 skipped` across 27 files. The skipped hosted read check is opt-in; hosted API and browser checks were run separately.
- TypeScript `tsc --noEmit`, ESLint, and Next.js production build passed. The build emitted native dynamic routes for `/api/health` and `/api/v1/[...path]`.
- Hosted API smoke passed: synthetic PDF upload, private download, review, changed-account score 75, rejected early approval and maker self-verification, analyst verification, distinct approver approval, assessment history, private document and audit event. An outsider was denied cross-tenant invoice, document and approval access; direct Supabase RLS returned no intake row and private Storage denied the original file.
- Signed-in Chromium Playwright: `2 passed`, including a full browser upload/review/75-point analysis/verification/approval/audit walkthrough.
- The local SQLite browser overview showed the four seed invoices. The development server served the UI and API from one Next.js process. Docker and the Supabase CLI were unavailable in this Windows environment, so local `supabase test db` was not rerun; the existing SQL pgTAP suite remains in CI.
- No live OpenAI API request was run because no API key is configured. The SDK adapter's schema and fallback paths have mocked unit coverage. Live Jinius access and payment initiation remain disabled.
- GitHub CLI authentication is unavailable in this workspace; the dedicated branch is ready for a PR after branch publication. No branch was merged.
