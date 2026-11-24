# Team status — 24 November 2026

## Node.js migration branch

Branch `feat/node-typescript-backend-migration` replaces the active Python/FastAPI server with Next.js 16 Route Handlers and TypeScript server modules. `cd frontend && npm run dev` starts one process at http://127.0.0.1:3000. The local SQLite demo, authenticated Supabase PostgreSQL mode, private Storage, synthetic Jinius sync, deterministic risk rules, and maker-checker approvals remain available. No live Jinius or bank payment initiation exists.

The Windows baseline before migration was Python `47 passed, 6 skipped` and frontend Vitest `19 passed` at `d50d3e5`. The migrated branch has a passing hosted synthetic API flow: owner upload/review/score 75; early approval and self-verification denied; analyst verification; approver approval; private document, assessment history, and audit checks; outsider invoice, document, and approval access denied. A real signed-in Chromium walkthrough passes the same review and approval path and displays audit activity. Final post-cleanup test counts and build result are recorded in [migration evidence](node-migration-checklist.md).

### Gap fixes on `feat/ts-migration-gaps` (into #23)

- **Python parity tests.** `frontend/src/lib/server/parity/python-fixtures.json` holds outputs recorded from the last Python backend (`e610436`): risk scores and explanation text, IBAN rules, AES-GCM ciphertext, HMAC fingerprints, intake drafts, the Jinius record digest, text extraction, image checks and 24 SQLite-mode API calls. `python-parity.test.ts` checks the TypeScript code against them. They found, and this branch fixes: half-cent medians rounded up instead of half-to-even, `ß` not matching `ss` in duplicate checks, demo-mode error messages, signal `weight`/`severity` dropped from invoice responses, and the demo intake 404 message.
- **Error status codes.** Every TypeScript error message was compared with the Python exception it replaces. Fixed: a non-owner **Run sync** answered 422 instead of 403, and seven messages answered 500 or 422 instead of Python's 422 or 503.
- **#22 ported.** Unknown-supplier Jinius imports can be resolved again (`POST /api/v1/integrations/jinius/imports/{external_id}/{revision}/resolve`), with the keyed record digest compatible with rows the Python sync already stored. The Integrations page changes from #22 are included. `JiniusSync` takes its feed as an `InvoiceSource`, like the Python adapter seam.
- **Database tests ported.** The four Python `tests/rls` scenarios now run as `frontend/src/lib/server/testing/disposable-db.test.ts` in the CI database job, against the disposable local Supabase stack.

Two findings from the #19/#21 review still wait for the owner:
- whether the person who ran the sync should also be barred from verifying a resolved invoice (needs a schema change);
- a separate issue for country-specific IBAN length checks (pre-existing, also affects uploads).

Review rows queued before the record-digest change cannot be resolved; they clear through a new provider revision.

In Supabase mode, an owner or admin can run **Run sync** on the Integrations page (`POST /api/v1/integrations/jinius/sync`). Each synthetic demo invoice is assessed once through the same deterministic path as uploads and enters the normal maker-checker queue, labelled "Synthetic Jinius demo". Records with an unknown supplier or a missing or invalid IBAN go to human review instead. Runs, counts and safe errors are stored in `sync_runs` and the audit log.

The designated development project's migration history remains unreconciled. Do not run `supabase db push` against it. External OpenAI calls remain unverified because no live key is configured; the official SDK adapter has mocked tests and local PDF text extraction works. The historical FastAPI OpenAPI export remains only as a reference. The original checkout's unrelated `frontend/package-lock.json` edit is preserved outside this worktree. [Draft PR #23](https://github.com/pavlospetrides/trustpay-/pull/23) is open for human review; do not merge without it.

See [run instructions](../README.md), [Supabase setup](supabase-setup.md), [API matrix](node-migration-checklist.md), and [Jinius boundary](jinius-integration-architecture.md).
