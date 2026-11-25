# Claude independent findings (25 November 2026)

Written before reading Codex's report, from the shared brief in [2026-11-25-codex-findings.md](2026-11-25-codex-findings.md#brief). The merged result is [differentiation-strategy.md](../differentiation-strategy.md).

## Facts (sourced)
- Prize: Best use of Jinius APIs +€2,000; 1st €7k. Jinius's Angelos Constantinides sits on the evaluation committee (bochackathon.net/en/).
- Criteria (terms §9, unweighted): goal alignment, value for the value chain, complementarity with other teams, integration with open APIs, innovativeness, technical soundness, **degree of automated data visualisation**, interdisciplinary, production feasibility, commercial potential.
- Code produced must be published CC BY-SA 4.0 (terms §12). Pre-existing code not addressed.
- Past Jinius winners: 2025 "Jinius Insight" (predictive merchant analytics); 2025 1st place Labs.cy (Jinius + agentic AI BI for SMEs); 2024 Memoirme. Pattern: Jinius rewards things that grow/use the Jinius data network and show insight, not pure security.
- Jinius: B2B/B2G e-invoicing network; whole Cyprus government + municipalities (Nicosia, Paphos) invoice through it; already wired to BoC B2B payment APIs. No public invoice API docs.
- Cyprus has no B2B e-invoicing mandate yet; ViDA intra-EU 2030, national readiness talk 2028.
- VoP live since Oct 2025; BoC terms: bank not liable if payer proceeds after mismatch → SME carries the risk.
- Cyprus BEC wave: €642k Limassol (Apr 2025), €120k Nicosia (Jan 2026), €111k Larnaca, police warning Apr 2026; payment fraud value +16% H2 2025 (CBC). Typical pattern: email "changed details", money to another EU country.

## What clones will look like
OCR + LLM "fraud score" + dashboard + mocked Jinius button. Buyer-only, single-company, email-invoice world.

## Ranked differentiators (orig / useful / Jinius fit / 48h / demo, 1-5)
1. Network-confirmed bank change: supplier confirms an IBAN change inside its own Jinius account, so the out-of-band check runs through the network instead of a phone call. 5/5/5/3/5
2. Cross-buyer mule-IBAN signal with HMAC fingerprints (already in repo): "this new IBAN was just presented to 3 other Jinius buyers by 3 different suppliers". 5/5/5/4/5
3. Verified Supplier badge → faster approval → supplier paid sooner (positive, cash-flow, onboarding growth for Jinius). 4/4/5/4/4
4. Route-change map: IBAN country + bank code parsed deterministically; "CY→LT neobank" visual. Hits the data-visualisation criterion. 3/4/3/5/5
5. Public-money guard for municipalities on Jinius (stacks Nicosia Smart City prize). 4/4/4/3/3
6. Incident pack: one-click evidence + recall request when a hold fires late. 3/4/2/4/3

## Golden recipe
Reposition from "fraud detector" to "the trust layer of the Jinius network": #1 + #2 as the core, #4 as the visual, #3 as the commercial story; keep deterministic rules + maker-checker as the credibility moat. Prove with a labelled synthetic benchmark (catches, false alerts, review time) that clones won't have.
