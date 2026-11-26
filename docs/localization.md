# TrustPay localization

TrustPay ships English (`en`), Greek (`el`), Russian (`ru`) and Hebrew (`he`). English is the default and fallback. A language comes only from the `trustpay-language` cookie or the visitor’s explicit selection. The picker is available on the public page, sign-in page and workspace. The cookie is scoped to this origin and survives sign-in, sign-out and future visits for up to one year. The preference is shared by tabs on the same origin. No personal data is needed for this preference, and the app currently has no account preferences service.

The root App Router layout reads the cookie before rendering and sets the locale, document direction and metadata. The client context loads the selected catalog and updates the current page, metadata and direction. A Next.js route refresh reconciles the cached server output without a full page reload. Catalogs for other languages load on demand. Routes and API contracts are language independent. Cookie-aware HTML is rendered per request.

The language picker uses Radix Dropdown Menu with a single checked language option. Native language names carry their own language tags. The menu aligns with the trigger in both reading directions, moves to avoid viewport edges, and follows the browser’s reduced-motion preference.

## Adding or changing a message

1. Find the existing term in this guide and the existing messages in `frontend/src/lib/i18n/messages`. Choose a stable, descriptive key that reflects the UI context. Use named placeholders for new messages, such as `{supplier}` or `{amount}`. Use the plural objects and pass the actual count to `p()`.
2. Use `t()` for screen copy and shared localized helpers for currency, dates, numbers, lists, status labels and signals. Format display values only. Preserve ISO dates, integer cents, stored decisions, invoice references and API identifiers. Accept the locale’s decimal separator at form entry, then send canonical data.
3. Keep API responses, server error text, and stored messages canonical. Some HTTP status decisions depend on the English error text. Localize messages when displaying them in the UI through `presentation.ts`. Use `sourceText()` for client-owned messages that need stable text in UI state. For new displayable system output favor stable codes and structured values. Preserve compatibility with historical records. Pass user notes, vendor names, invoice metadata and provider evidence through as supplied. An optional freeform AI summary is original evidence, with its source language noted in localized views.
4. Review all four messages in the actual screen. Check line wrapping, controls, translated validation, plurals and direction. Use CSS logical properties. Put mixed user text in `dir="auto"` and isolate invoice IDs, IBANs, emails and mixed-direction values with `<bdi>` or explicit LTR direction as appropriate. Mirror arrows that indicate movement. Keep brand marks and decorative icons in their authored orientation.
5. Run `npm run i18n:review` after reviewing all four catalogs. This records the English source fingerprint. A changed English string without an updated review entry fails `npm run i18n:check`, which is part of lint and CI. The checker also flags missing, empty, duplicate and inconsistent catalog entries, invalid variables, copied English and direct literals at common UI entry points. TypeScript checks message keys. Run `npm run build` and `npm run test:i18n:e2e` for a UI change. The Chromium suite uses a separate synthetic SQLite database.

## Glossary

| English term | Greek | Russian | Hebrew |
| --- | --- | --- | --- |
| Invoice | τιμολόγιο | счёт | חשבונית |
| Supplier | προμηθευτής | поставщик | ספק |
| Assessment | αξιολόγηση | проверка | בדיקה |
| Review priority | προτεραιότητα ελέγχου | приоритет проверки | עדיפות לבדיקה |
| Independent verification | ανεξάρτητη επιβεβαίωση | независимая проверка | אימות עצמאי |
| Internal approval | εσωτερική έγκριση | внутреннее согласование | אישור פנימי |
| Audit trail | αρχείο ενεργειών | журнал действий | יומן פעולות |
| Payment destination | λογαριασμός πληρωμής | счёт получателя | חשבון יעד |
| Duplicate invoice | διπλότυπο τιμολόγιο | дубликат счёта | חשבונית כפולה |
| On hold | σε αναμονή | приостановлен | בהמתנה |
| Evidence | δικαιολογητικό, τεκμήριο ή στοιχεία επιβεβαίωσης | документ, обоснование или подтверждение | אסמכתה, מסמך או אישור |

English uses the existing product voice and preserves the distinction between internal approval and payment. Greek uses polite plural forms for instructions, with concise noun phrases for buttons. Russian uses direct infinitives for buttons and polite plurals in instructions. Use «счёт» for invoice throughout; qualify bank accounts as «банковский счёт» or «счёт получателя». Hebrew uses concise action nouns and plural instructions where useful. Use appropriate Hebrew punctuation and place mixed identifiers in isolated runs. Preserve TrustPay, Jinius, Supabase, PostgreSQL, TypeScript, IBAN, API, file formats, usernames, product codes and URLs. In Greek, Email and KB are accepted shared labels.

