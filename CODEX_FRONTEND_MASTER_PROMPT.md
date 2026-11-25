> Historical prompt from before the Node.js migration (#14). The Python/FastAPI backend it mentions no longer exists; the API now runs as Next.js route handlers in `frontend/src/lib/server`.

# CODEX MASTER TASK — TrustPay AI Premium Frontend v1

You are the senior Next.js / React product engineer and UX architect for TrustPay AI. IMPLEMENT this task end-to-end IN THIS REPOSITORY, not merely propose a design. Make it beautiful, coherent, real, and demo-ready for a fintech hackathon. Use the two user-supplied 21.dev components as design/motion reference and adapt their actual code where fit. Do not use boilerplate shadcn dashboard aesthetics in place of the requested distinctive UI.

## 0. Existing code, starting state, and key boundaries

- The working project is the repository you are currently in. First inspect its actual files, package manifests, Python backend, current tests, docs and README. If you see `app/main.py`, `app/database.py`, `app/risk.py`, `app/fixtures.py`, `app/jinius.py`, and `web/`, THIS IS THE EXISTING TrustPay MVP v0.1. Preserve it.
- Existing backend: Python 3.11+, FastAPI, SQLite, deterministic payment-risk scoring. Backend is the SINGLE SOURCE OF TRUTH for risk score, signals, workflow state and audit events. Do not implement a parallel JS risk algorithm. Do not migrate or replace the Python service as part of this frontend task.
- This is a synthetic **LOCAL DEMO ONLY**: no live Jinius credentials/connection, no verified bank ownership, no real AI/ML model, no payment initiation. Keep this visible, particularly under integrations and at each critical decision point. Never pretend that a payment was executed or verified with a bank.
- No real financial/credit card details, CVC, customer PII, bank API tokens or secrets are needed. Do not enable public deployment of this unauthenticated demo. Do not add fabricated security certifications, customers, monetary savings, compliance badges, or live integrations.
- IMPORTANT: The user's original 21.dev component source lives at:
  1. `design-references/21dev-glassy-dashboard.txt`
  2. `design-references/21dev-liquid-glass-checkout.txt`
  Read BOTH completely before coding. These are original reference snippets with implementation instructions, component source, and demo usage. They are not already integrated. Preserve proper attribution/license requirements if the origin requires it.
- Keep scope disciplined; deliver a working polished app before adding optional flourishes. Do not just paste original demos as-is, especially their sample ecommerce metrics, prices in USD, stock background imagery, or Nimbus card checkout forms.

## 1. Tech / project setup

- If a `frontend/` app does not exist, create `frontend/` using a maintainable Next.js App Router + React + strict TypeScript + Tailwind CSS + ESLint setup. Use a shadcn-compatible project and component structure (`src/components/ui/` or `/components/ui/` consistent with the actual tsconfig alias and `components.json`). Do not create a second app if one already exists; use its conventions and avoid unnecessary upgrades.
- Use `lucide-react`; use the reference dependencies `gsap`, `@gsap/react`, `@fontsource-variable/manrope` where useful and compatible. Install dependencies through the package manager already used by repo; avoid needless packages and avoid uncapped dependency additions.
- Most frontend UI components will be React Client Components only where interactive. Prefer server components for noninteractive shells as appropriate. Split components properly; do not embed a 1,400-line single-page monolith. Keep animation code isolated and clean up requestAnimationFrame/observers/listeners.
- Run FastAPI separately on `127.0.0.1:8000`; Next.js dev on `127.0.0.1:3000`. Add Next.js rewrites/proxy for `/api/health` and `/api/v1/:path*` → the local FastAPI service (default origin `http://127.0.0.1:8000`), ideally using a server-only environment variable (`TRUSTPAY_API_ORIGIN`) in Next config. Avoid insecure permissive CORS and never expose API keys in `NEXT_PUBLIC_*`.
- Keep legacy `web/` functional for rollback but make the new Next frontend the recommended demo UI. Do not break Python tests or existing endpoints.
- Provide `.env.local.example`, `frontend/README.md`, and root README updates with robust Windows PowerShell launch steps and troubleshooting.

## 2. Product identity and brand

Name: **TrustPay AI**
Tagline: **Know who you're paying. Before you pay.**
Product: B2B payment-trust, supplier history, invoice and risk-intelligence SaaS; the FIRST customer is an SME accountant/finance manager.

Visual direction: distinctively premium, elegant, minimalist fintech; dark-first refined glassmorphism, optional beautiful light theme. Palette proposal: deep midnight navy `#071522`, raised `#102334`, cyan `#6CDDE3`, emerald `#11B99A`, ink `#EDF5F5`, low-key amber for review and calibrated rose/red for blocked. Transform from original beige/glassy lifestyle scene to calm financial-product style. Use purposeful backgrounds (subtle gradient mesh/grid) instead of unrelated photos. Charts and tables must have readable solid-ish panels and correct semantic colors; do not overblur dense data. Clean Manrope typography, restrained motion, high spacing discipline and hierarchy. Layout should look like a professionally designed, paid SaaS app, not a clone of the 21.dev original.

Maintain accessibility and performance: WCAG AA-level contrast, readable data, tabular-nums on money, focus visibility, keyboard navigation, labels, reduced motion, reduced transparency, touch targets ~44px, mobile at 375px, tablet 768px and desktop ≥1280px. Mobile navigation should remain usable. Preserve reasonable scroll, no full-viewport trapped scrolling and no horizontal overflow. All essential info available without animation/WebGL.

## 3. How to adapt the two supplied 21.dev references

**A. Glassy Dashboard** (`21dev-glassy-dashboard.txt`)
- Take its glass treatment, panel hierarchy, dock/navigation concept, GSAP transitions, layout craft, interactive chart feel and light/dark foundation.
- Extract/restructure reusable components rather than shipping one huge generic component. Suggested: `TrustPayShell`, `GlassPanel`, `GlassNav`, `MetricTile`, `RiskBadge`, `PaymentsTable`, `RiskDistributionChart`, `ActivityFeed`, `InvoiceReviewDrawer`, `ThemeToggle`, `EmptyState`, `Toast`.
- Remove ATLAS branding, ecommerce KPIs (`revenue`, `orders`, `refunds`, `visitors`, etc.), fake USD data, Stripe/HubSpot/Shopify examples, demo fake buttons, and photo-based lifestyle styling. Replace EVERY visible example with actual TrustPay business context.
- When charts use period filters, calculate from available backend data; if the backend does not expose time-series/history sufficient for a trustworthy chart, use a clearly labeled synthetic visualization with documented limitations or choose an actually supported breakdown. Avoid manufactured trend claims, percentages or "€ saved" metrics.
- Navigation must use legitimate Next.js routes, not the snippet's location.hash navigation, and must preserve back/forward, query/filter state when practical.

**B. Liquid Glass Checkout** (`21dev-liquid-glass-checkout.txt`)
- This reference literally captures card number/name/expiry/CVC and offers a "Pay" button, animated liquid card and WebGL water/glass shader. That is NOT the TrustPay product's workflow. DO NOT collect card details, CVC, payment methods, or show fake successful money transfers.
- Reuse its remarkable dynamic **liquid glass / water-drop / 3D tilt / success** design language as an adapted, optional, lazy-loaded **Trust Assessment Card** / **Payment Trust Flow** within the invoice detail page, and possibly as a lightweight hero visual. Replace literal credit card visuals (chip, VISA, expiry, CVC) with invoice supplier/amount, trust score, risk state and verified/held indicators. Change button semantics to `Analyze invoice`, `Record verification`, `Approve internally (demo)`, `Place on hold`. The animation should show **risk analysis/approval state**, NOT a transfer being paid.
- Instead of the original `onPay` callback, wire a typed flow that invokes the existing FastAPI operations. No success animation until API confirms the specific state transition; no pretend bank confirmation. Status text should say "Internal approval recorded — no payment sent" when approved.
- Make WebGL truly optional and avoid GPU-heavy continuous rendering; lazily load, pause offscreen, respect reduced motion, have a CSS-only fallback, and provide a clear textual result. No raw checkout form allowed anywhere in this MVP.

## 4. Information architecture — implement the actual routes

A minimal public `/` welcome/landing page, showing brand, product claim, simple visual narrative and CTA "Open TrustPay Demo"; no fabricated testimonials, logos, pricing, live-API claims. App shell lives under `/app`.

- `/app/overview`: high-quality operational landing dashboard with stats DERIVED from `/api/v1/invoices`, critical queue, recent audit, quick "Assess invoice", risk breakdown, integrations badge, scenario selector if useful.
- `/app/payments`: searchable, sortable, status/risk-filterable list of invoices/assessments; show invoice, supplier, amount, risk score, reason, workflow status, source. Row click opens valid detail route. Proper empty/loading/error states.
- `/app/payments/[id]`: the centerpiece: beautifully engineered investigation view with Trust Assessment Card, score, rules/signals, previous masked account vs new masked account, historical payment count, supplier context, detailed evidence, steps with explicit 1) risk check 2) independent verification 3) approval. Buttons wired to real API with confirmed success/error, disabled impossible states and server error handling. Any `blocked` duplicate MUST remain blocked; never allow client bypass. In this local demo the role is simulated; label it as such.
- `/app/payments/new`: accessible invoice assessment form with supplier dropdown, invoice reference, positive amount in EUR, synthetic payment account identifier and date; validate input; convert EUR to `amount_cents` carefully; POST to backend; navigate to created detail. Provide sample values and warnings to use only synthetic data.
- `/app/suppliers`: supplier directory and history summary from actual `/api/v1/suppliers` response, and contextual link to matching invoices. Show masked canonical account and count/median. No unsupported supplier editing.
- `/app/insights`: risk distribution, anomaly signal counts, exceptions, and pipeline steps derived from actual invoice data. Honest limitations if backend lacks aggregates/time series.
- `/app/integrations`: real `/api/v1/integrations` status with Jinius explicitly "Mock / disconnected", future connection contract and clear payment initiation disabled. No fake Connect button. Show architecture/flow cleanly.
- `/app/audit`: audit entries from `/api/v1/audit`, searchable/filterable, actor/title/action/timestamp; clearly labeled as local demo, resettable. Reset demo only through explicit destructive confirmation hitting `/api/v1/demo/reset`, then refresh/revalidate all necessary views.
- Provide functional theme toggle, intuitive mobile nav, responsive layouts, actionable status notifications or toasts; keyboard accessible dialogs. Every exposed button/nav item must do something honest; remove unfinished dead UI.

