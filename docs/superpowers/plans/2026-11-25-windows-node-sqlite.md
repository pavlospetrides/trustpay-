# Windows built-in SQLite implementation plan

> **For agentic workers:** Implement this plan in the current isolated worktree. Steps use checkbox tracking.

**Goal:** Remove the native SQLite install blocker while preserving the synthetic demo behavior on latest main.

**Architecture:** Keep all demo SQL and the PostgreSQL/Supabase path. Replace only the local `better-sqlite3` adapter with Node 24's synchronous `node:sqlite` `DatabaseSync`, using explicit transactions with rollback. Lock Node support to 24.11.1 or newer and add a clean Windows npm CI job.

**Tech Stack:** Node.js 24, TypeScript, Next.js, Vitest, GitHub Actions.

**Spec:** User request on 25 November 2026.

## Constraints

- Base on `origin/main` at `4eb62f7`; preserve the original checkout's modified lockfile.
- No production database changes. No changes to PostgreSQL, Supabase, Jinius, OpenAI, Auth, fraud rules or approval policy.
- Verify clean Windows `npm ci` without Python, node-gyp or Windows SDK for SQLite.

## Work

- [x] Add compatibility tests for existing file-backed demo data and transaction rollback; observe the installation contract fail before implementation.
- [x] Port `DemoStore` to `node:sqlite` with the same schema, prepared SQL and synchronous behavior; make tests pass.
- [x] Remove native SQLite dependencies, update the lockfile, set the Node engine, and document the version.
- [x] Add a Windows CI job that runs a clean `npm ci` without Python on `PATH` and the local regression suite.
- [x] Run clean installation, Vitest, typecheck, lint, build, and local `npm run dev`/API smoke on Windows.
- [ ] Review the staged diff and secrets, commit, push, open a focused draft PR, and record evidence.

## Local evidence

- Node.js v24.11.1, Windows: `npm ci` added 464 packages, exit 0. Repeated with Python absent from `PATH` and a nonexistent `PYTHON` path: exit 0.
- Vitest: 155 passed, 5 skipped. Typecheck, lint, and production build: exit 0.
- Local Next.js API: health `ok` in `synthetic-local-demo`, four invoices, changed-account score 75 and `needs_review`, no payment initiation. Only port 3000 listened. The development server was then stopped to keep Windows binaries unlocked for the next install.
- Node's built-in SQLite opened the previous worktree's existing local database read-only and found four invoices, 14 Aegean payments, and changed-account score 75.
