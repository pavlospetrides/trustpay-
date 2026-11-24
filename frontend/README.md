# TrustPay frontend and API

This directory is the complete Node.js and TypeScript application. Next.js serves the Crystal interface and native Route Handlers from one process.

```bash
npm ci
npm run dev
```

Open http://127.0.0.1:3000 and check http://127.0.0.1:3000/api/health. The default SQLite mode contains synthetic records and simulated actors. No Python, Uvicorn, second port, or proxy is used.

For authenticated Supabase development, copy `.env.local.example` to `.env.local` and supply the settings described in [Supabase setup](../docs/supabase-setup.md). All private credentials stay server-side. The browser uses only the publishable key and passes a user access token; the server verifies identity and organization membership on each request. Invoice originals stay in private Storage. Payment initiation and live Jinius calls are disabled.

## Verification

```bash
npm run test
npm run typecheck
npm run lint
npm run build
```

With a configured designated development project and the server running on port 3000, `npm run test:hosted` runs the full API workflow, and `npm run test:e2e` runs signed-in Chromium flows. Set `TRUSTPAY_E2E_BASE_URL` to target another local port. These tests create synthetic development records. Do not run them against production. The OpenAI adapter is opt-in and has mocked unit tests; no live OpenAI result is claimed.

The Crystal appearance and navigation are unchanged. Theme choice is saved in the browser. Local records are fictional and local approvals are simulated. Supabase mode stores actual authenticated review decisions but never sends money.
