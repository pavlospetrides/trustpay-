# Supabase development setup

Use a designated development project or a disposable local Supabase stack. The application starts in local SQLite mode without Supabase.

## Schema and test data

The SQL schema and RLS policies remain in `supabase/migrations/`; the pgTAP suite is `supabase/tests/database/tenant_policies_test.sql`. For a **disposable local** stack, install the Supabase CLI and Docker, then run from the repository root:

```bash
supabase start
supabase test db
```

The hosted development schema was applied manually and has no reconciled CLI migration history. **Do not run `supabase db push` against that project.** Do not reset, migrate, or seed a shared or production project. The optional `supabase/seed.sql` contains a session guard and only synthetic fixture data; it is never run at application startup. Set `trustpay.allow_synthetic_seed=development` only for an explicitly disposable or designated development database and create Auth users and memberships separately.

For the designated hosted development project's 14-payment Aegean fixture, run `node scripts/seed-hosted-demo-history.mjs` from `frontend` to inspect the dry run, then add `--apply` to insert the synthetic history. The script requires `TRUSTPAY_ENVIRONMENT=development`, verified PostgreSQL TLS, and exactly one staffed organization named as a demo or synthetic organization. It preserves existing rows, refuses non-fixture paid history, and can be run again without duplicating the 14 payments. It never runs during app startup and does not create Auth users or send payments.

## Configure one Next.js process

Copy `frontend/.env.local.example` to `frontend/.env.local`. Set `TRUSTPAY_BACKEND=postgres`, the connection URL, Supabase URL and keys, two existing base64 IBAN keys, and the public browser values. `NEXT_PUBLIC_*` variables contain only the Supabase URL and publishable key. The database URL, secret key, encryption keys, and OpenAI key stay server-side. Preserve the existing encryption and fingerprint keys to read prior ciphertext.

For the hosted Supabase pooler, download the project's CA certificate from the Supabase dashboard and set `TRUSTPAY_DATABASE_CA_CERT_PATH` to its absolute path. PostgreSQL TLS verifies the certificate; no unverified fallback is used. The database URL and Auth/Storage URL must target the same development project.

For new synthetic keys, generate two distinct base64 values with Node.js:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Only enable external OpenAI document processing with `TRUSTPAY_ENVIRONMENT=development`, `TRUSTPAY_AI_EXTERNAL_DOCUMENTS=development`, and a server-only `OPENAI_API_KEY`. Without these, local PDF text extraction and human review remain available.

```bash
cd frontend
npm ci
npm run dev
```

Open http://127.0.0.1:3000/login. `/api/health` reports `supabase-postgres`. The browser sends a Supabase access token; the server verifies the user and membership on each request. The organization header only selects among verified memberships. Invoice files stay in the private `invoice-documents` bucket.

## Checks

Run `npm run test`, `npm run typecheck`, `npm run lint`, and `npm run build` from `frontend`. With four synthetic Auth personas and a running development server, set the `TRUSTPAY_E2E_*` variables in `.env.local`, then run `npm run test:e2e` and `npm run test:hosted`. These opt-in checks write synthetic records. The maker must be owner/admin/analyst, verifier a distinct owner/admin/analyst, approver a distinct owner/admin/approver, and outsider a member of another organization only. Run `supabase test db` on a disposable local stack for RLS policy checks.
