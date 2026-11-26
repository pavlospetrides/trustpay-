# Supplied invoice test pack evaluation — 26 November 2026

The supplied `TrustPay_Jinius_Invoice_Test_Pack.zip` contains fictional documents. This run used all 13 PDFs and the scanned invoice JPG, the `gpt-5.4-mini` OpenAI reader, and the same `extractInvoice` function used by intake. External processing was explicitly enabled for this local development environment. The [JSON report](invoice-test-pack-evaluation.json) contains only case indices, formats, field names, counts, and safe error codes; case indices follow the sorted `invoices/` filenames in the ZIP.

| Measure | Final run |
| --- | ---: |
| Documents processed with OpenAI Multimodal | 14/14 |
| API failures | 0 |
| Measured field comparisons | 454/456 (99.6%) |
| Critical supplier, number, date, gross total and currency | 14/14 each |
| Critical payable IBAN | 13/14 |
| Combined six critical fields | 83/84 (98.8%) |
| Printed account IBAN comparison | 13/14 |
| Remaining document-level fields and checks | 14/14 each |
| Printed line descriptions, quantities, unit prices, discounts, VAT rates and net amounts | 41/41 each |
| Measured mismatches | 2 fields in case 1 |

The document-level comparisons cover classification, supplier, customer, invoice number, issue and due dates, currency, original invoice reference, net/VAT/printed gross totals, proposed payable IBAN, every printed account IBAN, detection of an inconsistent gross total, and line count. Case 1 mismatched the expected payable IBAN and printed-account IBAN; the raw value was deliberately not retained in the versioned report. It needs human confirmation. The case with two printed accounts correctly produced two account records and no selected payable IBAN. The missing and invalid IBAN cases did not produce a payable IBAN. The deliberately wrong total was flagged by the deterministic gross-total check. Credit note and USD classification/extraction were measured; the payable risk workflow remains EUR-only and excludes credit notes.

The reference gives 82 line-level VAT and gross amounts calculated from printed net amounts and rates, but the invoice rows do not print those amounts. They are excluded from extraction accuracy because inventing them would violate the visible-evidence rule. The model is instructed to leave unsupported values null, but this run did not measure its compliance with that instruction. Field-by-field counts and any mismatches are in the JSON report.

An exploratory run with the former 30-second provider timeout fell back to local text on the multi-page PDF and scored 119/126 on a narrower nine-field comparison. The provider swallowed the underlying exception, so a timeout is consistent with the observation but not proven. After increasing the timeout to 90 seconds and requesting high PDF page detail, a focused multi-page rerun and the final full run succeeded. Signed-in Playwright runs passed upload, populated review fields, source evidence, line items, private preview and correction persistence before the hosted project's quota was exhausted. The final browser rerun on 26 November stopped at sign-in because Supabase reported `exceed_egress_quota`; it did not reach invoice upload.

Run the live measurement from `frontend` with `TRUSTPAY_LIVE_TEST_PACK=1` and `TRUSTPAY_TEST_PACK_PATH` pointing to the extracted ZIP. The helper requires `TRUSTPAY_ENVIRONMENT=development`, `TRUSTPAY_AI_EXTERNAL_DOCUMENTS=development`, and a configured server-side `OPENAI_API_KEY`; default test runs skip it. It does not log invoice values or credentials.

This clean synthetic pack does not measure handwriting, poor photos, unseen suppliers, or all currencies and tax conventions. It also does not test the changed-account and duplicate fraud outcomes against seeded supplier history; those policies remain covered by the existing regression suite. The measured score does not imply universal accuracy. Human review and server-side payment controls remain required.
