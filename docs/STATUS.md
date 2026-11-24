# Team status

Updated 24 November 2026 for automatic Jinius sync against the synthetic adapter ([#18](https://github.com/pavlospetrides/trustpay-/issues/18)) and one-command startup ([#13](https://github.com/pavlospetrides/trustpay-/issues/13)).

## Automatic Jinius sync, synthetic adapter (#18)

In Supabase mode, an owner or admin can run **Run sync** on the Integrations page (`POST /api/v1/integrations/jinius/sync`). Each `DemoJiniusAdapter` invoice is then assessed once through the same deterministic path as uploads and enters the normal maker-checker queue, labelled "Synthetic Jinius demo". Records with an unknown supplier or a missing or invalid IBAN go to human review instead. Runs, counts and safe errors are stored in `sync_runs` and the audit log.

The demo fixtures now use the same synthetic IBANs as the Postgres seed, so the imported changed-IBAN invoice scores 75. An existing local SQLite demo database keeps the old `SYNTHETIC-CY-*` values until you press Demo reset. Live Jinius access is still pending ([#2](https://github.com/pavlospetrides/trustpay-/issues/2)).

The additive migration `20261124000100_integration_imports.sql` was **applied by hand to the hosted development project on 24 November 2026**. It ran in one transaction after checks confirmed the development environment, a matching project and only the two synthetic organizations. Afterwards the table existed with 0 rows, row-level security and the read-only policy were on, the three `sync_runs` columns were present, and existing invoice, payment and audit counts were unchanged. This adds no migration-history entry; never use `db push` there (see [Supabase setup](supabase-setup.md)). **Signed-in hosted run passed on 24 November 2026** (branch at `7c0eda4`, real browser, three synthetic personas).

- **Owner (`boos@gmail.com`):** **Run sync** imported 4 invoices with 0 sent to review:
  - `JIN-INV-2409-r1`: 75, needs review (changed IBAN)
  - `JIN-INV-2410-r1`: 100, blocked (duplicate)
  - `JIN-INV-2411-r1`: 65, needs review (amount)
  - `JIN-INV-2412-r1`: 0, ready
- **Re-sync:** a second sync created nothing new (4 already imported).
- **Maker check:** the owner's own verify was refused (403).
- **Analyst:** verification was recorded; the analyst's approve was refused (403).
- **Approver:** approval succeeded with "no payment sent".

The audit trail shows `INTEGRATION_SYNC`, `ASSESSED`, `VERIFY` and `APPROVE`. The database holds one assessment per import, one approval and no payment records. Evidence is on the PR for #18.

## One-command startup (#13)

`cd frontend && npm install && npm run dev` now provisions `.venv`, starts FastAPI (port 8000, or 8001 if busy), waits for health, then starts Next.js with the proxy pointed at that port. Ctrl+C stops both. The FastAPI backend is unchanged. Verified on macOS (PR #15): all local checks and CI; SQLite demo flow; Supabase development mode with a signed-in changed-IBAN walkthrough (owner uploads, score 75, self-verification and early approval refused, analyst verifies, analyst approval refused, approver approves, one approval row, complete audit chain); hosted policy scenarios test passed. Still open on #13: the hosted browser test's outsider account (Org B), Windows, and a hand-pressed Ctrl+C. Seen under parallel page loads: transient "Authentication service unavailable" / "Database unavailable" responses, tracked as the next fix. Replacing Python with a Node.js/TypeScript runtime is a separate post-event decision tracked in [#14](https://github.com/pavlospetrides/trustpay-/issues/14).

## Phase 2 handoff

PR #11 (`feat/ai-invoice-phase2`) and the hosted verification PR #12 are merged to `main` (`c8ae6b1`); Phase 1 was merged in PRs #9 and #10. The [latest Phase 2 CI run](https://github.com/pavlospetrides/trustpay-/actions/runs/45245609886) passed app and disposable database jobs. On the designated hosted **development** project, the additive Phase 2 migration was applied in one transaction after checking project identity and synthetic-only organizations. Four new synthetic Auth test users were created without changing existing accounts. A real Chromium browser run passed password sign-in, PDF upload to private Storage, extracted-field review, 14-payment changed-IBAN analysis (score 75), blocked approval and maker self-verification, distinct verifier and approver actions, and persisted audit events. Direct Supabase RLS and Storage checks allowed the maker and denied the outsider. The local opt-in browser test is [test_phase2_browser.py](../tests/hosted/test_phase2_browser.py); the [demo runbook](hackathon-demo-runbook.md) explains operation. Live OpenAI calls remain unverified because no `OPENAI_API_KEY` is configured. The project has no CLI migration-history table; do not use `db push` until history is reconciled. The dashboard plan and full quota are also unverified, though the active database uses about 12 MB and Storage was empty before testing.

## Branch status

The full FastAPI/SQLite backend, legacy HTML client, and Next.js Crystal frontend were imported in PR #8. Supabase Phase 1 was merged to `main` in PRs #9 and #10, and Phase 2 in PRs #11 and #12. The repository is public; no credentials or real payment records belong in it. Real Jinius access and payment initiation remain absent; see the [official-source integration boundary](jinius-integration-architecture.md).

## Verification on the import branch

On Windows with Python 3.14 and Node.js, `py -m pytest tests -q` passed 17 tests with two dependency warnings. In `frontend/`, `npm run lint`, `npm run typecheck`, `npm run test` (7 tests), and `npm run build` all passed. The actual FastAPI schema is exported as [openapi.json](openapi.json); policy rules are implemented in [app/risk.py](../app/risk.py) and the API surface is summarized in [API_CONTRACT.md](../API_CONTRACT.md). See the root and frontend READMEs for installation and run commands. These checks establish local demo behavior; they do not establish production security or provider integration.

For the Supabase branch, the local Python suite reports 27 passed and 1 PostgreSQL integration test skipped because its dedicated disposable test URL is not configured. The frontend suite reports 9 passed; a clean npm 10 install, TypeScript, ESLint and Next.js build pass locally. GitHub Actions run [45162172550](https://github.com/pavlospetrides/trustpay-/actions/runs/45162172550) passed both jobs: the app suite, frontend checks and build, both migrations on a disposable local Supabase stack, 13 pgTAP tests, and the PostgreSQL API integration scenario. On the hosted development project, PostgreSQL connectivity, 12 application tables, the private Storage bucket, three confirmed Auth users with passwords and memberships, five synthetic invoices, and 45 synthetic payment records were verified. The running FastAPI reports `supabase-postgres`, denies anonymous invoice reads with 401, and serves the browser login page through Next.js. Password sign-in and private document upload have not yet been exercised in the browser. See [Supabase setup](supabase-setup.md) and [database architecture](database-architecture.md).

## First work

1. Repeat the changed-IBAN demo with `npm run dev` on the demo machine in Supabase development mode, and on Windows.
2. Confirm participant Jinius API fields, access and permitted sandbox operations.
3. Agree the actual API contract, supplier trust history and case approval states before frontend integration.
4. Build the changed-account demo with deterministic rules and human verification, then record acceptance evidence.

## Initial backlog

- [Import and verify the existing FastAPI MVP](https://github.com/pavlospetrides/trustpay-/issues/1)
- [Confirm Jinius sandbox access and available invoice/account fields](https://github.com/pavlospetrides/trustpay-/issues/2)
- [Agree invoice API contract and verified supplier history](https://github.com/pavlospetrides/trustpay-/issues/3)
- [Implement and verify human verification and approval gates](https://github.com/pavlospetrides/trustpay-/issues/4)
- [Build the invoice review frontend against the agreed contract](https://github.com/pavlospetrides/trustpay-/issues/5)
- [Rehearse the end-to-end demo and document evidence](https://github.com/pavlospetrides/trustpay-/issues/6)
- [Owner setup for branch protection and team review](https://github.com/pavlospetrides/trustpay-/issues/7)

Use these issues for task ownership and progress. Update this page for shared milestones and dependencies. Post session-level handoffs on each task issue or PR using CONTRIBUTING.md.

## Pending team choices

Assign the four responsibility lanes after teammates claim tasks. Frontend, domain/workflow, provider integration and QA/demo are suggested lanes. Final stack, retention policy, repository protections and required checks need explicit decisions. Repository owner permissions are required to configure protection rules.
