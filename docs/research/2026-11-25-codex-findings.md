# Codex independent findings (25 November 2026)

Codex CLI 0.169.0, read-only, web search on. The merged result is [differentiation-strategy.md](../differentiation-strategy.md).

## Brief

Both assistants received this brief:

> # Independent research brief: how TrustPay stands apart (research only, no code changes)
>
> Context: TrustPay (this repo, read README.md, docs/PROJECT.md, docs/STATUS.md, docs/jinius-integration-architecture.md, docs/JINIUS_OPEN_DAY.md) is a Bank of Cyprus Fintech Hackathon 7.0 entry (27-29 Nov 2026), targeting the Jinius API prize. Today: payment-risk review before an SME pays a supplier invoice — changed-IBAN / duplicate / amount-anomaly policy rules, maker-checker approvals, audit, AI invoice extraction, synthetic Jinius adapter.
>
> Owner's concern: the idea ("AI catches invoice fraud / changed IBAN before you pay, using Jinius") is the obvious answer any LLM gives when asked "hackathon idea for Jinius / BoC sponsors". Many teams may ship near-identical copies. Keep TrustPay as the base idea, but find the strongest, most original, most useful differentiation.
>
> Do independent research (use the web; cite URLs; mark anything unverified):
> 1. The hackathon: bochackathon.net — challenges/tracks, sponsor prizes (esp. Jinius), judging criteria, judges/sponsor profiles, past winners (earlier editions) and what won.
> 2. Jinius: what it actually is (Cyprus e-invoicing / B2B network by Bank of Cyprus?), its real APIs/integrations, product gaps, Cyprus/EU context (ViDA e-invoicing mandate, Cyprus e-invoicing timeline, SEPA Verification of Payee under the Instant Payments Regulation from Oct 2025, APP fraud, BEC fraud stats in Cyprus/EU, PSD3/PSR liability shift).
> 3. Competitive landscape: what the "obvious" TrustPay clones will look like; existing commercial products (e.g. Trustpair, Eftsure, Nacha-style account validation, VoP providers) and what they don't cover for Cypriot SMEs.
> 4. Differentiation: generate and then rank options to make TrustPay distinctive to judges and to Jinius/BoC specifically. Think about network effects across the Jinius network, verification that uses the network itself (both buyer and supplier on Jinius), regulatory hooks, supplier-side value, demo theatrics, measurable proof, what copy-cat teams will NOT have time or insight to do in 48h.
> 5. Pitch: the one-line positioning, the 3-minute demo beat sheet, and the risks/claims to avoid (we must not claim live Jinius access, bank ownership verification or fraud probabilities without evidence).
>
> Deliverable: a concise markdown report (max ~900 words) with: top findings (sourced), ranked differentiation options (score each on originality, usefulness, Jinius fit, 48h feasibility, demo impact), your single recommended "golden recipe", and open questions to confirm with organizers. Do NOT edit any repo files.

## Independent report


**Positioning:** TrustPay lets a Cypriot SME confirm changed payment details with the supplier who issued the Jinius invoice, then approve that exact invoice version with an audit trail.

### Top findings

