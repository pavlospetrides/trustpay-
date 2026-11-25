import { describe, expect, it } from "vitest";
import { presentInvoice } from "./present";

describe("PostgreSQL invoice response compatibility", () => {
  it("masks bank details and reports historical payment count", () => {
    const invoice = presentInvoice({ public_id: "INV-2409", supplier_public_id: "SUP-001", supplier_name: "Aegean Supplies", invoice_number: "AS-2026-114", total_amount: "8420.00", iban_last4: "0099", issue_date: "2026-11-19", score: 75, severity: "critical", kind: "iban", explanation: "Changed account", status: "needs_review", verified_by: null, approved_by: null, external_source: "jinius_demo_adapter", ai_explanation: null, ai_explanation_method: null }, Array(14).fill({ iban_fingerprint: "old", iban_last4: "0001", amount: "7600.00", historical_invoice_number: "AS-HIST" }), [{ code: "BANK_ACCOUNT_CHANGED", weight: 75, explanation: "Changed account", severity: "critical" }]);
    expect(invoice).toMatchObject({ id: "INV-2409", supplier_id: "SUP-001", amount_cents: 842000, iban: "•••• 0099", previous: "•••• 0001", history: 14, risk: 75, status: "needs_review", reference: "Synthetic Jinius demo" });
  });
});