Core presentation flow MUST work with the actual seeded records:
1. Changed account: invoice `INV-2409` / Aegean Supplies (€8,420), account change vs 14 historical payments. Backend produces risk score 75 and `needs_review`; direct approval is rejected.
2. Paid duplicate: `INV-2410` / Meridian Office → 100 and `blocked`; verification and approval forbidden.
3. Large amount deviation: `INV-2411` / Kastro Maintenance → 65 and review.
4. Normal: `INV-2412` / Palm Tree Logistics → 0, `ready`, requiring internal approval.
Never hardcode those risk values as frontend business logic; only use seed IDs for an optional guided demo selector, but show risk returned by API.

## 5. Contract with the existing Python API (verify against source)

Base path with Next proxy: `/api`.
- `GET /api/health` → status, mode (`synthetic-local-demo`), Jinius connection = mock, payment_initiation = false, risk_model = auditable-rules-v1.
- `GET /api/v1/invoices` → array of invoices. Each invoice includes `id`, `supplier_id`, `supplier`, `short`, `invoice`, `amount_cents`, `amount`, `iban` (masked), `previous` (masked), `history`, `date`, `risk`, `level`, `kind`, `reason`, `signals[]`, `notes[]`, `status`, `verified`, `verified_by`, `approved_by`, `reference`, `source`.
- `GET /api/v1/invoices/{id}` → one invoice as above.
- `GET /api/v1/suppliers` → array of `{id, name, short, payment_count, last4, historical_median_eur}`.
- `GET /api/v1/audit` → array of audit events including id, actor, action, title, detail, invoice_id, created_at.
- `GET /api/v1/integrations` → `{ jinius: {status:"mock", adapter:"DemoJiniusAdapter", live_connected:false,...}, bank_payment:{status:"disabled", payment_initiation:false} }`.
- `POST /api/v1/invoices/assess` JSON `{id:string [A-Z0-9_-]{3,64}, supplier_id, invoice_number, amount_cents:integer>0, creditor_account:string, invoice_date:"YYYY-MM-DD"}`; creates actual server-side assessment, status 201. Never send masked strings as the new identifier unless user enters them.
- `POST /api/v1/invoices/{id}/verify` JSON `{ evidence_note: string }` min 12 chars. This records **SIMULATED independent verification**; label it as such.
- `POST /api/v1/invoices/{id}/approve` → internal, simulated finance-manager approval, and **NO bank transfer**.
- `POST /api/v1/invoices/{id}/hold` → hold.
- `POST /api/v1/demo/reset` → destructive demo reset.
- Backend errors may be 404/409/422 with FastAPI `{detail:...}`. Show human-friendly real errors. Handle network failures gracefully and supply retry affordances.

