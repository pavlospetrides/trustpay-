# Existing TrustPay MVP FastAPI Contract (reference for Codex)

Source of truth: `app/main.py` and `app/database.py` in the actual existing repo.

| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | synthetic-local-demo, no bank transfers |
| GET | `/api/v1/invoices` | invoices with masked accounts, risk, signals, workflow |
| GET | `/api/v1/invoices/{id}` | invoice detail |
| POST | `/api/v1/invoices/assess` | creates assessment using the same Python risk engine |
| POST | `/api/v1/invoices/{id}/verify` | requires 12+ chars evidence note; simulated verification |
| POST | `/api/v1/invoices/{id}/approve` | server-controlled simulated internal approval |
| POST | `/api/v1/invoices/{id}/hold` | hold, if status permits |
| GET | `/api/v1/suppliers` | summary supplier data |
| GET | `/api/v1/audit` | persistent local audit events |
| GET | `/api/v1/integrations` | explicit Jinius mock/disconnected status |
| POST | `/api/v1/demo/reset` | resets synthetic local database |

Important: the bank account fields on invoice read endpoints are **masked**. UI needs no raw historical bank credentials. The amount input uses integer cents on write. Missing real authentication; do not assume frontend can enforce actual roles. Actual verification step is a *simulated evidence record*.

Four demo invoice IDs: `INV-2409` changed account, `INV-2410` paid duplicate, `INV-2411` amount outlier, `INV-2412` normal.
