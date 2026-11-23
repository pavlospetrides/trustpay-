# Phase 2 security and merge review — 23 November 2026

## Branch and migration order

PR [#9](https://github.com/pavlospetrides/trustpay-/pull/9) merged the initial Supabase/Auth architecture into `main`; PR [#10](https://github.com/pavlospetrides/trustpay-/pull/10) then merged its development setup follow-up. PR [#11](https://github.com/pavlospetrides/trustpay-/pull/11) is based on that merged `main`, is still a **draft**, and has no human review. Its additive `20261123000300_invoice_intake.sql` migration passed on disposable Supabase CI and was applied transactionally to the confirmed synthetic hosted development project. Safe merge order is already #9 → #10 → #11. Merge #11 only after its new head passes CI and a teammate reviews the change; do not force-push or merge the draft automatically.

The hosted development project has no `supabase_migrations.schema_migrations` table because the original schema was applied manually. The current schema works, but `supabase db push` could replay `create table` SQL and fail. Reconcile actual schema with the three checked-in migration files, then use the [official Supabase migration repair workflow](https://supabase.com/docs/reference/cli/supabase-migration-repair) or an approved equivalent before relying on CLI pushes. Do not mark old versions applied merely because their filenames exist.

## Verified boundaries

- The development database and frontend URL contain the same project reference; the database contained only two named synthetic organizations before the Phase 2 migration. Client connections use TLS. Database size was about 12 MB before the browser run; private Storage was empty. The project was active and accepted writes. The actual billing plan, egress use, disk utilization and dashboard quota were not accessible through the configured project credentials, so this is a **partial** capacity check.
- Real password sign-in worked for four new synthetic test roles. The authenticated browser flow used actual FastAPI, PostgreSQL, Supabase Auth and private Storage. Direct Rest API RLS returned the intake for the maker and no row for the outsider; direct Storage returned the PDF for the maker and denied the outsider. FastAPI also denied cross-tenant reads.
- The uploaded changed-account invoice used 14 historical paid records and persisted a score of 75. Direct approval and maker self-verification were denied. A different analyst recorded verification and an approver recorded internal approval. Audit events persisted. No bank transfer was invoked.
- Invalid or mismatched PNG/JPEG bytes now fail decoder validation before Storage or model processing. File size, image pixel count, upload frequency and extraction retries are bounded. Full IBANs remain encrypted in draft storage and masked in risk responses.

## Open security and readiness findings

1. **No live provider proof:** `OPENAI_API_KEY` is absent. A supported vision model (`gpt-5.4-mini`) is configured as the default, but no live extraction or explanation call has run. Only synthetic documents may be used when the key and development-only external-processing flag are enabled. The opt-in provider test is `tests/hosted/test_openai_live.py`.
2. **Human verification is an assertion:** the current independent-verifier action records a text note and distinct actor; it does not prove supplier callback completion or bank account ownership. This is suitable only as a labeled hackathon simulation, not a production control.
3. **Operational controls remain incomplete:** append-only evidence has no approved retention/deletion policy, the private Storage write and database insert are not one atomic transaction, and the 20-per-hour count is not an atomic distributed rate limiter. A storage object could be orphaned if a later database transaction fails. Review, reconciliation, monitoring and cleanup are required for production.
4. **Migration history and quota:** CLI history is absent, and complete plan/usage figures require the Supabase dashboard or a scoped management token. Confirm capacity and project activity on demo day; free projects may pause after inactivity.
5. **No authorized Jinius contract:** official public pages establish integration categories and access routes, but not the invoice endpoint/sandbox contract for this team. `LiveJiniusAdapter` stays disabled and no payment initiation is available. See [Jinius architecture](jinius-integration-architecture.md).

The application is ready for a **synthetic local-to-hosted hackathon demonstration** of invoice review and deterministic risk/approval workflow. It is not ready to claim live OpenAI extraction, live Jinius integration, bank verification, or production payment protection.
