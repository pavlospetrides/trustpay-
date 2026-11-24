import { describe, expect, it } from "vitest";
import { OpenAIInvoiceProvider, ProviderUnavailable } from "./provider";

describe("OpenAI invoice adapter boundary", () => {
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
