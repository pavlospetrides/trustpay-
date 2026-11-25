# Differentiation strategy (research, 25 November 2026)

Claude and Codex each researched the same brief, compared results and agreed on the strategy below. The research covered how to keep TrustPay but stand apart from look-alike "AI invoice-fraud checker + Jinius" entries. It changed no code.

## Problem

Ask any assistant for a Jinius hackathon idea and it suggests the same thing: read the invoice PDF, compare its IBAN to past payments and show an AI risk score on a dashboard. Expect several teams to build that. These copies take only the buyer's view, work inside one company, and come from the world of emailed invoices.

## Facts that shape the plan

| Fact | Source |
| --- | --- |
| Prizes: €7k/€4k/€2k overall, plus €2k for best use of the Jinius APIs and €1k for Smart City. Non-cash prizes include a JCC Payment Gateway fee waiver, IBM watsonx access and Kyndryl security consulting. | [bochackathon.net](https://bochackathon.net/en/) |
| Evaluation committee includes Angelos Constantinides (Jinius by BoC), George Kousis (BoC Technology & Operations), Andreas Theodosiou (BoC), Yiannos Assiotis (JCC Payment Systems), Kyriakos Leonidou (Kyndryl), Menicos Mavrommatis and Panayiotis Petrides (IBM), Constantinos Kattirdjis (Microsoft), Vasos Vasiliou (UCY), Niki Ioannou (Cytabusiness), George Karamanolis (Crowdpolicy). Judges with payments and security backgrounds will probe the approval and audit controls. | [bochackathon.net](https://bochackathon.net/en/), [hackathon.cy](https://hackathon.cy/news/detail.php?id=4039) |
| Relevant non-binding tracks: Fintech for SMEs & Entrepreneurship, Cybersecurity & Trust in Fintech, Open Banking & Embedded Finance, RegTech & Compliance Automation. | [Thematic areas](https://bochackathon.net/en/thematic-areas/) |
| Deliverables: an MVP plus a solution declaration table (title, description, target audience, specifications covered, data used, APIs used, links to datasets and APIs, prerequisites for production, technology and open-source packages). No Jinius-specific rubric is published. | Terms §3, §8 |
| Criteria are listed without weights: goal alignment, value chain, *complementarity with other teams*, open-API integration, innovativeness, technical soundness, *degree of automated data visualisation*, interdisciplinarity, production feasibility, commercial potential. | [Terms §9](https://bochackathon.net/en/terms-and-conditions-of-participation/) |
| Code produced at the event must be published CC BY-SA 4.0. The terms do not address pre-existing code. | Terms §12 |
| Past winners: 2025 Jinius prize "Jinius Insight" (merchant analytics and forecasting); 2025 overall Labs.cy (Jinius data with agentic BI). 2024 Jinius prize Memoirme (digital family memoirs); 2024 overall Moctezuma (real-estate tokenisation). In 2025, entries that drew value from Jinius data won. | [newmoney.gr](https://www.newmoney.gr/roh/palmos-oikonomias/epixeiriseis/ta-vravia-tou-6ou-marathoniou-kenotomias-boc-fintech-hackathon-stin-kipro/), [CBN](https://www.cbn.com.cy/article/120528/boc-fintech-hackathon-6-0-empowering-innovation-in-the-new-era-of-fintech) |
| Jinius links both sides of an invoice: seller-to-buyer exchange, shared status, remittance XML with creditor IBAN, and separately authorised 1bank B2B payments. Government and municipalities invoice through it. About €3.2bn was exchanged through Jinius Business in the first nine months of 2026. No public participant invoice API is documented. | [Jinius support](https://business.jinius.com.cy/support/), [XML fields](https://help.jinius.com.cy/hc/en-us/articles/35189624048145-What-fields-does-the-XML-file-include), [Cyprus Mail](https://cyprus-mail.com/2025/10/24/public-sector-adopts-electronic-invoicing-through-jinius-platform), [BoC 9M 2026 results](https://www.bankofcyprus.com/globalassets/group/investor-relations/presentations/eng/20261105-9m2026-financial-results-presentation-_final.pdf) |
| Open Day (24 Nov 2026), as reported by the team: teams create an account on the Jinius API platform, create one or more fictitious legal entities, obtain a client ID and client secret, and send mock invoices through the Jinius sandbox API. Endpoints and payloads are not yet checked against the sandbox documentation. | Team report of the Open Day |
| Verification of Payee (VoP) has applied since 9 Oct 2025 to standard and instant euro credit transfers. It checks the payee name against the account before the payer authorises the payment. Business customers can opt out for bundled (bulk) orders. It says nothing about whether the invoice or a changed account is genuine. BoC's terms say it is not liable when a payer proceeds after a mismatch, provided the bank met its own VoP duties. | [Regulation 2024/886](https://eur-lex.europa.eu/eli/reg/2024/886/oj), [BoC VoP](https://www.bankofcyprus.com/en-gb/wholesale/Daily_Banking/payments/verification-of-payee/) |
| Payer manipulation was 74% of fraudulent credit-transfer **value** across the EEA in 2024, and 59% of fraudulent credit-transfer **count** in Cyprus in H1 2025. Reported "changed bank details" cases include €642k (Limassol, 2025) and €120k (Nicosia, 2026). Police warned of a surge in April 2026. | [EBA/ECB](https://www.ecb.europa.eu/press/intro/publications/pdf/ecb.ebaecb202512.en.pdf), [Central Bank of Cyprus](https://www.centralbank.cy/images/media/pdf/1st_Half_2025.pdf), [€642k](https://cyprus-mail.com/2025/04/28/cypriot-company-loses-over-e642000-in-online-fraud-scheme), [€120k](https://cyprus-mail.com/2026/01/27/nicosia-based-company-defrauded-of-more-than-e120000-via-email-scam), [Police](https://cyprus-mail.com/2026/04/21/police-warn-over-surge-in-email-fraud-scams) |
| Cyprus public bodies phased in structured e-invoice acceptance in 2019–20; supplier submission is voluntary and there is no domestic B2B mandate. ViDA e-invoicing-based reporting for cross-border B2B starts in July 2030. PSD3/PSR is still pending formal adoption; its proposed refunds cover payment-provider impersonation, not SME invoice scams. | [EC factsheet](https://ec.europa.eu/digital-building-blocks/sites/spaces/einvoicingCFS/pages/956171276/2026%2BCyprus%2B2026%2BeInvoicing%2BCountry%2BSheet), [ViDA](https://taxation-customs.ec.europa.eu/news/vat-digital-age-2026-work-programme-available-2026-05-22_en), [PSR](https://oeil.europarl.europa.eu/oeil/en/procedure-file?reference=2023%2F0210%28COD%29) |
| Commercial tools: Trustpair/Basware (invoice and payment assurance), Eftsure (supplier change workflows, shared verification), SurePay (bulk VoP for banks), Nacha's account validation rule (US ACH WEB debits only). None we found works inside existing Jinius buyer–supplier relationships. | [Basware](https://news.basware.com/en/basware-completes-acquisition-of-trustpair), [Eftsure](https://www.eftsure.com/vendor-management/), [SurePay](https://developer.surepay.nl/vop-bulk-for-banks/introduction), [Nacha](https://www.nacha.org/rules/supplementing-fraud-detection-standards-web-debits) |

## Agreed positioning

> **TrustPay lets a Cypriot business confirm a changed payment destination with the supplier who issued the invoice on Jinius, then approve that exact invoice version with an audit trail.**

The copies flag an invoice and stop there. TrustPay resolves the flag through the Jinius network itself: the supplier's authorised representative confirms or rejects the change. That replaces the phone callback, which fraudsters also target.

## Ranked options

Scores run 1–5. Both reviewers' estimates are merged. 48h assumes synthetic fixtures.

| Option | Orig. | Useful | Jinius | 48h | Demo | Verdict |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Supplier confirms the exact invoice and destination, bound to buyer, supplier, revision, amount, currency and IBAN | 5 | 5 | 5 | 4 | 5 | **Core** |
| Emailed PDF shown beside the supplier-issued Jinius record | 3 | 4 | 5 | 5 | 4 | **Opening scene** |
| Old vs proposed destination visual beside the supplier decision. IBAN country is context only, with zero risk weight. | 3 | 4 | 3 | 5 | 5 | **Visual for the criteria** |
| "Supplier-confirmed invoice" label, so suppliers get fewer callbacks (Jinius onboarding story) | 4 | 4 | 5 | 4 | 4 | **Commercial close** |
| Supplier publishes one revocable change to all authorised buyers | 5 | 5 | 5 | 2 | 5 | Roadmap slide |
| Cross-buyer "destination seen elsewhere" signal from HMAC fingerprints | 5 | 5 | 5 | 4 | 5 | Roadmap, synthetic example only (see disagreements) |
| Attach VoP result and invoice evidence to approval | 2 | 4 | 3 | 3 | 3 | Mention only |
| Public-money guard for municipalities that already invoice through Jinius (could also compete for the €1k Smart City prize) | 4 | 4 | 4 | 3 | 3 | Pitch line: same flow, public payer |
| Incident pack: one-click evidence export and bank recall request when a hold fires after payment | 3 | 4 | 2 | 4 | 3 | Roadmap |

A material edit to amount, supplier, account or invoice revision invalidates **both** the supplier confirmation and the buyer approval. Cross-buyer matching needs safeguards so one buyer cannot infer another buyer's suppliers or volumes. The revocable change broadcast carries only the supplier's new destination, never buyer payment histories.

## Three-minute demo

1. **0:00–0:45.** Show the emailed €8,420 PDF beside the supplier-issued Jinius record. Reveal the destination mismatch and the old and new destination visual. Try to approve; the server refuses.
2. **0:45–1:45.** Switch to the supplier view. The supplier rejects the emailed change, then confirms a legitimate change on a revised invoice. Back on the buyer side, an independent approver approves, and both companies' actors appear in the audit trail.
3. **1:45–2:30.** Edit the destination after approval and show that the approval expires.
4. **2:30–3:00.** Show measured results on the declared fixtures: catches, false alerts and timed review against a scripted callback. Close on the roadmap (revocable change broadcast, destination seen elsewhere) and the fewer-callbacks benefit for Jinius onboarding.

## Claims to avoid

- Calling Jinius "connected" without a successful, redacted, authorised sandbox read. Label every simulated event.
- Bank-account ownership verification, fraud probability, or "losses prevented". The score is a review priority.
- Presenting supplier confirmation as more than supplier evidence. Promising that the bank reimburses SMEs.
- Calling it "Verified Supplier", which implies an identity check TrustPay does not do.

## Disagreements and how they were settled

- **Cross-buyer IBAN matching.** Claude ranked it a core differentiator. Codex objected: it creates a new data-sharing purpose, linkable fingerprints can still be personal data under GDPR, and shared collection accounts give legitimate matches. **Settled:** roadmap only, named "destination seen elsewhere", advisory, shown with synthetic data. Production use needs Jinius authorisation and a lawful basis.
- **Visualisation.** Codex agreed it belongs in the pitch because of the 2025 winners and the listed criterion. Geography gets zero risk weight.
- **Supplier badge.** Both agree on the onboarding story. Codex's narrower label "Supplier confirmed this invoice" was adopted. "Faster payment" stays a hypothesis.
- **Opening scene.** Codex proposed the PDF-vs-Jinius comparison and Claude agreed.

## Sandbox plan after the Open Day

Create at least two fictitious entities: a buyer and a supplier (for example "Aegean Supplies Synthetic Ltd"). The supplier entity issues the invoice through the sandbox. The demo's opening comparison, the emailed PDF against the Jinius-issued record, then rests on real sandbox calls instead of a simulation. A teammate creates the account and the credentials. The client secret stays in server-side environment settings (`frontend/.env.local`, which git ignores). It never goes into chat, commits, logs or browser code.

Check these in the sandbox documentation:

1. Can one fictitious entity send an invoice to another, and can the receiver read it through the API?
2. Can the authorised **supplier** confirm or reject an exact invoice revision, and can the receiver accept, reject or dispute it? Do status changes reach us through the API or webhooks? The answer decides whether supplier confirmation runs through Jinius or inside TrustPay. Even when the invoice read is real, label a TrustPay-side confirmation separately from Jinius data.
3. Does the invoice payload carry the creditor IBAN, a stable invoice ID and a revision?
4. What are the authentication flow, token lifetime, rate limits and error formats?

## Open questions for the organisers

1. Can a sandbox read plus a TrustPay-side supplier confirmation qualify for the Jinius prize, if Jinius has no confirmation event?
2. Is pre-built code allowed, given the CC BY-SA 4.0 publication rule? May sandbox screenshots appear in public demo material?
3. Is there a rubric for the Jinius prize beyond the general criteria?

Prepare the solution declaration table early. It names the APIs used, so it is where the Jinius sandbox integration is credited.

## Research record

The independent reports and the reconciliation are kept in [research/2026-11-25-claude-findings.md](research/2026-11-25-claude-findings.md) and [research/2026-11-25-codex-findings.md](research/2026-11-25-codex-findings.md).

## Next action

The team chooses whether to adopt this plan. If it does, open an issue for the supplier-confirmation flow, starting from the existing intake, hold and maker-checker path.
