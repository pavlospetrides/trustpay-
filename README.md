# TrustPay AI — Working Hackathon MVP v0.1

**Know who you're paying. Before you pay.**

A runnable full-stack proof of concept for the **Bank of Cyprus Fintech Hackathon 7.0 (27–29 November 2026)**, targeting payment history intelligence and eventual Jinius API integration.

> [!IMPORTANT]
> **LOCAL SYNTHETIC DEMO ONLY.** No bank verification, real Jinius API calls, AI model, fraud-probability calibration or payment transfers. All suppliers and identifiers are fictional. Do not import real customer, supplier, bank or invoice data into this build.

## Start on Windows

**Recommended demo UI:** run the existing FastAPI service and the new Next.js frontend in separate PowerShell terminals:

```powershell
# Terminal 1, from repository root
py -m pip install -r requirements.txt
py -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

```powershell
# Terminal 2, from repository root
cd frontend
npm install
npm run dev
```

Open **http://127.0.0.1:3000**. See [frontend/README.md](frontend/README.md) for checks and troubleshooting. The original `web/` interface remains available at port 8000 for rollback. This is an unauthenticated synthetic local demo; never deploy it publicly.

The Crystal UI uses a light or dark appearance chosen in `/app/settings` and saved in the browser. Supplier profiles are available at `/app/suppliers/[id]`; both profiles and assessments read the existing FastAPI API.

### Legacy UI

Install Python 3.11+ (ensure Python is in PATH). Then extract this ZIP, open PowerShell in the project directory and run:

```powershell
py -m pip install -r requirements.txt
.\run_windows.bat
```

Open **http://127.0.0.1:8000** in your browser.

Alternative manual start:

```powershell
py -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

## Start on macOS / Linux

```bash
python3 -m pip install -r requirements.txt
./run.sh
```

Open **http://127.0.0.1:8000**. Backend API docs are at **http://127.0.0.1:8000/docs**.

> Do **not** open `web/index.html` with `file://` — the interface requires the running backend.

## Run tests

```bash
python -m pytest tests -q
```

**Validation:** 17 automated tests passed in the development environment, covering risk logic, hard blocks, API validation, assessment creation, persistence, audit events and simulated verification/approval.

## Try the 4 demo scenarios

1. **Changed destination:** Aegean Supplies; 14 historical payments to `SYNTHETIC-CY-1842`; new invoice requests `SYNTHETIC-CY-9077`. Server produces score 75 and requires independent verification evidence before approval.
2. **Paid-invoice duplicate:** Meridian Office invoice `MO-2128` already appears in paid supplier history. Server produces score 100, hard-blocking both verification and approval.
3. **Amount anomaly:** Kastro Maintenance invoice €14,900 vs historical median near €4,960. Server produces score 65 and requires supporting evidence before approval.
4. **Normal invoice:** Palm Tree Logistics; same account and typical amount. Server produces score 0; still requires a human demo approval.

Select **New assessment** to enter a custom synthetic invoice. The server checks it against stored supplier history and saves the result. Click **Audit Trail** to see persistent demo event records. The **Reset demo** button recreates the original synthetic data and clears demo changes.

## Project structure

```text
trustpay-ai-mvp/
├── app/
│   ├── main.py        # FastAPI endpoints and validation
│   ├── database.py    # SQLite storage, transitions and audit
│   ├── risk.py        # Pure deterministic risk engine
│   ├── fixtures.py    # Synthetic supplier/payment histories
│   └── jinius.py      # Typed normalization interface, mock adapter
├── web/
│   ├── index.html     # Responsive dashboard
│   └── app.js         # Browser client of the backend API
├── tests/
│   ├── test_risk.py
│   └── test_api.py
├── docs/
│   ├── ARCHITECTURE.md
│   └── JINIUS_OPEN_DAY.md
├── requirements.txt
├── run.sh
└── run_windows.bat
```

SQLite database is automatically created at `data/trustpay.sqlite3` when the app starts; it is excluded from the distributed ZIP.

## Current API surface

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | Confirm synthetic/demo mode and disabled payments |
| GET | `/api/v1/invoices` | Read assessed invoices with masked account identifiers |
| POST | `/api/v1/invoices/assess` | Assess and persist new synthetic invoice |
| GET | `/api/v1/invoices/{id}` | Read assessment, evidence and workflow state |
| POST | `/api/v1/invoices/{id}/verify` | Record simulated independent verification evidence |
| POST | `/api/v1/invoices/{id}/approve` | Record finance-manager approval if server permits |
| POST | `/api/v1/invoices/{id}/hold` | Hold unresolved case |
| GET | `/api/v1/suppliers` | Supplier-specific history summary |
| GET | `/api/v1/audit` | Audit actions from the SQLite store |
| GET | `/api/v1/integrations` | Explicit mock/disconnected status |
| POST | `/api/v1/demo/reset` | Delete and reseed local demo data |

No bank transfer endpoint exists.

## Why the risk engine is explainable

It compares the invoice against prior paid invoices **for the same supplier**. Checks include:

- **Exact paid-invoice duplicate** (case-insensitive invoice reference) → +100 and **hard block**.
- **Destination account changed** vs most frequent historical account → +75.
- **Amount ≥2.5× historical median** (at least 3 historic payments) → +65.
- **Amount ≥1.75× historical median** → +40.
- **No historical supplier payments** → +45.

Scores are capped at 100 and represent **review priority only**. They are not estimated likelihoods of fraud. Account comparison is normalization of strings, not proof of IBAN ownership.

The risk engine never asks a language model to make the payment authorization decision. AI-assisted document extraction and grounded explanations can be added later, *without* moving the server-side payment gate into an LLM.

## Jinius integration

`app/jinius.py` defines a normalized invoice interface plus `DemoJiniusAdapter`. **LiveJiniusAdapter deliberately refuses execution** because no official hackathon API contract/credentials were supplied. Do not guess URLs or endpoint payloads. Confirm API scope with organizers (see `docs/JINIUS_OPEN_DAY.md`), then add a credential-safe server-side connector with read-only access first. Expose source and sync timestamps on screen to prove actual API use during the competition.

Useful references:
- https://bochackathon.net/en/
- https://business.jinius.com.cy/services/
- https://help.jinius.com.cy/hc/en-us/articles/4502003249041-What-is-Remittance-Management-and-how-does-it-work

## Production blockers (intentionally NOT solved)

- No authentication, real user identity, authorization, tenant RLS or trusted role assertions. Demo actor labels are fixed and **not** proof of actual maker-checker separation.
- No encrypted secrets manager, production audit immutability, GDPR data-retention process, threat model or penetration testing.
- No bank account ownership verification or sanctioned payment execution.
- Demo reset and approval endpoints are accessible to localhost callers; **never host this publicly** before implementing real authentication, authorizations, and infrastructure controls.
- SQLite is a local single-instance persistence mechanism, not a production multi-tenant database.
- No live AI integration or ML fraud performance benchmarks.

**Use this project as a hackathon codebase foundation, not a deployable banking system.**
