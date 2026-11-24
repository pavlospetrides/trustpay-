# TrustPay AI frontend

Next.js local demo UI for the existing FastAPI backend. Scores, signals and workflow state always come from Python.

When `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are configured, `/app/*` routes require Supabase Auth sign-in at `/login`. The browser sends the user access token and selected organization to FastAPI, which independently validates identity and membership. The publishable key is safe for the browser; the database URL and secret key are server-only. An organization selector appears for users with multiple memberships. The approval queue is at `/app/approvals`, and private invoice evidence can be uploaded from a payment detail page. See [Supabase setup](../docs/supabase-setup.md).

The Crystal interface defaults to the device color scheme until you choose Light or Dark in Settings. That preference is saved in this browser. The floating navigation, supplier profiles, and assessment views all use the same FastAPI records.

## Start (macOS, Windows, Linux)

```bash
npm install
npm run dev
```

`npm run dev` (`scripts/dev.mjs`) provisions the repository-root `.venv` from `requirements.txt` when needed, starts FastAPI on 127.0.0.1:8000 (8001 if 8000 is in use), waits for `/api/health`, then starts Next.js with `TRUSTPAY_API_ORIGIN` set to that port. Ctrl+C stops both; if either process exits, the other is stopped and a `[trustpay] ERROR:` line explains why. Open http://127.0.0.1:3000.

To run FastAPI yourself instead, start it from the repository root and use `npm run dev:web`; set `TRUSTPAY_API_ORIGIN` in `.env.local` if it is not on port 8000 (see `.env.local.example`).

`/api/health` reports `synthetic-local-demo`; `/api/v1/integrations` reports the actual Jinius adapter status. If the API is unavailable, views show a retryable error rather than pretending to have live data. This app never requests or stores Jinius credentials in the browser.

For a production-mode local check, run `npm run build` followed by `npm run start`. Do not host this unauthenticated demo publicly.

## Checks

```powershell
npm run lint
npm run typecheck
npm run test
npm run build
```

Run Python tests from the repository root with `py -m pytest tests -q`.

If a page says the API cannot be reached, read the `npm run dev` terminal for a `[trustpay] ERROR:` line or FastAPI traceback, then confirm the API health URL it printed returns 200. If port 3000 is occupied, stop that process before starting Next.js. The legacy UI remains at `http://127.0.0.1:8000/`.

This UI uses synthetic local records, a mock Jinius adapter, simulated actors and internal decisions. It does not verify bank accounts, run a real AI model, authenticate users, or initiate bank payments.

Visual references: the supplied `references/glassy-dashboard.tsx`, `references/demo.tsx`, and `references/21dev-original-instructions.txt`, plus `design-references/21dev-liquid-glass-checkout.txt` (Nimbus UI, by guglielmogiannattasio.it). The glass layer, measured dock indicator and restrained transition ideas were adapted to real Next routes. The assessment card adapts the liquid card's optical surface and tilt; checkout fields and payment motion are excluded.
