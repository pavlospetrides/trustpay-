# TrustPay frontend and API

This directory is the complete Node.js and TypeScript application. Next.js serves the Crystal interface and native Route Handlers from one process.

Requires Node.js 24.11.1 or newer within the 24.x line. The local demo uses the built-in `node:sqlite` module. On Windows, stop `npm run dev` before reinstalling dependencies with `npm ci` so installed PDF binaries are not locked.

```bash
npm ci
npm run dev
```

Open http://127.0.0.1:3000 and check http://127.0.0.1:3000/api/health. The default SQLite mode contains synthetic records and simulated actors. No Python, Uvicorn, second port, or proxy is used.

For authenticated Supabase development, copy `.env.local.example` to `.env.local` and supply the settings described in [Supabase setup](../docs/supabase-setup.md). All private credentials stay server-side. The browser uses only the publishable key and passes a user access token; the server verifies identity and organization membership on each request. Invoice originals stay in private Storage. Payment initiation and live Jinius calls are disabled.

The optional invoice OCR candidate is selected with `TRUSTPAY_INVOICE_READER=ocr` for synthetic development invoices. Its English and Greek language files install through npm and are read locally; there is no OCR runtime download. The default remains OpenAI Vision. See the [evaluation](../docs/invoice-ocr-evaluation.md) for measured accuracy, time, cost and limitations.

## Verification

```bash
npm run test
npm run typecheck
npm run lint
npm run build
```

With a configured designated development project and the server running on port 3000, `npm run test:hosted` runs the full API workflow, and `npm run test:e2e` runs signed-in Chromium flows. Set `TRUSTPAY_E2E_BASE_URL` to target another local port. These tests create synthetic development records. Do not run them against production. The OpenAI adapter is opt-in; the synthetic 14-document live evaluation is recorded in [invoice reader evidence](../docs/invoice-ocr-evaluation.md). The designated project's egress quota currently blocks signed-in browser verification.

The Crystal appearance and navigation are unchanged. Theme choice is saved in the browser. Local records are fictional and local approvals are simulated. Supabase mode stores actual authenticated review decisions but never sends money.
