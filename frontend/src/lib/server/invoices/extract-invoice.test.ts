import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { extractInvoice } from "./extract-invoice";
import { ProviderUnavailable } from "../ai/provider";
import { syntheticPdf } from "../testing/synthetic-pdf";
import { universalDocumentSchema } from "./universal";

const pdf = readFileSync(new URL("./fixtures/synthetic-invoice.pdf", import.meta.url));

describe("invoice extraction fallback", () => {
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
  });
});
