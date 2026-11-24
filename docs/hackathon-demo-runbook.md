# Hackathon demo runbook — synthetic development project

Use only the designated Supabase development project (`dtoqrscbbdacqpaqxgpr`) and fictional invoices. The Phase 2 intake migration was applied transactionally on 23 November 2026 after confirming the database contained only the two known synthetic organizations. It has **no Supabase CLI migration-history table** because the Phase 1 schema was applied manually. Do not run `supabase db push` or replay the earlier migrations against this project until migration history and schema drift are reconciled.

## Start and check

1. Keep `.env` and `frontend/.env.local` untracked. Confirm `TRUSTPAY_BACKEND=postgres`, `TRUSTPAY_ENVIRONMENT=development`, the development project reference in both URLs, and a TLS-required database URL. Never put secret keys or the database URL in `NEXT_PUBLIC_` variables.
2. Run `npm run dev` in `frontend`; it starts FastAPI and Next.js together (Ctrl+C stops both). Open `http://127.0.0.1:3000/login`. `/api/health` should report `supabase-postgres` and `payment_initiation: false`.
3. The ignored `.env.e2e` file holds the hosted-test accounts; copy [.env.e2e.example](../.env.e2e.example), which explains the four personas (maker, verifier, approver, outsider) and the membership each needs. Share passwords privately, never in screenshots, issues, or commits. As of 24 November the team's walkthrough used `boos@gmail.com` (owner, uploads), `analyst@gmail.com` (verifies) and `approver@gmail.com` (approves) in Org A; an Org B-only outsider account is still to be created (see PR #15). `frontend/.env.local` holds only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
4. Install the hosted-test browser once with `.venv/bin/python -m pip install playwright` and `.venv/bin/python -m playwright install chromium` (`npm run dev` creates `.venv`).

## Demonstration

1. Sign in as the synthetic maker. Open **Assess an invoice**, upload a fictional PDF for **Aegean Supplies Synthetic Ltd** with a fresh invoice number, amount EUR 8,420, and a different valid *fictitious* IBAN. The upload proposes fields for human confirmation.
2. Confirm supplier `SUP-001`, save corrections, and click **Analyze risk**. The result should show 14 paid historical records, a changed destination, policy score **75/100**, masked old/new accounts, an evidence explanation, and **Needs review**. The score is a heuristic review priority, not a fraud probability.
3. Try direct approval before verification with the approver account; FastAPI must reject it. The maker must also be denied self-verification. An outsider in the second organization must not read the intake, invoice, or private PDF.
4. Sign in as the separate verifier, record synthetic independent callback evidence, then sign in as the separate approver and record **internal approval**. No payment is sent. The Audit Trail should contain upload, review, analysis, verification, and approval events.
5. Show **Integrations**: Jinius is disconnected. Do not describe the synthetic adapter as a live Jinius integration.

## Repeatable checks

Install Playwright and Chromium with `py -m pip install playwright` and `py -m playwright install chromium`. In PowerShell, run the opt-in browser and policy checks:

```powershell
$env:TRUSTPAY_HOSTED_E2E_CONFIRM = "development"
py -m pytest tests/hosted/test_phase2_browser.py tests/hosted/test_policy_scenarios.py -q -s
Remove-Item Env:TRUSTPAY_HOSTED_E2E_CONFIRM
```

The browser test uses real Auth, Storage, FastAPI, PostgreSQL, and Next.js. The policy test verifies duplicate hard block, clean approval, amount deviation, hold, and no-history warnings. Each run creates new immutable **synthetic** invoices and audit trail entries in the development project. Both use the existing ignored `.env.e2e` accounts. Run the normal Python suite, `npm run test`, `npm run typecheck`, `npm run lint`, and `npm run build` before the demo; PR CI tests migrations and RLS on disposable Supabase.

## AI reader status and fallback

The text-PDF reader works without an external key. Live vision extraction and AI evidence summaries require a server-side `OPENAI_API_KEY`, `TRUSTPAY_AI_EXTERNAL_DOCUMENTS=development`, and `TRUSTPAY_AI_MODEL=gpt-5.4-mini` in the ignored `.env`, followed by a FastAPI restart. Only synthetic invoices may be submitted to the external provider in this development project. If the service is unavailable, text PDFs fall back to local extraction and the policy explanation remains available; image/scanned-PDF fields require manual entry or retry. Do not claim a live AI call until one succeeds and is recorded.

## Known limits

The project is reachable and had about 12 MB of PostgreSQL data and no Storage objects before the browser test, well below Supabase's [Free database-size allowance](https://supabase.com/docs/guides/platform/billing-on-supabase). The dashboard billing plan, monthly egress, and full quota could not be read from the configured database credentials; check them in the project dashboard before the event. [Free projects can pause after low activity](https://supabase.com/docs/guides/platform/free-project-pausing), so check health on demo day. The human verification note is a recorded assertion, not independent bank ownership proof. Jinius access, real payment initiation, production retention, and formal security review remain out of scope for this demo.
