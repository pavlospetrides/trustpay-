import { describe, expect, it } from "vitest";
import { missingReviewFields, validateInvoiceFile } from "./intake";

describe("invoice intake validation", () => {
  it("accepts a synthetic PDF within the 10 MB cap", () => {
    expect(validateInvoiceFile({ name: "synthetic.pdf", type: "application/pdf", size: 4096 })).toBeNull();
    expect(validateInvoiceFile({ name: "synthetic.webp", type: "image/webp", size: 4096 })).toBeNull();
  });

  it("rejects an oversized or mismatched image before upload", () => {
    expect(validateInvoiceFile({ name: "invoice.png", type: "image/png", size: 10 * 1024 * 1024 + 1 })).toMatch(/10 MB/);
    expect(validateInvoiceFile({ name: "invoice.exe", type: "application/pdf", size: 100 })).toMatch(/PDF, PNG, JPEG, or WEBP/);
  });

  it("keeps missing IBAN and amount in review", () => {
    expect(missingReviewFields({ supplier_name: "Synthetic Ltd", invoice_number: "A-1", invoice_date: "2026-11-23", total_amount: "", currency: "EUR", iban: "" })).toEqual(["total_amount"]);
  });
});
