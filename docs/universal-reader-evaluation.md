# Universal reader evaluation — 25 November 2026

The generated corpus has 30 fictional documents: 15 digital PDFs, 5 scanned PDFs and 10 images. It includes English, Greek, German, French, Italian, Spanish, Turkish and one Arabic document. Six documents form a separate holdout with different field order and layout; prompts were not tuned on those six. One scanned PDF is rotated. Cases include a credit note, purchase order, receipt, missing IBANs, two bank accounts, an incorrect total, a prompt-injection string and two invoices in one upload. All expected values are declared in `fixtures/universal-corpus.ts`, independently of the reader. These documents are synthetic and substantially cleaner than most real photographs or handwriting.

The 30 live calls used the configured `gpt-5.4-mini` model, the official OpenAI Node SDK and the same `extractInvoice` path as the application. The [machine-readable report](universal-reader-benchmark.json) records every case, token usage, processing time and estimated cost. Results from this run:

| Measure | Result |
| --- | ---: |
| Document classification | 30/30 |
| Supplier, invoice number, currency and payable total | 30/30 each |
| IBAN, including two absent accounts and one ambiguous account | 30/30 |
| Line-item count | 30/30 |
| Strict line description, quantity and VAT-rate match | 11/30 |
| Strict line match on holdout | 3/6 |
| False extraction of absent IBAN | 0/2 |
| Average processing time | 13.382 s/document |
| Total usage | 140,117 input; 73,772 output tokens |
| Estimated total API cost | $0.4371 |

Cost uses the [published GPT-5.4 mini standard token rates](https://developers.openai.com/api/docs/models/gpt-5.4-mini) checked on 25 November 2026: $0.75 per million input tokens and $4.50 per million output tokens. It is an estimate, not an invoice from the provider, and excludes any account-specific pricing or cache discounts.

The strict line metric requires the exact synthetic description, quantity string and VAT-rate string; equivalent representations can score as failures. It exposes a review risk even though the line count was correct. The corpus does not establish accuracy on real-world suppliers, low-quality scans, handwriting, proformas, electronic invoices, complex multi-rate VAT tables or all accounting conventions. The model can still misread or omit fields. Human review, deterministic checks and independent approval remain mandatory. The local parser has no OCR or general multilingual understanding when the external provider is disabled.
