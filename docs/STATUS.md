# Team status — 25 November 2026

**Start here:** [handoff for 26 November onward](handoff-2026-11-25.md) lists what merged on 25 November, the owner actions still open and the work order.

## Hosted development auth blocker — 26 November 2026

The designated Supabase development project reported `exceed_egress_quota` during a signed-in Playwright rerun on 26 November. The test stopped at login before uploading an invoice. The project owner must restore service by resolving the quota or spend cap before hosted browser checks can resume. Earlier signed-in invoice review runs passed; local unit checks and live synthetic OpenAI extraction are separate from this hosted auth failure. This is unmerged branch evidence from `fix/invoice-extraction-fallback-20261125`.

## Verified-account trust and supplier identity checks (#32, merged in [#33](https://github.com/pavlospetrides/trustpay-/pull/33), `df6b51a`)

From the financial-controls review, items 4 and 7.
- **Verified accounts:** a bank account independently verified on another invoice drops from +75 to +25 ("verified on <date>") for later invoices. That invoice must be approved and still approved, within 90 days, at least the new amount, and verified by someone other than the new invoice's maker and approver. Approval re-checks this under the supplier lock; rejecting the verifying invoice (which also takes the lock) withdraws the trust.
- **Supplier identity:** uploaded invoices compare extracted VAT and registration numbers with the supplier record (+50 on mismatch, verification required) and the name (+20). The values read from the document are kept through review, so clearing them does not hide a mismatch. A VAT country code may be omitted; the HE registry prefix only for suppliers with country CY.
- **Account input:** manual accounts accept only letters, digits, dashes and the whitespace both stores strip.

No migration. Follow-ups: identity checks for Jinius and manual invoices once they carry these fields; the pre-existing dash handling difference between the demo store and the PostgreSQL IBAN check.

## Duplicate approvals, release hold and reject (#30, merged in [#31](https://github.com/pavlospetrides/trustpay-/pull/31), `a16713c`)

From the financial-controls review. A second non-rejected copy of a supplier invoice number is blocked as a duplicate when assessed. Approval re-checks under a supplier lock, so two copies cannot both be approved, including copies created earlier. A copy rejected earlier needs independent verification. Held invoices can be released (not by their creator); verifying a held invoice keeps the hold. Reject needs a reason, is final, and also withdraws an approval before payment. **The hosted development project needs `supabase/migrations/20261126000100_invoice_rejection.sql` applied by hand before reject works there.** Follow-ups: Jinius revisions that change the invoice number, invoice-number normalisation (review item 6), and typed 403/409 errors.

## Windows installation fix (#25, merged, `b5e3d2e`)