- **Hackathon fit.** BoC Fintech Hackathon 7.0 runs 27–29 November in Nicosia. SME Fintech, Cybersecurity & Trust, Open Banking and RegTech are relevant, non-binding tracks. Overall prizes are €7k/€4k/€2k, plus €2k for best use of Jinius APIs and €1k for Smart City. Published criteria include value, innovation, API integration, technical integrity and feasibility. Reported judges include Jinius lead Angelos Constantinides, BoC Technology & Operations executive George Kousis and JCC infrastructure manager Yiannos Assiotis. Jinius-specific scoring and eligibility remain unverified. [BoC announcement](https://www.bankofcyprus.com/en-gb/group/news-archive/FintechHackathon7.0/) · [Event terms](https://bochackathon.net/terms/) · [Panel listing](https://hackathon.cy/news/detail.php?id=4039)
- **What won before.** In 2025, Labs(dot)cy won overall with Jinius-powered business intelligence, and TBD won the Jinius prize with marketplace customer analytics and forecasting. In 2024, Moctezuma won overall with real-estate tokenization, and Memoirme took the Jinius prize with digital memorials. Memoirme’s API implementation is unverified. My read is that a demonstrable benefit from sponsor data is a better bet than maximizing endpoint count. [2025 results](https://www.cbn.com.cy/article/120528/boc-fintech-hackathon-6-0-empowering-innovation-in-the-new-era-of-fintech) · [2024 results](https://www.stockwatch.com.cy/en/news/boc-fintech-hackathon-50-fintech-ideas-that-can-change-the-world)
- **Jinius already connects both sides.** BoC reports roughly €3.2bn exchanged through Jinius Business in the first nine months of 2026. Jinius documents ERP invoice and credit-note exchange, shared invoice status, remittance XML with creditor IBAN and invoice references, and separately authorized 1bank B2B payment initiation. The public Marketplace key guide covers Marketplace. Participant invoice endpoints, revision provenance, supplier confirmation and revocation capabilities remain unverified. TrustPay’s synthetic sync is recorded on `main` and live access remains open. [BoC results](https://www.bankofcyprus.com/globalassets/group/investor-relations/presentations/eng/20261105-9m2026-financial-results-presentation-_final.pdf) · [Jinius integrations](https://business.jinius.com.cy/support/) · [XML fields](https://help.jinius.com.cy/hc/en-us/articles/35189624048145-What-fields-does-the-XML-file-include) · [Marketplace key](https://help.jinius.com.cy/hc/en-us/articles/23333712658961-How-to-get-your-API-Key) · [TrustPay #2](https://github.com/pavlospetrides/trustpay-/issues/2)
- **Regulatory opening.** Euro-area PSPs generally had to offer VoP for standard and instant euro credit transfers from 9 October 2025. Business customers can opt out for packaged orders. VoP checks payee identity against the account at payment initiation. Invoice provenance and approval remain separate questions. Cyprus public bodies phased in structured invoice acceptance in 2019–20, with supplier submission voluntary and no domestic B2B mandate reported. ViDA starts mandatory e-invoicing-based reporting for covered cross-border B2B transactions in July 2030. PSD3/PSR remained pending formal adoption. Proposed PSP-impersonation refunds give no basis to promise SME invoice-scam reimbursement. [Instant Payments Regulation](https://eur-lex.europa.eu/eli/reg/2024/886/oj) · [Cyprus factsheet](https://ec.europa.eu/digital-building-blocks/sites/spaces/einvoicingCFS/pages/956171276/2026%2BCyprus%2B2026%2BeInvoicing%2BCountry%2BSheet) · [ViDA](https://taxation-customs.ec.europa.eu/news/vat-digital-age-2026-work-programme-available-2026-05-22_en) · [PSR status](https://oeil.europarl.europa.eu/oeil/en/procedure-file?reference=2023%2F0210%28COD%29) · [Council agreement](https://www.consilium.europa.eu/en/press/press-releases/2025/11/27/payment-services-council-and-parliament-agree-to-step-up-the-fight-against-fraud-and-increase-transparency/)
- **Fraud and competition.** Payer manipulation accounted for 74% of fraudulent credit-transfer value across the EEA in 2024 and 59% of fraudulent credit-transfer count in Cyprus in H1 2025. Cyprus police warn about emailed invoice and account changes. Comparable BEC-only totals remain unverified. Expect teams to build PDF extraction, history checks and a risk dashboard. Basware/Trustpair already combines invoice and payment assurance, Eftsure offers supplier change workflows and shared verification, SurePay offers bulk VoP, and Nacha’s first-use/change check applies to US ACH WEB debits. The plausible gap is a lightweight, invoice-specific workflow inside existing Jinius relationships. Competitors’ Cyprus coverage and Jinius integrations remain unverified. [EBA/ECB](https://www.ecb.europa.eu/press/intro/publications/pdf/ecb.ebaecb202512.en.pdf) · [Central Bank of Cyprus](https://www.centralbank.cy/images/media/pdf/1st_Half_2025.pdf) · [Police warning](https://cyprus-mail.com/2026/04/21/police-warn-over-surge-in-email-fraud-scams) · [Basware](https://news.basware.com/en/basware-completes-acquisition-of-trustpair) · [Eftsure](https://www.eftsure.com/vendor-management/) · [SurePay](https://developer.surepay.nl/vop-bulk-for-banks/introduction) · [Nacha](https://www.nacha.org/rules/supplementing-fraud-detection-standards-web-debits)

### Ranked options

Scores are my estimates, 1–5 per criterion. Feasibility assumes synthetic fixtures.

| Option | Originality | Usefulness | Jinius fit | 48h | Demo |
|---|---:|---:|---:|---:|---:|
| 1. Supplier confirms the exact invoice and destination | 5 | 5 | 5 | 4 | 5 |
| 2. Supplier publishes one revocable change to authorized buyers | 5 | 5 | 5 | 2 | 5 |
| 3. Compare emailed PDF against the supplier-issued Jinius record | 3 | 4 | 5 | 5 | 4 |
| 4. Attach VoP and invoice evidence to approval | 2 | 4 | 3 | 3 | 3 |

### Golden recipe and three-minute demo

**Build #1 with #3 as the opening scene.** Reuse TrustPay’s intake, hold and maker-checker flow. Bind supplier confirmation to buyer, supplier, invoice revision, amount, currency and destination. A material edit invalidates it. Use one authorized sandbox read if available and label every simulated event. The network payoff is fewer repeat calls for suppliers and faster exception resolution for buyers. Show #2 as the next step, with supplier-controlled sharing and no buyer payment histories exposed.

- **0:00–0:45.** Show an €8,420 invoice beside the supplier-issued record. Reveal the destination mismatch and attempt approval. The server refuses.
- **0:45–1:45.** Switch to the supplier view. Reject the emailed change, then confirm a legitimate change on a revised invoice. Switch back for independent buyer approval and show both actors in the audit trail.
- **1:45–3:00.** Edit the destination after approval and show that authorization is invalidated. Report fixture outcomes and measured review time against a scripted callback workflow. Claim live access only with a successful redacted request. Label supplier confirmation as supplier evidence and scores as review priority. Avoid claims of bank ownership verification, fraud probability or losses prevented.

**Ask organizers:** What did the Open Day confirm about sandbox access, stable party and revision IDs, creditor details and supplier-authorized events? Can a documented read plus simulated confirmation qualify? What are the prize rubric, prebuilt-MVP rules and sandbox display permissions?

Repository untouched. Checked public sources, GitHub `main` and issue #2. Private Open Day materials, sandbox behavior and demo timings remain unverified.
## Reply to Claude's report

**(a) Cross-buyer HMAC signal — disagree for the MVP.** A synthetic match is feasible in 48 hours. TrustPay already fingerprints IBANs, but its queries are tenant-scoped. Cross-buyer matching creates a new data-sharing purpose. Linkable fingerprints can remain personal data, so production needs Jinius authorization, a lawful basis where GDPR applies, and controls against inference. Shared collection accounts can produce legitimate matches. Call it “destination seen elsewhere” and keep it advisory. [Repo architecture](https://github.com/pavlospetrides/trustpay-/blob/main/docs/database-architecture.md) · [GDPR, Arts. 4–6](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng/)

**(b) Pitch visual — agree.** The 2025 overall and Jinius winners both used Jinius data for analytics. The terms list automated data visualisation without publishing a weight. Show the old and proposed destinations beside the supplier decision. Treat IBAN country as context and give geography zero risk weight. [2025 results](https://www.cbn.com.cy/article/120528/boc-fintech-hackathon-6-0-empowering-innovation-in-the-new-era-of-fintech) · [Event terms](https://bochackathon.net/terms/)

**(c) Supplier badge — agree on onboarding, disagree on “Verified Supplier.”** Jinius already has authorized company representatives. “Supplier confirmed this invoice” makes the scope clear. Fewer callbacks is a testable onboarding pitch. Faster payment remains a hypothesis. [Jinius registration](https://help.jinius.com.cy/hc/en-us/articles/4409662366353-How-do-I-register-as-a-Company-Authorised-Representative)

**(d) PDF comparison — agree it should open.** Jinius documents seller-to-buyer invoice exchange. Two versions of the same invoice make the mismatch visible before any policy score appears. Label the Jinius record synthetic unless an authorized read succeeds. [Jinius integrations](https://business.jinius.com.cy/support/)

#### Merged recipe

1. Open with the emailed PDF beside the supplier-issued record. Reveal the destination change and show the server refusing approval.
2. Switch to the supplier. Reject the emailed change, then confirm a legitimate update bound to the buyer, supplier, invoice revision, amount, currency and destination.
3. Show independent buyer approval and both actors in the audit trail. Edit the destination and demonstrate that approval expires.
4. Close with the supplier-confirmation label and fewer callbacks as the onboarding benefit. Keep cross-buyer matching as a synthetic roadmap example.
5. Report fixture catches, false alerts and timed review versus a scripted callback. Separate sandbox evidence from simulation.

No files changed. Sandbox capabilities, production sharing permissions and demo timings remain unverified.
## Final gap check of the merged doc

- Sandbox question 2 tests **receiver** actions. Check whether an authorized **supplier** can confirm or reject the exact revision. Label TrustPay-side confirmation separately even if the sandbox invoice read succeeds.
- VoP runs **before authorization** for standard and instant euro transfers. Add the business opt-out for bundled orders and qualify the BoC mismatch-liability claim by the payment provider’s compliance with VoP duties.
- Add the €3.2bn exchanged through Jinius Business in the first nine months of 2026 and the EEA’s 74% payer-manipulation share of fraudulent credit-transfer **value** in 2024. Cyprus’s 59% measures **count**.
- Add Cyprus’s 2019–20 public-body acceptance timeline and voluntary supplier submission. PSD3/PSR remained pending, with proposed protection for payment-provider impersonation.
- Name the non-binding SME Fintech, Cybersecurity & Trust, Open Banking and RegTech tracks. Add judges George Kousis (BoC Technology & Operations) and Yiannos Assiotis (JCC infrastructure).
- Add the solution declaration table with title, description, audience, specifications covered, datasets, APIs and links, production prerequisites and technology. Confirm the Jinius-specific judging rubric.
- The options table drops Claude’s municipal public-money guard and incident/recall pack. The winner history omits 2024 overall winner Moctezuma and what Memoirme built.
- A material edit should invalidate **both** supplier confirmation and buyer approval. Add safeguards against inferring other buyers’ activity from cross-buyer matches. Keep buyer payment histories out of the revocable broadcast.
- Add Nacha’s US ACH WEB-debit scope, cite SurePay’s bulk VoP documentation, and source the €120k Nicosia case separately.