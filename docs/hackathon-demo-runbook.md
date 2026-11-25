# Synthetic hackathon demo runbook

1. From `frontend`, run `npm ci` and `npm run dev`. Open http://127.0.0.1:3000. `/api/health` reports local synthetic mode or `supabase-postgres`; `payment_initiation` is always false.
2. For authenticated mode, configure `frontend/.env.local` and the designated Supabase development project as in [Supabase setup](supabase-setup.md). Sign in as an owner or analyst in organization A.
3. Upload the synthetic PDF fixture from `frontend/src/lib/server/invoices/fixtures/synthetic-invoice.pdf`, review the proposed fields, select Aegean Supplies Synthetic Ltd, and analyze. Its changed destination scores 75 after comparison with 14 paid historical records.
4. Show that approval is unavailable before independent verification and that the invoice creator cannot verify it. Sign in as a separate analyst and record synthetic callback evidence. Sign in as a distinct approver and record the internal decision. Open Audit trail. No money is sent and the callback is not proof of account ownership.
5. Sign in as a member of organization B and confirm that organization A's invoice and private document are inaccessible. The opt-in `npm run test:hosted` script checks tenant API boundaries and `npm run test:e2e` runs the browser flow with four configured synthetic personas. Both create synthetic development records.
6. For a local SQLite presentation without Auth, use the four seeded demo scenarios and simulated roles. The **Reset local demo** action reseeds only the local SQLite database.

The text PDF reader needs no external AI key. Vision extraction and optional evidence summaries use the official OpenAI JavaScript SDK only when the development opt-in settings are enabled. A live OpenAI call has not been verified. Jinius is a labeled synthetic adapter; real access awaits official sandbox documentation and credentials.
