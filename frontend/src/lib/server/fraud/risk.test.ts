import { describe, expect, it } from "vitest";
import { assessPayment } from "./risk";

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
});