Build a central typed API client and hooks/data fetching approach (TanStack Query/SWR if justifiable, or lightweight fetch/revalidate). Keep loading/error/refresh consistent and prevent duplicate submissions. Never trust buttons or frontend validation for authorization. Sync/reload state after transitions. Current backend does not implement real auth or tenant roles; don't fabricate logged-in users/security guarantees.

## 6. Quality, engineering hygiene, and acceptance tests

- Use clean modular source, app routes, components, utilities and typed models. Distinguish `ready`, `needs_review`, `blocked`, `hold`, `approved` semantically, and `risk` (review-priority metric) from fraud probability. Risk labels must be accessible beyond color. Currency format en-IE/€ and date formatting en-GB or similar.
- Keep no source-of-truth risk score in client state. No static lorem ipsum, unrelated stock imagery, fake money balances, irrelevant product tiles, misleading integration badges, or fake "AI confidence".
- Avoid client hydration mismatch: use guarded browser APIs in effects and use dynamic import with `ssr:false` for WebGL-only visual where needed. Test dark/light consistency and WebGL-disabled fallback. Keep GSAP effects scoped/cleaned up and don't animate entire dense tables unnecessarily.
- Preserve browser back/forward. Use semantic HTML and correct dialog focus / escape / keyboard operations. Avoid layout shifts; verify all screen widths 375 / 768 / 1280 and browser zoom.
- Implement or run appropriate UI tests with existing tooling (React Testing Library/Vitest and/or Playwright) for: loading data from real/mock API, risk display, changed-account cannot immediately approve, valid verification then internal approval, duplicate remains blocked, new assessment POST validation, supplier filter, navigation, audit and reset confirmation, mobile overflow, and reduced-motion fallback.
- Run available `npm run lint`, `npm run typecheck` (add it if needed), `npm run build`, frontend tests and existing `python -m pytest tests -q`. Resolve all failing checks, or clearly report blockers and exact unrun commands. Do not claim passing checks without running them. Produce at least one screenshot for desktop and mobile if a browser is available; review and correct obvious alignment problems.
- Do not modify the existing backend logic unless a small necessary fix is justified, tested, documented and backward-compatible. Never add live banking actions, insecure auth bypasses or CORS wildcards.

## 7. Delivery and work style

**Act now and implement.** Inspect repository and both complete provided reference snippets; state a brief execution plan; then make file changes. Prioritize a working flow over ornamental effects. Aim for the product UX above, not a visual clone.

Before finishing, provide a concise report with:
1. exact files created/changed and key design choices;
2. which parts of each 21.dev reference were truly integrated/adapted;
3. all real working API-connected routes and UX flows;
4. exact Windows PowerShell commands to run FastAPI + Next.js in separate terminals;
5. tests/build/lint results (pass/fail/not run truthfully);
6. remaining limitations (synthetic local demo, Jinius not connected, no real payment, no real auth) and any blockers.

**Success criterion:** I can run the existing Python backend, run the new Next.js frontend, open `http://localhost:3000`, see a gorgeous TrustPay AI interface, inspect existing Aegean invoice, observe 75 review score from FastAPI, see server reject direct approval, record a simulated independent verification evidence note and then register internal approval, with no actual payment ever being initiated. The UI remains fast, beautiful, consistent and usable on both desktop and mobile.
