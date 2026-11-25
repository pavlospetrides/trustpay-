import { describe, expect, it } from "vitest";
import { minorUnits, projectPayableFields, universalDocumentSchema, validateUniversalDocument } from "./universal";

const field = (value: string | null) => ({ value, source_value: value, supporting_text: value, page: value ? 1 : null, uncertain: false });
const empty = field(null);
const party = { legal_name: empty, trading_name: empty, registration_number: empty, vat_number: empty, address: empty, country: empty, email: empty, telephone: empty };
const sample = () => universalDocumentSchema.parse({
  document_type: "invoice", languages: ["en"], multiple_invoices: false,
  document: { invoice_number: field("INV-93"), invoice_date: field("2026-11-25"), due_date: empty, purchase_order_reference: empty, payment_reference: empty, original_invoice_reference: empty },
  supplier: { ...party, legal_name: field("Synthetic Ltd") }, customer: { ...party, customer_reference: empty },
  accounts: [{ iban: field("GB82WEST12345698765432"), account_number: empty, bank_name: empty, bic: empty, beneficiary_name: empty, instructions: empty }],
  financial: { currency: field("EUR"), subtotal: field("1.000,00"), discounts: empty, net_amount: empty, vat_amount: field("240,00"), additional_charges: empty, shipping: empty, gross_total: field("1.240,00"), amount_paid: empty, outstanding_balance: empty },
  vat_breakdown: [], line_items: [], warnings: [],
});

describe("universal invoice validation", () => {
  it("parses EU and international amounts exactly, including credits", () => {
    expect(minorUnits("1.250,50")).toBe(125050n);
    expect(minorUnits("1,250.50")).toBe(125050n);
    expect(minorUnits("(1.250,50)")).toBe(-125050n);
    expect(minorUnits("1,2,3")).toBeNull();
  });
  it("projects payable fields and checks stated totals", () => {
    const doc = sample();
    expect(projectPayableFields(doc).total_amount).toBe("1.240,00");
    expect(validateUniversalDocument(doc)).toEqual([]);
    doc.financial.gross_total = field("1.300,00");
    expect(validateUniversalDocument(doc)).toEqual(expect.arrayContaining([expect.objectContaining({ code: "GROSS_MISMATCH" })]));
  });
  it("blocks unrelated and multiple-invoice documents", () => {
    const doc = sample();
    doc.document_type = "purchase_order";
    doc.multiple_invoices = true;
    expect(validateUniversalDocument(doc).filter((finding) => finding.severity === "blocking")).toHaveLength(2);
  });
  it("checks line quantity and tax without floating point arithmetic", () => {
    const doc = sample();
    doc.line_items.push({ description: field("Service"), code: empty, quantity: field("2"), unit: empty, unit_price: field("500,00"), discount: empty, net_amount: field("1.000,00"), vat_rate: field("24%"), vat_amount: field("240,00"), total_amount: field("1.240,00") });
    expect(validateUniversalDocument(doc)).toEqual([]);
    doc.line_items[0].vat_amount = field("230,00");
    expect(validateUniversalDocument(doc)).toEqual(expect.arrayContaining([expect.objectContaining({ code: "LINE_VAT" })]));
  });
  it("flags a VAT breakdown that disagrees with the stated VAT", () => {
    const doc = sample();
    doc.vat_breakdown.push({ rate: field("24%"), net_amount: field("1.000,00"), vat_amount: field("230,00") });
    expect(validateUniversalDocument(doc)).toEqual(expect.arrayContaining([expect.objectContaining({ code: "VAT_BREAKDOWN_MISMATCH" })]));
  });
  it("marks invalid bank details and due dates for review", () => {
    const doc = sample();
    doc.accounts[0].iban = field("GB00INVALID");
    doc.document.due_date = field("2026-11-20");
    expect(validateUniversalDocument(doc).map((finding) => finding.code)).toEqual(expect.arrayContaining(["INVALID_IBAN", "DATE_ORDER"]));
  });
  it("flags beneficiary and amount currency conflicts", () => {
    const doc = sample();
    doc.accounts[0].beneficiary_name = field("Another Company");
    doc.financial.gross_total = field("1.240,00 USD");
    expect(validateUniversalDocument(doc).map((finding) => finding.code)).toEqual(expect.arrayContaining(["BENEFICIARY_MISMATCH", "CURRENCY_MISMATCH"]));
  });
});
