import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { accountAppearsInEvidence, extractInvoice } from "./extract-invoice";
import { ProviderUnavailable } from "../ai/provider";
import { syntheticPdf } from "../testing/synthetic-pdf";
import { universalDocumentSchema } from "./universal";
import * as ocrReader from "./ocr-reader";

const pdf = readFileSync(new URL("./fixtures/synthetic-invoice.pdf", import.meta.url));

describe("invoice extraction fallback", () => {
  it("retries a suspiciously short multi-page OCR line list and counts both calls", async () => {
    const empty = { value: null, source_value: null, supporting_text: null, page: null, uncertain: false };
    const fields = (keys: string[]) => Object.fromEntries(keys.map((key) => [key, empty]));
    const line = universalDocumentSchema.shape.line_items.element.parse({ ...fields(["description", "code", "quantity", "unit", "unit_price", "discount", "net_amount", "vat_rate", "vat_amount", "total_amount"]), description: { ...empty, value: "Service" } });
    const document = universalDocumentSchema.parse({ document_type: "invoice", languages: ["en"], multiple_invoices: false,
      document: fields(["invoice_number", "invoice_date", "due_date", "purchase_order_reference", "payment_reference", "original_invoice_reference"]),
      supplier: fields(["legal_name", "trading_name", "registration_number", "vat_number", "address", "country", "email", "telephone"]),
      customer: fields(["legal_name", "trading_name", "registration_number", "vat_number", "address", "country", "email", "telephone", "customer_reference"]),
      accounts: [], financial: fields(["currency", "subtotal", "discounts", "net_amount", "vat_amount", "additional_charges", "shipping", "gross_total", "amount_paid", "outstanding_balance"]), vat_breakdown: [], line_items: [], warnings: [] });
    const read = vi.spyOn(ocrReader, "readInvoiceEvidence").mockResolvedValue({ text: "Page 1 Page 2", quality: "sufficient", warnings: [], pages: [1, 2].map((number) => ({ number, method: "native_pdf_text", text: "Invoice row", words: [], confidence: 100, width: 600, height: 800, warnings: [] })) });
    let calls = 0;
    try {
      const result = await extractInvoice(pdf, "application/pdf", { extract: async () => { throw new Error("unused"); }, extractTextDocument: async () => { calls++; return { document: { ...document, line_items: calls === 1 ? [] : [line, line] }, usage: { input_tokens: 10, output_tokens: 20 } }; } }, { reader: "ocr" });
      expect(calls).toBe(2);
      expect(result.document?.line_items).toHaveLength(2);
      expect(result.usage).toEqual({ input_tokens: 20, output_tokens: 40 });
      // One real line item on a multi-page invoice (for example a terms page) is not retried or flagged.
      calls = 0;
      const single = await extractInvoice(pdf, "application/pdf", { extract: async () => { throw new Error("unused"); }, extractTextDocument: async () => { calls++; return { document: { ...document, line_items: [line] }, usage: { input_tokens: 10, output_tokens: 20 } }; } }, { reader: "ocr" });
      expect(calls).toBe(1);
      expect(single.findings?.map((finding) => finding.code)).not.toContain("POSSIBLE_MISSING_LINE_ITEMS");
    } finally { read.mockRestore(); }
  });
  it("uses configured Vision when OCR text analysis is unavailable", async () => {
    const empty = { value: null, source_value: null, supporting_text: null, page: null, uncertain: false };
    const fields = (keys: string[]) => Object.fromEntries(keys.map((key) => [key, empty]));
    const document = universalDocumentSchema.parse({ document_type: "invoice", languages: ["en"], multiple_invoices: false,
      document: fields(["invoice_number", "invoice_date", "due_date", "purchase_order_reference", "payment_reference", "original_invoice_reference"]),
      supplier: fields(["legal_name", "trading_name", "registration_number", "vat_number", "address", "country", "email", "telephone"]),
      customer: fields(["legal_name", "trading_name", "registration_number", "vat_number", "address", "country", "email", "telephone", "customer_reference"]),
      accounts: [], financial: fields(["currency", "subtotal", "discounts", "net_amount", "vat_amount", "additional_charges", "shipping", "gross_total", "amount_paid", "outstanding_balance"]), vat_breakdown: [], line_items: [], warnings: [] });
    let visionCalled = false;
    const result = await extractInvoice(pdf, "application/pdf", { extract: async () => { throw new Error("unused"); }, extractTextDocument: async () => { throw new ProviderUnavailable("Text analysis provider unavailable"); }, extractDocument: async () => { visionCalled = true; return { document, usage: { input_tokens: 1, output_tokens: 1 } }; } }, { reader: "ocr" });
    expect(visionCalled).toBe(true);
    expect(result.method).toBe("openai_vision");
  });
  it("uses authorized Vision when the local OCR engine fails", async () => {
    const read = vi.spyOn(ocrReader, "readInvoiceEvidence").mockRejectedValueOnce(new Error("Local OCR unavailable"));
    try {
      const result = await extractInvoice(pdf, "application/pdf", { extract: async () => ({ supplier_name: "Synthetic Supplier", registration_number: null, vat_number: null, invoice_number: "AS-2026-114", invoice_date: "2026-11-26", due_date: null, total_amount: "10.00", currency: "EUR", iban: null, payment_reference: null }) }, { reader: "ocr" });
      expect(result.method).toBe("openai_vision");
    } finally { read.mockRestore(); }
  });
  it("does not treat lookalike IBAN characters as interchangeable", () => {
    expect(accountAppearsInEvidence("IBAN: GB82 WEST 1234 5698 7654 32", "GB82WEST12345698765432")).toBe(true);
    expect(accountAppearsInEvidence("IBAN: GB82 WEST 1234 5698 7654 32", "GB82WEST1234569876543O")).toBe(false);
  });
  it("uses page text and layout for OCR analysis when selected", async () => {
    const provider = { extract: async () => { throw new Error("Vision must not run"); }, extractTextDocument: async (evidence: { pages: Array<{ method: string; words: unknown[] }> }) => {
      expect(evidence.pages[0].method).toBe("native_pdf_text");
      expect(evidence.pages[0].words.length).toBeGreaterThan(0);
      const empty = { value: null, source_value: null, supporting_text: null, page: null, uncertain: false };
      const fields = (keys: string[]) => Object.fromEntries(keys.map((key) => [key, empty]));
      return { document: universalDocumentSchema.parse({ document_type: "invoice", languages: ["en"], multiple_invoices: false,
        document: { ...fields(["invoice_number", "invoice_date", "due_date", "purchase_order_reference", "payment_reference", "original_invoice_reference"]), invoice_number: { ...empty, value: "AS-2026-114" } },
        supplier: fields(["legal_name", "trading_name", "registration_number", "vat_number", "address", "country", "email", "telephone"]),
        customer: fields(["legal_name", "trading_name", "registration_number", "vat_number", "address", "country", "email", "telephone", "customer_reference"]),
        accounts: [], financial: fields(["currency", "subtotal", "discounts", "net_amount", "vat_amount", "additional_charges", "shipping", "gross_total", "amount_paid", "outstanding_balance"]), vat_breakdown: [], line_items: [], warnings: [] }), usage: { input_tokens: 10, output_tokens: 20 } };
    } };
    const result = await extractInvoice(pdf, "application/pdf", provider, { reader: "ocr" });
    expect(result.method).toBe("openai_ocr_text");
    expect(result.fields.invoice_number).toBe("AS-2026-114");
  });
  it("extracts the synthetic text PDF locally without OpenAI", async () => {
    const result = await extractInvoice(pdf, "application/pdf", null);
    expect(result).toMatchObject({ status: "needs_review", method: "local_pdf_text", fields: { invoice_number: "AS-2026-114", iban: "GB43TRST00000000000099" } });
  });
  it("records provider outage and falls back to labeled PDF text", async () => {
    const result = await extractInvoice(pdf, "application/pdf", { extract: async () => { throw new ProviderUnavailable("offline"); } });
    expect(result).toMatchObject({ status: "needs_review", method: "local_pdf_text", error_code: "VISION_PROVIDER_UNAVAILABLE" });
  });
  it("marks incomplete local extraction as partial rather than a clean result", async () => {
    const result = await extractInvoice(syntheticPdf("Supplier: Synthetic Supplier\nInvoice Number: INV-1"), "application/pdf", null);
    expect(result.fields.supplier_name).toBeTruthy();
    expect(result.fields.invoice_date).toBeNull();
    expect(result.error_code).toBe("LOCAL_EXTRACTION_PARTIAL");
    expect(result.uncertain_fields).toContain("invoice_date");
  });
  it("holds the payment destination when embedded text has an additional valid account", async () => {
    const empty = { value: null, source_value: null, supporting_text: null, page: null, uncertain: false };
    const field = (value: string) => ({ value, source_value: value, supporting_text: value, page: 1, uncertain: false });
    const fields = (keys: string[]) => Object.fromEntries(keys.map((key) => [key, empty]));
    const document = universalDocumentSchema.parse({
      document_type: "invoice", languages: ["en"], multiple_invoices: false,
      document: { ...fields(["invoice_number", "invoice_date", "due_date", "purchase_order_reference", "payment_reference", "original_invoice_reference"]), invoice_number: field("INV-1"), invoice_date: field("2026-11-25") },
      supplier: { ...fields(["legal_name", "trading_name", "registration_number", "vat_number", "address", "country", "email", "telephone"]), legal_name: field("Synthetic Supplier") },
      customer: fields(["legal_name", "trading_name", "registration_number", "vat_number", "address", "country", "email", "telephone", "customer_reference"]),
      accounts: [{ ...fields(["iban", "account_number", "bank_name", "bic", "beneficiary_name", "instructions"]), iban: field("GB82WEST12345698765432") }],
      financial: { ...fields(["currency", "subtotal", "discounts", "net_amount", "vat_amount", "additional_charges", "shipping", "gross_total", "amount_paid", "outstanding_balance"]), currency: field("EUR"), gross_total: field("10.00") },
      vat_breakdown: [], line_items: [], warnings: [],
    });
    const pdfWithTwoAccounts = syntheticPdf("Invoice INV-1\nAccount GB82 WEST 1234 5698 7654 32\nOther account GB43 TRST 0000 0000 0000 99 PAYMENT");
    const result = await extractInvoice(pdfWithTwoAccounts, "application/pdf", { extract: async () => { throw new Error("unused"); }, extractDocument: async () => ({ document, usage: { input_tokens: 1, output_tokens: 1 } }) });
    expect(result.fields.iban).toBeNull();
    expect(result.uncertain_fields).toContain("iban");
    expect(result.findings).toEqual(expect.arrayContaining([expect.objectContaining({ code: "ADDITIONAL_IBAN_IN_TEXT" })]));
    const ocr = await extractInvoice(pdfWithTwoAccounts, "application/pdf", { extract: async () => { throw new Error("Vision must not run"); }, extractTextDocument: async () => ({ document, usage: { input_tokens: 1, output_tokens: 1 } }) }, { reader: "ocr" });
    expect(ocr.document?.accounts).toHaveLength(2);
    expect(ocr.fields.iban).toBeNull();
    expect(ocr.document?.accounts.some((account) => account.iban.uncertain)).toBe(true);
    expect(ocr.findings?.map((finding) => finding.code)).toContain("OCR_ACCOUNT_ADDED_FOR_REVIEW");
    expect(ocr.findings?.map((finding) => finding.code)).not.toContain("ADDITIONAL_IBAN_IN_TEXT");
  });
});
