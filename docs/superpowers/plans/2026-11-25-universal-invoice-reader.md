# Universal invoice reader implementation

1. Define a strict, template-independent document schema with evidence, document classification, parties, banking, totals and line items. Keep the existing payable draft fields as a projection for current review and risk workflows.
2. Validate PDF and image inputs, including WEBP. Inspect complete PDF text and page count. Send the original document plus bounded extracted text to the multimodal provider when development document sharing is enabled; use local parsing only as fallback.
3. Run deterministic decimal, date, currency, IBAN and totals checks. Block non-payable and ambiguous documents from analysis until explicit human review.
4. Store original extraction separately from reviewed values in the existing tenant-scoped encrypted payload. Audit corrected field names without logging sensitive values. Cache identical extractions within an organization.
5. Extend the review interface with document preview, classification, evidence, warnings, financial checks and line items. Preserve the existing assessment and approval controls.
6. Build an independent synthetic corpus with a separate holdout, report measured results, verify unit/integration tests, typecheck, lint, build and an unseen-layout browser demonstration. Create a focused PR stacked on the Windows SQLite fix until that fix lands.

Ruling: The configured multimodal model is the general reader when explicit development document sharing is enabled. Without that opt-in, local extraction and manual review remain available; no private user document is sent externally.
