# Team status

Updated 23 November 2026 for the full-project import branch.

## Branch status

The `import/full-project` branch imports the existing FastAPI/SQLite backend, legacy HTML client, and Next.js Crystal frontend while preserving the bootstrap documentation from `main`. It is pending team review and merge. The repository is public; the demo uses synthetic fixtures and contains no real Jinius connection, production authentication, or payment transfer capability.

## Verification on the import branch

On Windows with Python 3.14 and Node.js, `py -m pytest tests -q` passed 17 tests with two dependency warnings. In `frontend/`, `npm run lint`, `npm run typecheck`, `npm run test` (7 tests), and `npm run build` all passed. The actual FastAPI schema is exported as [openapi.json](openapi.json); policy rules are implemented in [app/risk.py](../app/risk.py) and the API surface is summarized in [API_CONTRACT.md](../API_CONTRACT.md). See the root and frontend READMEs for installation and run commands. These checks establish local demo behavior; they do not establish production security or provider integration.

## First work

1. Review and merge the imported backend and frontend, preserving source provenance and working commands.
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
