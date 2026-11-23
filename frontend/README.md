# TrustPay AI frontend

Next.js local demo UI for the existing FastAPI backend. Scores, signals and workflow state always come from Python.

The Crystal interface defaults to the device color scheme until you choose Light or Dark in Settings. That preference is saved in this browser. The floating navigation, supplier profiles, and assessment views all use the same FastAPI records.

## Windows PowerShell

From the repository root, use two terminals.

```powershell
# Terminal 1
py -m pip install -r requirements.txt
py -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

```powershell
# Terminal 2
cd frontend
npm install
npm run dev
```

Open http://127.0.0.1:3000. The Next.js rewrite sends `/api/*` to FastAPI. `TRUSTPAY_API_ORIGIN` may be set in `.env.local` if the API uses a different local port; see `.env.local.example`. Restart Next.js after changing it.

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

If a page says the API cannot be reached, confirm `http://127.0.0.1:8000/api/health` works and both processes are running. If port 3000 is occupied, stop that process before starting Next.js. The legacy UI remains at `http://127.0.0.1:8000/`.

This UI uses synthetic local records, a mock Jinius adapter, simulated actors and internal decisions. It does not verify bank accounts, run a real AI model, authenticate users, or initiate bank payments.

Visual references: the supplied `references/glassy-dashboard.tsx`, `references/demo.tsx`, and `references/21dev-original-instructions.txt`, plus `design-references/21dev-liquid-glass-checkout.txt` (Nimbus UI, by guglielmogiannattasio.it). The glass layer, measured dock indicator and restrained transition ideas were adapted to real Next routes. The assessment card adapts the liquid card's optical surface and tilt; checkout fields and payment motion are excluded.