At main commit `4eb62f7`, the local SQLite dependency falls back to native compilation on Windows Node.js 24.11.1. It fails without Windows SDK 10.0.26100.0. [PR #25](https://github.com/pavlospetrides/trustpay-/pull/25) moves the synthetic local store to the built-in `node:sqlite` module and removes the native SQLite package. It also adds a Windows CI install job that runs without Python and with node-gyp's Python fallback disabled. The PostgreSQL and Supabase paths are unchanged. Node 24.11.1 or newer within 24.x is required.

Pavlos wrote and tested the change on Windows. MakeItEzzz555 reviewed it as the human reviewer, with independent reviews by Claude and Codex. The reviews found that `node:sqlite` truncates text at a NUL character when reading. The API now rejects NUL in assessment, verification and resolve input, for both backends. The reviews also found that a rollback after SQLite had already rolled back hid the original error. Both bugs have regression tests. Remaining: Node 26 users get an engine warning, and the parity test does not compare HTTP status codes (Codex reports that intake POST answers 403 against a 422 fixture, not re-checked here). Both are follow-ups.

## Differentiation strategy (merged in [#29](https://github.com/pavlospetrides/trustpay-/pull/29), `2a0a2b6`; team decision open on #28)

Many teams may enter the same "AI checks the invoice IBAN before you pay, with Jinius" idea. Claude and Codex researched it independently and agreed a direction. TrustPay should confirm a changed payment destination with the supplier who issued the invoice on Jinius, then approve that exact invoice version with an audit trail. An edit invalidates both the supplier confirmation and the buyer approval. The demo opens with the emailed PDF beside the supplier-issued Jinius record. Details, sources and claims to avoid are in [differentiation-strategy.md](differentiation-strategy.md). The raw reports are in [research/](research/).

The team reports that at the 24 November Open Day, participants were told to create a Jinius API platform account, create fictitious legal entities, obtain a client ID and secret, and send mock invoices through the sandbox. The plan is one buyer and one supplier entity. The client secret stays in server-side environment settings only. Sandbox endpoints are not yet verified (#2). Most importantly, it is unknown whether the supplier can confirm or reject an invoice revision through the API. Owner: MakeItEzzz555. Next: verify the sandbox, ask the organisers about pre-built code under CC BY-SA 4.0 and the Jinius prize rubric, and prepare the solution declaration table.

## Node.js migration (merged)

The Node.js migration ([#23](https://github.com/pavlospetrides/trustpay-/pull/23), with the gap fixes from [#24](https://github.com/pavlospetrides/trustpay-/pull/24)) merged into `main` on 25 November 2026 (`4eb62f7`) after Theodoros's review. CI passed on the merged code ([run 45571161663](https://github.com/pavlospetrides/trustpay-/actions/runs/45571161663)). `main` has no Python files. It replaces the active Python/FastAPI server with Next.js 16 Route Handlers and TypeScript server modules. `cd frontend && npm run dev` starts one process at http://127.0.0.1:3000. The local SQLite demo, authenticated Supabase PostgreSQL mode, private Storage, synthetic Jinius sync, deterministic risk rules, and maker-checker approvals remain available. No live Jinius or bank payment initiation exists.

The Windows baseline before migration was Python `47 passed, 6 skipped` and frontend Vitest `19 passed` at `d50d3e5`. Before merging, the migration branch had a passing hosted synthetic API flow: owner upload/review/score 75; early approval and self-verification denied; analyst verification; approver approval; private document, assessment history, and audit checks; outsider invoice, document, and approval access denied. A real signed-in Chromium walkthrough passes the same review and approval path and displays audit activity. Final post-cleanup test counts and build result are recorded in [migration evidence](node-migration-checklist.md).

### Gap fixes from #24 (merged through #23)

- **Python parity tests.** `frontend/src/lib/server/parity/python-fixtures.json` holds outputs recorded from the last Python backend (`e610436`): risk scores and explanation text, IBAN rules, AES-GCM ciphertext, HMAC fingerprints, intake drafts, the Jinius record digest, text extraction, image checks and 24 SQLite-mode API calls. `python-parity.test.ts` checks the TypeScript code against them. They found, and this branch fixes: half-cent medians rounded up instead of half-to-even, `ß` not matching `ss` in duplicate checks, demo-mode error messages, signal `weight`/`severity` dropped from invoice responses, and the demo intake 404 message.
- **Error status codes.** Every TypeScript error message was compared with the Python exception it replaces. Fixed: a non-owner **Run sync** answered 422 instead of 403, and seven messages answered 500 or 422 instead of Python's 422 or 503.
- **#22 ported.** Unknown-supplier Jinius imports can be resolved again (`POST /api/v1/integrations/jinius/imports/{external_id}/{revision}/resolve`), with the keyed record digest compatible with rows the Python sync already stored. The Integrations page changes from #22 are included. `JiniusSync` takes its feed as an `InvoiceSource`, like the Python adapter seam.
- **Database tests ported.** The four Python `tests/rls` scenarios now run as `frontend/src/lib/server/testing/disposable-db.test.ts` in the CI database job, against the disposable local Supabase stack.

Review fixes (25 Nov, Theodoros's review of #24 and #23):
- duplicate checks fold `ẞ`, `ß` and `ss` together and strip whitespace exactly as Python did (a missed duplicate scored 0 and `ready`);
- a Supabase Auth outage answers 503 after one retry, not 401 "Invalid or expired access token";
- invoice dates stay the stored calendar day (`DATE` is kept as text); before, a server east of UTC showed the previous day.

Uploads are now capped by counting bytes as they arrive, not by trusting `Content-Length` (security review of this branch).

Findings that still wait for the owner:
- whether the person who ran the sync should also be barred from verifying a resolved invoice (needs a schema change);
- the same question for uploads: the user who analyzes an intake is recorded as maker, so a different uploader or reviewer could later verify it. Python behaved the same way; a fix needs `uploaded_by`/`reviewed_by` checks on the invoice (schema change);
- a separate issue for country-specific IBAN length checks (pre-existing, also affects uploads).

Review rows queued before the record-digest change cannot be resolved; they clear through a new provider revision.

In Supabase mode, an owner or admin can run **Run sync** on the Integrations page (`POST /api/v1/integrations/jinius/sync`). Each synthetic demo invoice is assessed once through the same deterministic path as uploads and enters the normal maker-checker queue, labelled "Synthetic Jinius demo". Records with an unknown supplier or a missing or invalid IBAN go to human review instead. Runs, counts and safe errors are stored in `sync_runs` and the audit log.

The designated development project's migration history remains unreconciled. Do not run `supabase db push` against it. External OpenAI calls remain unverified because no live key is configured; the official SDK adapter has mocked tests and local PDF text extraction works. The stale FastAPI `docs/openapi.json` export was deleted; [API_CONTRACT.md](../API_CONTRACT.md) lists the current routes and git history keeps the old file. The hosted walkthrough of the merged code is waiting for the project's CA certificate.

See [run instructions](../README.md), [Supabase setup](supabase-setup.md), [API matrix](node-migration-checklist.md), and [Jinius boundary](jinius-integration-architecture.md).
