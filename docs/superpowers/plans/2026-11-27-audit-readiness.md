# TrustPay Development Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verify the current TrustPay system, repair confirmed blockers in the designated development environment, and leave reproducible demo evidence.

**Architecture:** Keep the existing Next.js API and deterministic risk policy. Use the existing additive SQL migration and a guarded synthetic fixture for the hosted project. Keep browser tests isolated from private hosted settings.

**Tech Stack:** Node.js 24, Next.js 16, TypeScript, PostgreSQL, Supabase Auth and Storage, Vitest, Playwright.

**Spec:** User-provided “Autonomous Full-System Audit, Bug Fixing & Completion” brief, 27 November 2026.

## Global Constraints

- Preserve all existing hosted records; do not reset or destructively migrate the database.
- Use synthetic invoices and payment history; no live bank payment or unverified Jinius claims.
- Keep TLS certificate verification and server-side authorization.
- Do not commit private environment files, credentials, certificates, or invoice originals.
- Keep English, Greek, Russian, and Hebrew synchronized for any changed user-facing text.
- Leave a human-reviewed PR before merge; never force-push.

## Review Focus

- A production build with private Supabase settings must not make the local SQLite browser suite redirect to login.
- An invoice-number normalization review must not fail because its hosted table is missing.
- A second fixture run must keep exactly 14 synthetic paid records.
- A user without a token must receive HTTP 401 from hosted invoice APIs.
- Missing test-account passwords or official Jinius documentation must be reported as blockers, not presented as passes.

---

### Task 1: Baseline and current work

**Files:** Read `README.md`, `docs/STATUS.md`, `API_CONTRACT.md`, `supabase/migrations/*`, GitHub issues and merged PRs.

- [x] Fetch `origin` and compare `origin/main` with the checkout.
- [x] Create `audit/full-system-20261127` in an isolated worktree.
- [x] Run clean Windows `npm ci`, tests, typecheck, lint, and build.

### Task 2: Browser test isolation

**Files:** Modify `frontend/playwright.localization.config.ts`.

- [x] Reproduce the hosted-build/SQLite-browser mismatch in `npm run test:i18n:e2e`.
- [x] Build the test server with explicit empty public Supabase settings and isolated SQLite data.
- [x] Run the focused keyboard test and the full localization browser suite.

### Task 3: Hosted schema and fixture

**Files:** Use `supabase/migrations/20261126000200_duplicate_reviews.sql`; create `frontend/scripts/seed-hosted-demo-history.mjs`; update `docs/supabase-setup.md` and `docs/STATUS.md`.

- [x] Compare hosted tables, indexes, RLS, and Storage with repository migrations.
- [x] Apply only the confirmed missing additive migration under verified TLS.
- [x] Dry-run and apply a guarded, idempotent 14-payment synthetic fixture without altering existing invoices.
- [x] Verify the table, RLS policy, and fixture count after application.

### Task 4: Hosted user workflow and integration boundaries

**Files:** Existing `frontend/e2e/hosted.spec.ts`, `frontend/scripts/hosted-smoke.mjs`, `docs/ACCEPTANCE.md`.

- [ ] Run signed-in browser and API flows when test-account credentials are privately configured.
- [ ] Rehearse upload, extraction, deterministic assessment, independent verification, approval, and audit on a new synthetic invoice.
- [ ] Verify Jinius only against an official sandbox contract and authorized credentials; otherwise record the exact blocker.

### Task 5: Documentation, review, and delivery

**Files:** Update `API_CONTRACT.md`, `docs/STATUS.md`, `docs/ACCEPTANCE.md` and an audit report.

- [ ] Run all relevant checks again and inspect the final diff for secrets.
- [ ] Request independent code review, commit focused changes, and open a PR if GitHub authentication is available.
- [ ] Report verified behavior, untested behavior, and remaining owner actions.
