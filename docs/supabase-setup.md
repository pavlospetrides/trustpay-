# Supabase development setup

Use a **dedicated development project** or local Supabase stack. Do not run these commands against a shared or production database. The migrations are additive and are not applied automatically by FastAPI. GitHub Actions applies the migrations and runs pgTAP plus API integration against a disposable local Supabase stack on the feature PR.

## 1. Prepare a local stack or designated development project

Install the [Supabase CLI](https://supabase.com/docs/guides/local-development) and Docker for local development. From the repository root:

```powershell
npx supabase start
npx supabase db reset --no-seed
npx supabase test db
```

`supabase/config.toml` disables automatic seed execution. The `db reset` command is destructive to the **local** stack; use it only for a disposable local instance. The pgTAP suite lives at `supabase/tests/database/tenant_policies_test.sql`. For a remote development project, first confirm its project reference and migration history, then run `npx supabase link --project-ref <DEV_PROJECT_REF>` and `npx supabase db push`. Do not run `db reset` remotely.

The configured hosted development project has the application schema, but its `supabase_migrations.schema_migrations` table was absent when checked. Reconcile the existing schema with the CLI migration history before a future `db push`; do not replay `create table` migrations into an already populated database.

## 2. Set server-only configuration

Copy `.env.example` to `.env` and set `TRUSTPAY_BACKEND=postgres`, `TRUSTPAY_DATABASE_URL`, `SUPABASE_URL`, and `SUPABASE_PUBLISHABLE_KEY`. Supply a server-only `SUPABASE_SECRET_KEY` for private document storage. A legacy `SUPABASE_SERVICE_ROLE_KEY` is also accepted. Never add the secret key, PostgreSQL URL, or account keys to `frontend/.env.local` or any `NEXT_PUBLIC_` variable.

Generate **two distinct random 32-byte keys** and base64-encode each for `TRUSTPAY_IBAN_ENCRYPTION_KEY` and `TRUSTPAY_IBAN_FINGERPRINT_KEY`. For example, run this command twice and paste each result into a different variable in the untracked `.env` file:

```powershell
py -c "import base64,secrets; print(base64.b64encode(secrets.token_bytes(32)).decode())"
```

The PostgreSQL URL must point to the same development project's database and use TLS for remote connections. `.env` is loaded automatically by FastAPI; existing shell variables take precedence. A missing configuration fails startup, and a live database outage returns an error rather than synthetic data.

Copy `frontend/.env.local.example` to `frontend/.env.local` and set only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to the same project's public values. The frontend sends a user access token and selected organization ID to FastAPI; FastAPI validates both. Restart Next.js after changing these values.

## 3. Create Auth users and explicit synthetic data

Create at least two **development Auth users** in the Supabase dashboard: an owner or analyst to verify and a different approver to approve. Memberships use their `auth.users.id` UUIDs. Set `TRUSTPAY_DEMO_OWNER_ID` in `.env` to the first user's ID. For a complete demo, set `TRUSTPAY_DEMO_ANALYST_ID` and `TRUSTPAY_DEMO_APPROVER_ID` to two distinct user IDs before running the seed script. Set `TRUSTPAY_ENVIRONMENT=development` and `TRUSTPAY_SEED_CONFIRM=development`, then run:

```powershell
py -m supabase.seed
```

The script checks for a real Auth user and refuses unexpected data in the fixed synthetic organization. `supabase/seed.sql` has its own explicit-session guard. It creates two fictional organizations, five fictional suppliers in the primary organization, a sixth in another organization, 45 historical payment records including 14 for one supplier, and five invoices: changed account, paid duplicate, unusual amount, normal, and no history. Synthetic IBANs have a valid checksum and a fictitious bank code. Seed data never runs on app startup.

## 4. Run and verify

```powershell
py -m pip install -r requirements.txt
py -m uvicorn app.main:app --host 127.0.0.1 --port 8000
cd frontend
npm install
npm run dev
```

Open `http://127.0.0.1:3000/login`. Sign in with an Auth user linked to the synthetic organization. Review the five seeded invoices, verify the changed account with a separate human actor, then approve with the distinct approver. The API health route reports `supabase-postgres`. The Crystal UI uses real persisted API responses; it does not read PostgreSQL or hold a service key in the browser.

Run `py -m pytest tests -q`, `npm run test`, `npm run typecheck`, `npm run lint`, and `npm run build`. On an **explicitly disposable** migrated Supabase database, set `TRUSTPAY_TEST_DATABASE_URL` and `TRUSTPAY_TEST_CONFIRM=disposable`, then run `py -m pytest tests/rls/test_postgres_api.py -q`. The integration test writes synthetic data and must not target a shared project. Run `npx supabase test db` on a local stack for RLS.

If Auth has no organization membership, the workspace shows an error. If more than one membership exists, the organization selector in the header switches context; the server still verifies that membership. If storage is not configured, document upload returns an explicit error.
