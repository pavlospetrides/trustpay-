import { describe, expect, it } from "vitest";
import { assessPayment, identityMismatches } from "./risk";

const base = {
  invoiceNumber: "ABC-003",
  currentAccount: "SYNTHETIC-1842",
  amountCents: 700_000,
  previousAccounts: Array(14).fill("SYNTHETIC-1842") as string[],
  previousPaidAmountsCents: Array(14).fill(700_000) as number[],
  previouslyPaidInvoices: ["ABC-001", "ABC-002"],
};

describe("Python risk engine parity", () => {
  it.each([
    ["normal", {}, 0, "ready", "normal", []],
    ["changed account", { currentAccount: "SYNTHETIC-9077" }, 75, "needs_review", "iban", ["BANK_ACCOUNT_CHANGED"]],
    ["duplicate", { invoiceNumber: "aBc-001" }, 100, "blocked", "duplicate", ["DUPLICATE_PAID_INVOICE"]],
    ["large amount", { amountCents: 1_900_000 }, 65, "needs_review", "amount", ["LARGE_AMOUNT_DEVIATION"]],
    ["combined", { currentAccount: "DIFFERENT", amountCents: 1_900_000 }, 100, "needs_review", "iban", ["BANK_ACCOUNT_CHANGED", "LARGE_AMOUNT_DEVIATION"]],
    ["no history", { previousAccounts: [], previousPaidAmountsCents: [], previouslyPaidInvoices: [] }, 45, "needs_review", "new", ["NEW_SUPPLIER_OR_NO_HISTORY"]],
  ] as const)("matches %s", (_name, changes, score, status, kind, codes) => {
    const result = assessPayment({ ...base, ...changes });
    expect([result.score, result.recommended_status, result.kind]).toEqual([score, status, kind]);
    expect(result.signals.map((signal) => signal.code)).toEqual(codes);
  });

  it("normalizes account whitespace and invoice case", () => {
    expect(assessPayment({ ...base, currentAccount: "syn thetic-1842" }).score).toBe(0);
    expect(assessPayment({ ...base, invoiceNumber: "  abc-001 " }).recommended_status).toBe("blocked");
  });

  it("uses exact integer thresholds", () => {
    expect(assessPayment({ ...base, amountCents: 1_224_999 }).score).toBe(0);
    expect(assessPayment({ ...base, amountCents: 1_225_000 }).score).toBe(40);
    expect(assessPayment({ ...base, amountCents: 1_750_000 }).score).toBe(65);
  });

  it("rejects invalid amounts", () => {
    expect(() => assessPayment({ ...base, amountCents: 0 })).toThrow();
    expect(() => assessPayment({ ...base, amountCents: 1.5 })).toThrow();
  });

  it("downgrades a changed account that was independently verified, without hiding it", () => {
    const changed = { ...base, currentAccount: "SYNTHETIC-9999" };
    expect(assessPayment(changed)).toMatchObject({ score: 75, recommended_status: "needs_review" });
    const verified = assessPayment({ ...changed, accountVerifiedOn: "2026-11-20" });
    expect(verified).toMatchObject({ score: 25, recommended_status: "ready", kind: "iban" });
    expect(verified.signals[0]).toMatchObject({ code: "BANK_ACCOUNT_VERIFIED_CHANGE", severity: "review" });
    expect(verified.signals[0].explanation).toContain("2026-11-20");
  });

  it("flags VAT or registration mismatches strongly and name mismatches softly", () => {
    expect(identityMismatches({ vat_number: "CY 1001-2345A", registration_number: "HE 12345", supplier_name: "Aegean Supplies Ltd." }, { vat_number: "10012345a", registration_number: "he12345", supplier_name: "AEGEAN SUPPLIES LIMITED" })).toEqual([]);
    expect(identityMismatches({ vat_number: null, registration_number: "HE1" }, { vat_number: "CY1", registration_number: null })).toEqual([]);
    expect(identityMismatches({ vat_number: "CY99999999Z", supplier_name: "Other Trading" }, { vat_number: "CY10012345A", supplier_name: "Aegean Supplies Ltd" })).toEqual(["vat_number", "supplier_name"]);
    const vat = assessPayment({ ...base, identityMismatches: ["vat_number"] });
    expect(vat).toMatchObject({ score: 50, recommended_status: "needs_review" });
    expect(vat.signals[0].code).toBe("SUPPLIER_IDENTITY_MISMATCH");
    expect(assessPayment({ ...base, identityMismatches: ["supplier_name"] })).toMatchObject({ score: 20, recommended_status: "ready" });
  });
});
