> Historical prompt from before the Node.js migration (#14). The Python/FastAPI backend it mentions no longer exists; the API now runs as Next.js route handlers in `frontend/src/lib/server`.

# TRUSTPAY AI — CODEX IMPLEMENTATION TASK
## Full Crystal iPhone / Liquid Glass Redesign (React + Next.js)

YOU ARE WORKING IN THE EXISTING TRUSTPAY AI REPOSITORY, NOT IN A STANDALONE DESIGN MOCKUP. IMPLEMENT THE REDESIGN IN CODE. Do not stop after writing a plan. I authorize routine coding, file edits, dependency installation, refactors, testing, and fixing defects. Do not ask for routine approvals or subjective design preferences. Do not push, deploy, merge, delete data or change external infrastructure without a separate explicit request.

### Source of truth / visual reference

The user supplied a 21.dev source component, `references/glassy-dashboard.tsx`, its `references/demo.tsx`, and `references/21dev-original-instructions.txt`. READ THESE FIRST. Adapt its glass rendering, layered translucency, rounded floating panels, fluid dock/active indicator, polished transitions, responsive layouts and light/dark behavior. **DO NOT copy its e-commerce/automation workspace data, USD charts, unrelated integrations, warm brown/sepia visual theme, demo behavior or default ATLAS branding.** The reference is a visual/interaction starting point, not our product logic.

### Mission

Completely redesign the EXISTING TrustPay AI web app into a refined premium **iPhone-inspired crystal / liquid-glass Fintech SaaS**. Visually sophisticated, spacious, refined, responsive, fast, and most importantly legible and trustworthy for finance professionals. This is not a generic Apple clone and not a blurry sci-fi mockup. Think optical glass material, softly refracted light, translucent floating surfaces and restrained precision, anchored by real payment-risk data.

### First inspect and map

1. Explore the actual repository/worktree, current frontend framework, routes, components, state, styles, assets, tests and existing Python FastAPI backend.
2. Determine the real backend response/request contracts before changing the UI. Do not invent backend endpoints or assume previous versions are exact. Keep the Python API and risk logic intact.
3. If the frontend already uses Next.js + TypeScript + Tailwind + shadcn/ui, refactor it in place rather than creating a second application. If not, create a clean Next.js App Router/TypeScript/Tailwind frontend inside `frontend/`, with a conventional `components/ui` structure and configured aliases. Do not break the existing Python app. Preserve a working start guide.
4. Identify actual working pages and actions, and establish a route-by-route functionality checklist BEFORE implementation. Continue into implementation immediately.

### Visual system: TrustPay Crystal

- Crystal clarity, not dark neon and not sepia. Default LIGHT mode: translucent ice-white glass on an off-white / pale-blue atmospheric canvas with extremely subtle mesh gradients. Optional DARK mode: rich midnight-navy glass with soft luminous icy-cyan highlights, excellent contrast.
- Brand colors (starting tokens; tune for accessibility): `--tp-ink: #13263A`, `--tp-background: #F3F8FC`, `--tp-accent: #176F94`, `--tp-cyan: #55BDD5`, `--tp-emerald: #167C67`, `--tp-warning: #A56A24`, `--tp-danger: #BA4556`. Dark surfaces around `#0A1423`, `#122338`. Neutral finances and textual content MUST dominate.
- Optical material: translucent surface (e.g. rgba(255,255,255,.68)), soft `backdrop-filter: blur(20px) saturate(150%)`, subtle internal bright edge, 1px translucent border, small ambient shadow, restrained specular highlight. Add CSS fallback when backdrop filters are unsupported or transparency is reduced. Preserve readable opacity for dense data tables, forms, and long paragraphs.
- Corner radii around 20–30px for primary cards, 12–18px for controls, floating pill navigation. Avoid nested glass-on-glass clutter.
- Manrope is acceptable from the reference; prefer a consistent high-legibility interface font. Align currency columns using tabular numbers. 1 EUR locale for seeded/demo business data; no invented balances or fictitious transaction totals marketed as real.
- Desktop: compact floating top bar, persistent contextual nav/rail or dock, wide dashboard with clean visual hierarchy. Mobile: excellent sticky bottom glass navigation with safe-area spacing, naturally stacked cards, readable tables in scrollable containers, zero accidental horizontal viewport overflow.
- Meaningful, gentle physics and motion. Adapt GSAP only where beneficial; keep most interactions simple via CSS. Support `prefers-reduced-motion`, low-end devices, focus states and keyboard nav. Never animate essential financial numbers in a misleading way.
- Branding: original TrustPay identity based on a shield/check/verified payment concept, not Apple branding, copied logos, Atlas or Nimbus.

### Critical pages to redesign (implement existing pages, create missing pages only when backed by working flows)

**Overview:** TrustPay Crystal header; payment-health overview; meaningful metrics such as invoices assessed, flagged invoices, pending reviews, approvals by status; risk trend visualizations; recent actionable invoices; priority anomaly cards; integration status. Use server-derived counters. Demo data is explicitly labeled "Demo / Sample Data".

**Payments / Invoice Review:** searchable, filterable table with invoice number, supplier, amount, submitted date, risk score, findings, status; click into a detailed inspection experience. Show observed IBAN change (mask IBAN), historical evidence (number of prior payments, prior account, amount baseline), explicit reason codes and safe next actions. Risk score is NOT a probability of fraud. Reproduce the most important live demo: 14 prior payments to account ending 1842, new invoice €8,420 to account ending 9077 => a prominent but tasteful high-risk hold with clear explanation. This scenario must be labelled sample if not backed by real data.

**Suppliers:** elegant supplier list, individual supplier trust profile with payment patterns, observed accounts, flags and history. Avoid asserting a supplier has been legally/externally verified unless actual verified evidence exists.

**Approval Workflow:** user can review/verify/request approval only through the EXISTING authenticated server-side flow, with state changes performed and validated on the backend; no button should silently mutate local state to indicate a real financial approval. Make hold / verification / maker-checker clear. If no real auth/role validation exists, show the demo limitation and never claim production-safe approvals.

**Risk Insights:** charts based on available data: risk levels, reasons, temporal evolution, top review categories. Avoid "fraud prevented" or "money saved" unless explicitly simulated or verifiably calculated.

**Audit Trail:** immutable-looking timeline UI with correct underlying records; never fabricate timestamps or actors; maintain backend audit semantics.

**Integrations:** show Jinius connection mode precisely (Mock / Sandbox / Live). Never represent Jinius connectivity as live if only mock/demo adapter is present. Show what data is available. Connection settings must never reveal API secrets to the browser.

**Settings:** theme switching, appropriate responsive controls and whatever existing functionality is real; avoid decorative settings with no implementation.

### Special interaction — Crystal Risk Assessment

Design a prominent, elegant translucent crystal "Trust Assessment" panel for the selected payment. Animate light reflections softly when selected; contrast-controlled neutral/green/amber/red outcome. Provide a short **Why flagged?** explanation tied to backend reason codes; before/after masked IBAN; independent supplier verification CTA only if backend supports it; timeline from reviewed to verified to approved. Preserve explicit difference between "review approved" and "payment actually sent". Never process cards or collect PAN/CVC for this flow. Do not reuse a checkout form unless it directly makes functional sense.

### Integration and data integrity rules (non-negotiable)

- The Python FastAPI Risk Engine is the source of truth for risk scores, invoice state, approvals and audit. Never reproduce risk scoring as client-only fake logic.
- Reuse real endpoints found in code. If necessary, create a small typed API client; parse/error-handle responses, loading, empty, offline, and retry states. No hardcoded API keys; use environment variables securely. Avoid exposing server credentials with `NEXT_PUBLIC_`.
- Use a well-isolated DEMO mode ONLY when live backend is unavailable; clearly label synthetic data and never imply real banking or Jinius activity.
- Prevent double submissions, handle failed responses without showing optimistic false approvals, maintain keyboard accessible actionable elements. Invoice and supplier identity must be represented consistently across all routes.
- Do not delete tests or disable TS/ESLint checks to pass builds. No unsafe `any` without a documented exceptional reason. Do not introduce insecure `dangerouslySetInnerHTML` or remote arbitrary assets.
- Do not change bank payment initiation, database schemas, production authentication, or external integrations merely for the redesign. If a minimal backend change is absolutely necessary to support a UI workflow, implement it safely, include tests and document it.

### Build requirements

- Use modular components (e.g. `CrystalAppShell`, `CrystalNav`, `CrystalCard`, `MetricCard`, `StatusBadge`, `InvoiceTable`, `InvoiceDetail`, `RiskAssessment`, `SupplierProfile`, `RiskChart`, `AuditTimeline`, `IntegrationStatus`, `EmptyState`). Keep shared tokens in CSS and avoid a 1,000-line monolith.
- shadcn primitives for dialogs, menus, forms, table and accessibility; Tailwind design tokens. Reference GSAP and lucide-react where appropriate. Only install dependencies actually needed.
- Clear light/dark toggle saved appropriately on client, no hydration mismatch/flash. Honor system preference if user has not set a preference.
- Excellent design for 1440px, 1024px, 768px, 390px and 320px. Touch targets ≥44px. Respect reduced motion/transparency and focus-visible.
- Charts should be semantic and accessible, with textual summaries or tooltips, and work with real backend time series if available.

### Acceptance and tests (must execute)

1. Every existing page loads and all primary CTA buttons and navigation links work; no placeholders disguised as functioning buttons.
2. `npm run lint`, TypeScript check, `npm run build` all pass for frontend; backend pytest runs without regressions when environment supports it.
3. Browser tests/smokes for routing, theme, filter, invoice detail, high-risk example, error state, and any approval action. Cover both Chromium and WebKit if Playwright already exists / is feasible.
4. Capture and review desktop + mobile screenshots if browser testing is available. Check layout/contrast/readability and adjust.
5. No browser console errors, no horizontal overflow, no leaking API keys, no accidental app restart loops, and no materially excessive animation CPU/GPU usage.
6. Update setup README: both frontend and backend startup instructions for Windows PowerShell, dev ports/environment variables, how mock mode is recognized, test commands. Don't assert Jinius API live connectivity without evidence.

### Execution / autonomy

Implement everything above now in the current worktree. Make all routine choices autonomously. If a design sample cannot be reused cleanly, reimplement the visual motif using correct, maintainable React components instead of blindly copy-pasting. Preserve backend functionality and all security controls. Do not request intermediate design approvals. Do not push to GitHub or deploy unless separately instructed.

At the end provide: concise summary of changes, exact files changed, tests run and their results, how to launch, screenshots/preview locations where generated, and clear remaining limitations (especially any backend data or Jinius sandbox dependency). Do not claim tests passed unless executed.
