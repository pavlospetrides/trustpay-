import { describe, expect, it } from "vitest";
import { OpenAIInvoiceProvider, ProviderUnavailable } from "./provider";

describe("OpenAI invoice adapter boundary", () => {
  it("uses complete PDF visual input plus embedded text with strict structured evidence", async () => {
    let request: Record<string, unknown> = {};
    const empty = { value: null, source_value: null, supporting_text: null, page: null, uncertain: false };
    const fields = (keys: string[]) => Object.fromEntries(keys.map((key) => [key, empty]));
    const document = {
      document_type: "invoice", languages: ["en"], multiple_invoices: false,
      document: fields(["invoice_number", "invoice_date", "due_date", "purchase_order_reference", "payment_reference", "original_invoice_reference"]),
      supplier: fields(["legal_name", "trading_name", "registration_number", "vat_number", "address", "country", "email", "telephone"]),
      customer: fields(["legal_name", "trading_name", "registration_number", "vat_number", "address", "country", "email", "telephone", "customer_reference"]),
      accounts: [], financial: fields(["currency", "subtotal", "discounts", "net_amount", "vat_amount", "additional_charges", "shipping", "gross_total", "amount_paid", "outstanding_balance"]),
      vat_breakdown: [], line_items: [], warnings: [],
    };
    const provider = new OpenAIInvoiceProvider("test-model", { responses: { parse: async (input) => { request = input; return { output_parsed: document, usage: { input_tokens: 111, output_tokens: 222 } }; } } });
    const result = await provider.extractDocument(Buffer.from("%PDF-"), "application/pdf", "Embedded invoice text");
    expect(result.usage).toEqual({ input_tokens: 111, output_tokens: 222 });
    expect(JSON.stringify(request)).toContain("input_file");
    expect(JSON.stringify(request)).toContain("Embedded invoice text");
    expect(JSON.stringify(request)).toContain("untrusted");
    expect(JSON.stringify(request)).toContain('"detail":"high"');
    expect(JSON.stringify(request)).toContain("do not calculate line-level VAT or gross totals");
    expect(JSON.stringify(request)).toContain("every printed bank account");
    expect(request.store).toBe(false);
  });
  it("sends a synthetic image for structured extraction without storing it", async () => {
    let request: Record<string, unknown> = {};
    const fake = { responses: { parse: async (input: Record<string, unknown>) => { request = input; return { output_parsed: { supplier_name: "Synthetic Supplier", registration_number: null, vat_number: null, invoice_number: "INV-1", invoice_date: "2026-11-24", due_date: null, total_amount: "10.00", currency: "EUR", iban: "GB82WEST12345698765432", payment_reference: null } }; } } };
    const provider = new OpenAIInvoiceProvider("test-model", fake);
    const fields = await provider.extract(Buffer.from([0xff, 0xd8, 0xff]), "image/jpeg");
    expect(fields.invoice_number).toBe("INV-1");
    expect(request.store).toBe(false);
    expect(request.model).toBe("test-model");
    expect(JSON.stringify(request)).toContain("untrusted");
    expect(JSON.stringify(request)).not.toContain("approve this payment");
  });
  it("rejects malformed model output", async () => {
    const provider = new OpenAIInvoiceProvider("test-model", { responses: { parse: async () => ({ output_parsed: { approval_status: "approved" } }) } });
    await expect(provider.extract(Buffer.from("%PDF-"), "application/pdf")).rejects.toBeInstanceOf(ProviderUnavailable);
  });
});
