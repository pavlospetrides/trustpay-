import { describe, expect, it } from "vitest";
import { assessPayment, identityMismatches, invoiceNumberKey, sameInvoiceNumber } from "./risk";

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
    expect(identityMismatches({ vat_number: "CY10012345A", registration_number: "HE 12345", supplier_name: "Αιγαίο Προμήθειες Λτδ" }, { vat_number: "GB10012345A", registration_number: "12345", supplier_name: "ΑΙΓΑΙΟ ΠΡΟΜΗΘΕΙΕΣ ΛΤΔ", country: "CY" })).toEqual(["vat_number"]);
    // The HE registry prefix may be omitted only for a Cypriot supplier.
    expect(identityMismatches({ registration_number: "HE 12345" }, { registration_number: "12345" })).toEqual(["registration_number"]);
    expect(identityMismatches({ registration_number: "AB12345" }, { registration_number: "12345" })).toEqual(["registration_number"]);
    expect(identityMismatches({ supplier_name: "Aegean Co Supplies Ltd" }, { supplier_name: "Aegean Supplies" })).toEqual(["supplier_name"]);
    const vat = assessPayment({ ...base, identityMismatches: ["vat_number"] });
    expect(vat).toMatchObject({ score: 50, recommended_status: "needs_review" });
    expect(vat.signals[0].code).toBe("SUPPLIER_IDENTITY_MISMATCH");
    expect(assessPayment({ ...base, identityMismatches: ["supplier_name"] })).toMatchObject({ score: 20, recommended_status: "ready" });
  });

  describe("invoice number matching (review item 6)", () => {
    it("ignores letter case, spacing, punctuation, invisible marks and leading zeros", () => {
      for (const variant of ["AS-2026-114", "as2026114", "AS 2026 114", "AS-2026-0114", "AS/2026/114", "\ufeffAS-2026-114", "ＡＳ-2026-114"]) expect(invoiceNumberKey(variant)).toBe("as2026114");
      expect(invoiceNumberKey("INV-0001")).toBe(invoiceNumberKey("inv 1"));
      expect(invoiceNumberKey("INV-0")).toBe("inv0");
    });
    it("matches a copy re-typed without its separators, keeping the zeros inside the number", () => {
      expect(sameInvoiceNumber("AS-2026-0114", "AS20260114")).toBe(true);
      expect(sameInvoiceNumber("AS20260114", "as-2026-0114")).toBe(true);
      expect(assessPayment({ ...base, invoiceNumber: "AS20260114", otherOpenInvoices: ["AS-2026-0114"] }).signals.map((signal) => signal.code)).toContain("POSSIBLE_DUPLICATE_INVOICE");
    });
    it("keeps genuinely different numbers apart", () => {
      expect(sameInvoiceNumber("INV-1014", "INV-114")).toBe(false);
      expect(sameInvoiceNumber("INV-114", "INV-115")).toBe(false);
      expect(sameInvoiceNumber("A-114", "B-114")).toBe(false);
      // Numbers with no letters or digits have no key and only match exactly.
      expect(sameInvoiceNumber("---", "///")).toBe(false);
      expect(sameInvoiceNumber("---", " --- ")).toBe(true);
    });
    it("flags a reformatted copy of a paid invoice for verification without hard-blocking it", () => {
      const result = assessPayment({ ...base, invoiceNumber: "ABC 0001" });
      expect(result).toMatchObject({ score: 75, recommended_status: "needs_review", kind: "possible_duplicate", level: "critical" });
      expect(result.signals[0].code).toBe("POSSIBLE_DUPLICATE_INVOICE");
      expect(result.signals[0].explanation).toContain('"ABC-001"');
      expect(result.signals[0].explanation).toContain("already paid");
    });
    it("flags a reformatted copy of an open invoice, and keeps exact copies as hard blocks", () => {
      const near = assessPayment({ ...base, invoiceNumber: "abc/0009", otherOpenInvoices: ["ABC-009"] });
      expect(near.signals.map((signal) => signal.code)).toEqual(["POSSIBLE_DUPLICATE_INVOICE"]);
      expect(near.signals[0].explanation).toContain("already open or approved");
      expect(assessPayment({ ...base, invoiceNumber: "ABC-009", otherOpenInvoices: ["abc-009"] })).toMatchObject({ score: 100, recommended_status: "blocked", kind: "duplicate" });
      expect(assessPayment({ ...base, invoiceNumber: "ABC-001" }).signals[0].code).toBe("DUPLICATE_PAID_INVOICE");
    });
    it("treats a reformatted resubmission of a rejected invoice like any resubmission", () => {
      expect(assessPayment({ ...base, invoiceNumber: "ABC 77", rejectedInvoices: ["abc-077"] }).signals.map((signal) => signal.code)).toEqual(["PREVIOUSLY_REJECTED_INVOICE"]);
    });
    it("adds a weight-0 note for the same amount under a different number within 7 days", () => {
      const other = { invoiceNumber: "ABC-050", amountCents: 700_000, invoiceDate: "2026-11-20" };
      const result = assessPayment({ ...base, invoiceDate: "2026-11-25", otherOpenInvoiceDetails: [other] });
      expect(result).toMatchObject({ score: 0, recommended_status: "ready", kind: "normal" });
      expect(result.signals[0]).toMatchObject({ code: "SAME_AMOUNT_RECENT_INVOICE", weight: 0, severity: "review" });
      expect(result.signals[0].explanation).toContain("€7,000.00");
      expect(result.signals[0].explanation).toContain("2026-11-20");
      const codes = (changes: Partial<Parameters<typeof assessPayment>[0]>) => assessPayment({ ...base, invoiceDate: "2026-11-25", otherOpenInvoiceDetails: [other], ...changes }).signals.map((signal) => signal.code);
      expect(codes({ invoiceDate: "2026-11-28" })).toEqual([]); // 8 days apart
      expect(codes({ otherOpenInvoiceDetails: [{ ...other, amountCents: 700_001 }] })).toEqual([]);
      expect(codes({ invoiceDate: null })).toEqual([]);
      // The same invoice number is the duplicate rules' job, not this note.
      expect(codes({ otherOpenInvoiceDetails: [{ ...other, invoiceNumber: "abc 003" }] })).toEqual([]);
      // It never displaces the main reason: the changed account stays first and the score stays 75.
      const changed = assessPayment({ ...base, currentAccount: "SYNTHETIC-9077", invoiceDate: "2026-11-25", otherOpenInvoiceDetails: [other] });
      expect([changed.score, changed.signals.map((signal) => signal.code)]).toEqual([75, ["BANK_ACCOUNT_CHANGED", "SAME_AMOUNT_RECENT_INVOICE"]]);
    });
  });
});
