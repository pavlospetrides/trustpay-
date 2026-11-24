# Team status — 24 November 2026

## Node.js migration branch

Branch `feat/node-typescript-backend-migration` replaces the active Python/FastAPI server with Next.js 16 Route Handlers and TypeScript server modules. `cd frontend && npm run dev` starts one process at http://127.0.0.1:3000. The local SQLite demo, authenticated Supabase PostgreSQL mode, private Storage, synthetic Jinius sync, deterministic risk rules, and maker-checker approvals remain available. No live Jinius or bank payment initiation exists.

The Windows baseline before migration was Python `47 passed, 6 skipped` and frontend Vitest `19 passed` at `d50d3e5`. The migrated branch has a passing hosted synthetic API flow: owner upload/review/score 75; early approval and self-verification denied; analyst verification; approver approval; private document, assessment history, and audit checks; outsider invoice, document, and approval access denied. A real signed-in Chromium walkthrough passes the same review and approval path and displays audit activity. Final post-cleanup test counts and build result are recorded in [migration evidence](node-migration-checklist.md).

The designated development project's migration history remains unreconciled. Do not run `supabase db push` against it. External OpenAI calls remain unverified because no live key is configured; the official SDK adapter has mocked tests and local PDF text extraction works. The historical FastAPI OpenAPI export remains only as a reference. The original checkout's unrelated `frontend/package-lock.json` edit is preserved outside this worktree. [Draft PR #23](https://github.com/pavlospetrides/trustpay-/pull/23) is open for human review; do not merge without it.

See [run instructions](../README.md), [Supabase setup](supabase-setup.md), [API matrix](node-migration-checklist.md), and [Jinius boundary](jinius-integration-architecture.md).
