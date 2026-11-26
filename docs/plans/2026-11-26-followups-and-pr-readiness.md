# Plan: follow-ups and PR readiness before the redesign (26 Nov 2026)

Owner: MakeItEzzz555 (human). Assistant: Claude Code. Base: `main` @ `d524822`.
Goal: close the unblocked follow-ups from #30, #32 and #36, and get PRs #43, #37 and #38 ready for one human review pass, so the redesign can start on a stable `main`. Jinius automation (#2, #27, #28) comes after the redesign.

## Context (carry forward)
- Next.js 16 Route Handlers + TypeScript server. Two stores: SQLite demo (`DemoStore`, Python-parity mode) and Supabase PostgreSQL (`PgStore`).
- `handler.ts` maps error messages to HTTP status. SQLite mode keeps Python's statuses (parity fixtures). PostgreSQL mode answers 403 for state conflicts today.
- Every change must pass `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` in `frontend/`. The disposable-database tests (`disposable-db.test.ts`) run only in CI (no Supabase CLI here). The hosted smoke test is blocked by the Supabase egress quota.
- Never: force-push, merge, close other people's PRs or issues, run `supabase db push`, add a schema migration, or change the risk weights.

## Phase 1 — follow-ups (branch `fix/followups-status-iban-parity-20261126`, one PR)
| # | Item | Files | Done when |
|---|---|---|---|
| 1a | Typed errors in PostgreSQL mode: authorization (role, maker-checker, self-verification) stays 403; state conflicts (not ready, needs verification, cannot be verified/approved/released/placed on hold, final) answer 409. SQLite mode unchanged. | `api/handler.ts`, `testing/disposable-db.test.ts`, `scripts/hosted-smoke.mjs`, a handler unit test | Unit test pins 403 vs 409 per message in postgres mode and unchanged SQLite statuses; DB test expectations updated line by line |
| 1b | One dash rule for accounts: both stores ignore dashes the same way. | `security/account.ts` (`normalizeIban`), `fraud/risk.ts` (`normalizedAccount`), tests | `CY17-0020-…` and `CY170020…` give the same fingerprint in PostgreSQL and the same account in the demo store; existing fingerprints unchanged (dashes were rejected before) |
| 1c | Country-specific IBAN length (SWIFT IBAN registry) in `normalizeIban`; unknown country codes keep the generic 15–34 rule. | `security/account.ts`, tests | A CY IBAN of wrong length is rejected with a clear message; all parity IBAN fixtures still pass |
| 1d | Do not show a "+0" badge for weight-0 signals. | `app/app/payments/[id]/page.tsx` | Badge renders only for weight > 0 |
| 1e | Parity test compares the HTTP status of 422 steps too; fix any real mismatch it finds (intake POST in SQLite mode). | `parity/python-parity.test.ts`, `api/handler.ts` | Every `api_sqlite` step checks its status |

Checks: full frontend suite + `git diff --check`; independent review of the diff before push.

## Phase 2 — PR #43 (OCR) review fixes, pushed as new commits to `feat/ocr-invoice-reader-20261126`
1. One Tesseract worker and one language directory per document, not per page.
2. Multi-page line-item retry only when zero line items come back.
3. Do not raise `ADDITIONAL_IBAN_IN_TEXT` for an IBAN that OCR mode then adds as `OCR_ACCOUNT_ADDED_FOR_REVIEW`.
Done when: existing OCR tests pass, a test pins finding 2 and 3, typecheck/lint/test/build pass. No force-push.

## Phase 3 — PRs #37 and #38 (Rikkos)
Review each against current `main`, run the full suite on its head, check they still merge cleanly, fix only real defects as new commits, then mark ready for review. Record verdict and reviewed SHA on each PR.

## Phase 4 — PR #39 and merge order
Confirm whether #39 adds anything beyond `5005d27` (already on `main`). Comment the finding; do not close it. Test-merge all ready PRs in the proposed order and record conflicts.

## Phase 5 — record
Push branches, open the Phase 1 PR linked to #30/#32/#36, comment evidence on each PR and issue, update `docs/STATUS.md` in the Phase 1 PR.

## Stop and ask before
Merging anything, closing anything, a schema migration, a new dependency, changing a risk weight, or any action on the hosted Supabase project.
