# Offline OCR candidate evaluation — 26 November 2026

The OCR candidate reads each page locally with PDF.js native text or English/Greek Tesseract.js WASM, then sends text and word coordinates to the existing OpenAI universal-document analyzer. It never sends PDF or image bytes in this path. The existing Vision path remains the default. All documents here are fictional. The [OCR pack data](invoice-test-pack-ocr-evaluation.json), [fresh Vision data](invoice-test-pack-vision-rerun.json), and [new synthetic image data](invoice-ocr-unseen-evaluation.json) contain counts and metrics only, with no invoice text, account values or filenames.

| Measure | Historical Vision baseline | Fresh Vision rerun | OCR + OpenAI text final run |
| --- | ---: | ---: | ---: |
| Supplied pack documents | 14 | 14 | 14 |
| Measured fields correct | 454/456 | 456/456 | 456/456 |
| Payable IBAN | 13/14 | 14/14 | 14/14 |
| Printed-account comparison | 13/14 | 14/14 | 14/14 |
| Extraction elapsed time | Not recorded | 186.9 s | 175.7 s |
| Estimated OpenAI API token cost | Not recorded | $0.2228 | $0.2397 |

The candidate's two earlier full runs scored 455/456 because analysis omitted an alternative printed account. A later code change adds checksum-valid OCR account candidates to the review document as **uncertain** evidence, keeps the payable IBAN empty, and requires the reviewer to verify every character. The final run scored 456/456. The variability and 7.6% higher estimated API token cost justify keeping Vision as the default while the candidate is evaluated on a broader, independently labeled set.

For the 12 PDFs with usable native text, a *forced OCR* pass had mean character error rate 9.74% against PDF.js text after Unicode normalization and removal of whitespace/punctuation. This measures OCR recognition; the normal reader used reliable native text on those pages. The two supplied scanned forms lack an independent character transcript, so their CER is unscored. Two new, previously unseen synthetic invoices were generated for this branch: a mildly blurred and rotated JPEG photo and a Greek/English scanned PDF. Actual local OCR plus text analysis populated all six checked critical fields on each; CER against their generated source text was 5.16% and 8.92%, respectively. These small, clean examples do not establish performance on severe blur, perspective distortion or handwriting.

All 14 pack files used the OCR text-analysis method in the final run; zero OpenAI failures occurred. Processing time excludes the extra forced-OCR measurement pass. Cost uses the [published `gpt-5.4-mini` standard token rates](https://developers.openai.com/api/docs/models/gpt-5.4-mini) of $0.75 per million input tokens and $4.50 per million output tokens, without discounts, tax, local CPU or storage costs. It is an estimate from response usage, not a billing record.

The candidate is selected only with `TRUSTPAY_INVOICE_READER=ocr` in the explicitly authorized synthetic development environment. If local OCR is insufficient or unavailable, an authorized Vision provider remains the fallback. If no provider is configured, uncertain local OCR fields remain in manual review. Each intake's method and quality warning are visible to reviewers; the original document remains the source of truth. The signed-in hosted browser upload could not be rerun because the designated Supabase project reported `exceed_egress_quota`; successful local extraction and field-shape tests do not substitute for that interface check.
