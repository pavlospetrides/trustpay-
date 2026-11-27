# TrustPay API contract

Source of truth: the Next.js route handler `frontend/src/lib/server/api/handler.ts`, with `database/demo-store.ts` (SQLite demo) and `database/postgres-store.ts` (PostgreSQL mode). `frontend/src/lib/server/parity/python-parity.test.ts` pins these responses to those of the former Python backend. Protected endpoints require `Authorization: Bearer <Supabase access token>` and, for a user in multiple organizations, `X-Organization-Id: <membership UUID>`. The backend validates the token with Supabase Auth and verifies active organization membership on every request. SQLite mode keeps its existing unauthenticated synthetic contract.

| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | Reports `synthetic-local-demo` or `supabase-postgres`; no bank transfers |
| GET | `/api/v1/invoices` | invoices with masked accounts, risk, signals, workflow |
| GET | `/api/v1/invoices/{id}` | invoice detail |
| POST | `/api/v1/invoices/assess` | creates assessment using the same deterministic TypeScript risk engine |
| POST | `/api/v1/invoices/{id}/verify` | requires 12+ chars evidence note; simulated verification |
| POST | `/api/v1/invoices/{id}/approve` | server-controlled simulated internal approval |
| POST | `/api/v1/invoices/{id}/hold` | hold, if status permits |
| GET | `/api/v1/suppliers` | summary supplier data |
| GET | `/api/v1/audit` | persistent local audit events |
| POST | `/api/v1/accounting/review` | stateless accounting review of invoice amounts: arithmetic, Cyprus VAT rates and treatment, expense category, draft journal entry. Stores nothing; see [docs/accounting-review.md](docs/accounting-review.md) |
| GET | `/api/v1/integrations` | explicit Jinius mock/disconnected status; in PostgreSQL mode, last sync run and rows waiting for human review |
| POST | `/api/v1/integrations/jinius/sync` | owner/admin only, PostgreSQL mode; imports the synthetic Jinius demo feed once per record |
| POST | `/api/v1/integrations/jinius/imports/{external_id}/{revision}/resolve` | owner/admin/analyst, PostgreSQL mode; body `{supplier_id}` assigns an existing supplier to an unknown-supplier import and assesses it once |
| GET | `/api/v1/me/organizations` | list active organizations for the signed-in user in PostgreSQL mode |
| GET | `/api/v1/invoices/{id}/documents` | list private invoice document metadata |
| POST | `/api/v1/invoices/{id}/documents` | authorized PDF/PNG/JPEG upload, 10 MB maximum |
| GET | `/api/v1/invoices/{id}/documents/{document_id}` | authorized private download |
| POST | `/api/v1/demo/reset` | resets synthetic local database |

Important: the bank account fields on invoice read endpoints are **masked**. UI needs no raw historical bank credentials. The amount input uses integer cents on write. PostgreSQL mode verifies Supabase Auth and organization membership on the server for each protected request; SQLite mode is an unauthenticated synthetic demo. The verification step records human evidence, but does not verify bank account ownership.

Four demo invoice IDs: `INV-2409` changed account, `INV-2410` paid duplicate, `INV-2411` amount outlier, `INV-2412` normal.
