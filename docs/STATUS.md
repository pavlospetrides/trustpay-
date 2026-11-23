# Team status

Updated 23 November 2026 for the Supabase Phase 1 feature branch.

## Branch status

The full FastAPI/SQLite backend, legacy HTML client, and Next.js Crystal frontend were imported and merged to `main` in PR #8. The `feat/supabase-phase1` branch adds a separate PostgreSQL/Auth path with organization scoping, SQL migrations and RLS, private document handling, and synthetic development seed tooling. This branch has not been applied to a Supabase project or reviewed for merge. The repository is public; no credentials or real payment records belong in it. Real Jinius access and payment initiation remain absent.

## Verification on the import branch

On Windows with Python 3.14 and Node.js, `py -m pytest tests -q` passed 17 tests with two dependency warnings. In `frontend/`, `npm run lint`, `npm run typecheck`, `npm run test` (7 tests), and `npm run build` all passed. The actual FastAPI schema is exported as [openapi.json](openapi.json); policy rules are implemented in [app/risk.py](../app/risk.py) and the API surface is summarized in [API_CONTRACT.md](../API_CONTRACT.md). See the root and frontend READMEs for installation and run commands. These checks establish local demo behavior; they do not establish production security or provider integration.

For the Supabase branch, the available Python suite currently reports 27 passed and 1 PostgreSQL integration test skipped because no disposable database is configured. The frontend suite reports 9 passed; TypeScript and ESLint pass. SQL files parse with `pglast`, but actual migration execution and pgTAP tests remain pending a local Supabase stack or designated disposable project. See [Supabase setup](supabase-setup.md) and [database architecture](database-architecture.md).

## First work

1. Validate the Supabase branch migrations, RLS and end-to-end API checks on a disposable project, then obtain human review before merge.
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
