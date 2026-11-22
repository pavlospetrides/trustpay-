# TrustPay Crystal — Fast Visual QA Checklist

- Visual source is `references/glassy-dashboard.tsx`; use its glass/dock visual language but replace its warm sepia/ecommerce content.
- Default light: ice-white refractive surfaces, pale blue background, neutral ink, no dark neon overload.
- Optional dark: midnight navy, readable cool highlights.
- Navigation: floating glass header; keyboard accessible rail and iPhone-like bottom nav on mobile.
- Data accuracy: all monetary values and risk scores from real Python API or explicitly labeled sample.
- High-risk invoice: old IBAN vs new masked IBAN, 14 prior payments, reason codes, clear hold and verification path.
- No fake approve/pay buttons; distinguish approval from execution.
- Different screens: Overview, Payments, Suppliers, Risk Insights, Approval Flow, Audit Trail, Integrations.
- Responsive at 320 / 390 / 768 / 1024 / 1440; text contrast and table readability; reduced motion and accessibility.
- End-to-end verification: lint, typecheck, build, backend tests, UI flows; no placeholder CTAs.