Number and date display uses `Intl` with `en-GB`, `el-CY`, `ru-RU` and `he-IL`. English euro formatting keeps the existing `en-IE` convention. Date-only values keep the original calendar day. Audit event timestamps remain UTC. EUR remains the transaction currency across languages. Locale rules choose plural forms, including Russian few/many and Hebrew two. Avoid concatenations that force English word order.

Native browser and operating system dialogs, including the calendar or file picker, use the user’s platform language. TrustPay supplies localized field labels, validation feedback and selected file text around those controls.

## Implementation and verification report

All four catalogs have 762 keys apiece. They cover the public and sign-in pages, navigation, settings, invoice creation and intake, invoice and supplier details, risk assessments, approvals, audit events, integrations, and framework fallback pages. The catalogs also cover known application validation and API errors, including the presentation of older stored events and assessments. The expanded intake review localizes OCR status, evidence controls, document classification, financial and VAT fields, and deterministic warnings. Duplicate-review signals and audit copy are localized in the interface. The catalog audit reviewed terms in context, distinguished accounts from invoices in Russian, and checked the separate actions for verification, approval and payment. The rendered review checked all four languages, including line wrapping and Hebrew direction. Independent native-speaker review remains open, particularly for Russian and Hebrew risk and approval wording and Greek terminology specific to Cyprus.

| Area | Files and changes |
| --- | --- |
| Locale runtime | Added [`frontend/src/lib/i18n`](../frontend/src/lib/i18n), with catalogs, server locale selection, the React provider, presentation adapters, and tests. Uses Next.js, React and built-in `Intl` APIs. |
| Interface | Added the [language selector](../frontend/src/components/language-selector.tsx), [RTL styles](../frontend/src/app/i18n.css), and localized framework error and missing-page components. Updated the root layout, public and workspace routes, and shared UI, forms, charts and dialogs. Hebrew mirrors directional layouts and arrows and isolates identifiers, money and mixed-direction values. |
| Application data | Updated client API, intake, assessment, and audit presentation. API routes and server code match the incoming `main` commit, including the duplicate-review and accounting endpoints, HTTP status mapping, and country-specific IBAN validation. |
| Enforcement | Updated the [root rules](../AGENTS.md), [frontend rules](../frontend/AGENTS.md), [package scripts](../frontend/package.json), and the [existing CI workflow](../.github/workflows/supabase-phase1.yml). Added the [catalog checker](../frontend/scripts/check-localization.mjs), the English review fingerprints and a [Playwright suite](../frontend/e2e/localization.spec.ts) with its own [configuration](../frontend/playwright.localization.config.ts). |

Codex sessions discover the root `AGENTS.md` when working in this repository and also pick up `frontend/AGENTS.md` for changes under `frontend/`. Those files require translations and linguistic review for every affected language, Hebrew RTL verification where relevant, synchronized catalogs, no new hardcoded UI copy, passing checks and preservation of existing behavior. They direct agents to this glossary and require reporting any unmet condition. `npm run i18n:check` runs as part of lint and CI. CI also runs the Chromium suite against a production build. The repository has no separate pre-commit check for localization.

| Check | Result |
| --- | --- |
| Existing and localization unit tests | 279 passed, including all 75 Python parity tests. Ten tests requiring external services or a disposable database were skipped. |
| Catalog and source check | Passed. The controlled `--self-test` removed a Greek key, changed a Russian placeholder and emptied a Hebrew entry in memory. The checker rejected all three cases. |
| Type checking, lint and production build | Passed locally. The production build renders locale-sensitive HTML per request. |
| Chromium against the production build | Fifteen tests passed. The suite checked 15 routes in all four languages at widths of 1440, 768 and 320 pixels, for 180 page, language and width combinations. It also checked menu positioning, keyboard and touch interaction, English fallback, language persistence, mixed-direction identifiers, form validation, and verification and approval against synthetic SQLite. The structured OCR review ran in all four languages with simulated API responses and verified the submitted values, line items and classification correction. |
| Dev server walkthrough | Switched languages on the dashboard, completed a synthetic invoice verification in Hebrew and approval in Greek, and checked the OCR intake in English, Greek and Hebrew, including at mobile width. |
| Issues found during verification | Fixed a Hebrew landing-page overflow at 320 pixels. Refined the Greek validation test to select the visible error banner. Both passed on rerun. |

Hosted Supabase sign-in and external integrations were outside the run. The intake and end-to-end workflows used synthetic data. Chromium was the tested browser. Playwright checked accessible names and dialog semantics in the exercised flows. Screen-reader testing, a cross-browser audit and comparative performance benchmarks were not performed. User-provided text, external evidence and optional freeform AI summaries remain in their source language, and native browser dialogs follow platform settings. The CI workflow runs the automated checks. See the pull request for the hosted CI run.
