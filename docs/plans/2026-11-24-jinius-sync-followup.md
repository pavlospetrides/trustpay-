# Jinius sync follow-up (#18): execution prompt

Target: Claude Code (Opus 5.5) in the TrustPay worktree. Run phase 1 first. Phase 2 starts only after phase 1's evidence is posted.

```
## Context (carry forward)
- Repo pavlospetrides/trustpay- (public: synthetic data only, never commit .env, .env.e2e or frontend/.env.local).
- Draft PR #19 (branch feat/jinius-auto-sync) implements #18: owner/admin POST /api/v1/integrations/jinius/sync
  pulls DemoJiniusAdapter invoices, assesses them via PostgresStore._record_assessment (the path uploads use),
  and stores one integration_imports row per (organization, provider, external_id, revision).
  Imported invoices: public_id JIN-<external id>-r<revision>, external_source jinius_demo_adapter,
  label "Synthetic Jinius demo", created_by = the person who ran the sync.
  Unknown supplier / missing IBAN / invalid IBAN -> integration_imports.status='needs_review' with review_reason,
  no invoice. Evidence jsonb keeps only account_last4, never the full IBAN.
- CI on #19 passed (app + disposable-Supabase database job, test_jinius_sync.py ran).
- Migration 20261124000100_integration_imports.sql was applied BY HAND to hosted dev on 24 Nov 2026.
  The hosted project has no migration history: NEVER run `supabase db push` against it.
- Run the branch against hosted dev with the scratchpad launcher that reads the main checkout's .env and
  frontend/.env.local in place (never copy them into the worktree, never print their values).
- Claude MUST NOT type passwords: sign-in goes to hosted Supabase auth. The owner signs in each persona in
  the browser pane; Claude drives everything after sign-in.
- LiveJiniusAdapter stays disabled. No AI decisions, no auto-approval, no payment initiation.

## Phase 1: signed-in hosted walkthrough (verification only, no code changes)

### Objective
Prove on hosted dev, in the real browser UI, that sync imports invoices into the maker-checker queue.

### Steps and acceptance criteria
- [ ] Owner signed in: Integrations shows "Synthetic Jinius demo", sync available, Run sync button.
- [ ] Owner presses Run sync. The run succeeds with 4 seen. On the Asteria seed (SUP-001..SUP-004 exist) expect
      4 assessed, 0 review: JIN-INV-2409-r1 = 75 needs_review (changed IBAN), JIN-INV-2410-r1 = 100 blocked
      (duplicate MO-2128), JIN-INV-2411-r1 = 65 needs_review (amount), JIN-INV-2412-r1 = 0 ready.
      If the numbers differ, stop and report the actual values; do not "fix" seed data.
- [ ] A second Run sync reports 0 assessed and 4 already imported.
- [ ] On JIN-INV-2409-r1 the owner's Record verification is refused (maker cannot verify).
- [ ] Analyst signed in: verification with a 12+ character synthetic note succeeds; Approve is refused.
- [ ] Approver signed in: Approve succeeds and shows "Internal approval recorded — no payment sent".
- [ ] Audit page shows INTEGRATION_SYNC, ASSESSED, VERIFY, APPROVE for these invoices.
After each persona: output "✅ <persona>: <what passed>" with the observed values.

### Done
Post the evidence (observed scores and statuses, refusal messages, run counts; no screenshots of secrets) on
PR #19 and issue #18, update docs/STATUS.md ("signed-in hosted run passed/failed on <date>"), commit and push.
Stop the dev server and confirm ports 3000/8000 are free.

## Phase 2: resolve "unknown supplier" review rows

### Objective
Let an owner, admin or analyst assign an existing supplier to a needs_review import whose reason is
"Supplier is not known in this organization", so it is assessed once through the normal path. Today such
rows can only be cleared by a new provider revision.

### Target state
- PostgresStore.resolve_import(external_id, revision, supplier_public_id, adapter, principal):
  - Role in {owner, admin, analyst} else PermissionError.
  - In ONE transaction: select the org's jinius import row FOR UPDATE (404 if absent in this org).
    Refuse unless status='needs_review' and review_reason is exactly the unknown-supplier reason
    (missing/invalid IBAN rows stay unresolvable: ValueError -> 422).
  - Supplier looked up by public_id inside principal.organization_id only (LookupError -> 404).
  - Re-read the record from adapter.list_invoices() matching (id, revision); the full IBAN is not stored, so the
    provider is the source of truth. Missing record -> ValueError (422). Re-run _import_problem on it.
  - Call _record_assessment(con, item, principal, supplier_id, adapter.source) with the same item shape
    _import_invoice builds; update the import row to status='assessed', invoice_id, updated_at.
  - Audit IMPORT_RESOLVED (target_type integration_import, detail names supplier public_id and new invoice id).
  - Extract the unknown-supplier reason string into one module constant used by both _import_invoice and
    resolve_import.
- POST /api/v1/integrations/jinius/imports/{external_id}/{revision}/resolve with body {"supplier_id": str},
  Postgres mode only (403 otherwise), using DemoJiniusAdapter(); map PermissionError 403, LookupError 404,
  ValueError 422.
- Integrations page: for unknown-supplier review rows only, a supplier <select> (api.suppliers) plus an
  "Assess with this supplier" button; show the server's error text on failure and refresh after success.
  Add api.resolveImport and its types in frontend/src/lib.
- No schema change. If one turns out to be required, STOP and ask.

### Scope
- Work only in: app/postgres_store.py, app/main.py, frontend/src/app/app/integrations/page.tsx,
  frontend/src/lib/api.ts, frontend/src/lib/types.ts, tests/rls/test_jinius_sync.py (or a new
  tests/rls/test_jinius_resolve.py added to the CI database job), tests/test_api.py,
  docs/jinius-integration-architecture.md, docs/STATUS.md.
- Do NOT touch: supabase/migrations/*, risk rules in app/risk.py, authorize_transition, seed data, .env files.

### Acceptance criteria
- [ ] Disposable-DB test: Org A import of an unknown supplier, after adding that supplier, resolves to one
      assessed invoice; a second resolve is refused; one assessment exists.
- [ ] Org B resolving Org A's import gets 404; approver/viewer gets 403; a missing-IBAN row gets 422.
- [ ] The resolver is created_by, so the resolver cannot verify that invoice (403).
- [ ] SQLite-mode resolve returns 403 (local test).
- [ ] Local `pytest tests -q`, frontend `npm run test && npm run typecheck && npm run lint && npm run build`
      pass via ~/.agent-harness/bin/run-logged; CI on the PR passes both jobs, and the log shows the new test ran.
- [ ] `git diff --check` clean, /ponytail-review on the diff with reviewed SHA recorded on the PR.

### Action boundaries
- Proceed with in-scope edits, local tests, commits and pushes to the task branch.
- Stop and ask before: any schema/migration change, any write to the hosted database other than via the
  running app's own endpoints, adding a dependency, deleting files, merging, force-pushing, or sending anything
  to Codex (Codex chats go inside the BOChackthonProject folder in the Codex app).
- Only make changes directly requested. No extra features (no bulk resolve, no supplier creation from this flow).

### Delivery
Open a new issue linked to #18 for phase 2 and claim it (owner, files, branch, checks). Branch from main after
#19 merges, or stack on feat/jinius-auto-sync if #19 is still open, and say which. Open a draft PR with
evidence, update docs/STATUS.md, post a handoff on the issue. Final report: what changed, checks run and
results, what was not checked, decisions waiting for the owner.
```

🎯 Target: Claude Code (Opus 5.5). 💡 Optimized to front-load the locked decisions (hand-applied migration, no password typing, demo adapter as the IBAN source of truth) and to bound phase 2 to one resolution path with binary checks and explicit stop points.

This prompt is for an agentic tool with real system access. Review the scope locks, forbidden actions, and stop conditions before running it. Confirm the file paths, directories, and permissions match the actual project.
