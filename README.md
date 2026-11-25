# TrustPay AI

**Know who you're paying. Before you pay.** TrustPay is a synthetic payment risk review demo built with Next.js 16, Node.js, TypeScript, SQLite, and optional Supabase services. It never initiates bank payments or connects to live Jinius. Scores are deterministic policy priorities, not fraud probabilities.

## Run locally

Install Node.js 24 and run:

```bash
cd frontend
npm ci
npm run dev
```

Open http://127.0.0.1:3000. The same Next.js process serves the Crystal UI and `/api/health` and `/api/v1/*`. Without configuration it creates a local synthetic SQLite database at `data/trustpay.sqlite3`. The demo contains 14 Aegean payment records, a changed-account case scoring 75, a blocked duplicate scoring 100, an amount anomaly scoring 65, and a normal case scoring 0. Local actor actions are simulated. Use **Reset local demo** to restore the fixtures.

For the designated Supabase development mode, copy `frontend/.env.local.example` to `frontend/.env.local`, fill the server and browser settings, and apply the existing SQL migrations. See [Supabase setup](docs/supabase-setup.md). Supabase mode uses authenticated users, tenant-scoped PostgreSQL records, private Storage, and maker-checker approvals. External AI processing is opt-in for synthetic development documents only.

## Checks

```bash
cd frontend
npm run test
npm run typecheck
npm run lint
npm run build
```

`npm run test:e2e` runs the opt-in signed-in Chromium checks against a configured development project. `npm run test:hosted` exercises the hosted API workflow and writes synthetic development records. Use the disposable Supabase CLI stack for `supabase test db` to verify RLS SQL policies.

## Architecture

- `frontend/src/app/api`: native Node.js Next.js Route Handlers, with no backend proxy.
- `frontend/src/lib/server`: SQLite and PostgreSQL repositories, verified Supabase Auth, deterministic risk rules, encryption, private invoice intake, OpenAI adapter, Jinius synthetic adapter, approvals, and audit.
- `supabase/migrations`: existing PostgreSQL schema and RLS policies. The hosted development project's migration history is not reconciled; do not run `supabase db push` there.
- `docs/node-migration-checklist.md`: API matrix and migration verification.

The repository contains no Python runtime or separate backend server. The routes are listed in [API_CONTRACT.md](API_CONTRACT.md); the Route Handlers in `frontend/src/lib/server` are the source of truth. Never commit credentials or use real customer, supplier, invoice, or bank data in this demo.
