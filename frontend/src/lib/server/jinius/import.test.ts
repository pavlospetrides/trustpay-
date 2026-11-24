import { describe, expect, it } from "vitest";
import { importProblem } from "./import";
import { demoInvoices } from "./demo";

const base = { ...demoInvoices[0], revision: "1" };
describe("synthetic Jinius import validation", () => {
  it("accepts the known synthetic invoice", () => { expect(importProblem(base)).toBeNull(); });
  it.each([
    [{ creditor_account: " " }, "Invoice has no payment account"],
    [{ creditor_account: "SYNTHETIC-CY-9077" }, "Payment account is not a valid IBAN"],
    [{ id: "INV 2409; drop" }, "Provider invoice reference is missing or malformed"],
    [{ revision: "b-rc" }, "Provider invoice reference is missing or malformed"],
    [{ date: "19/11/2026" }, "Invoice date is missing or invalid"],
    [{ amount_cents: 0 }, "Invoice number or amount is missing"],
  ] as const)("rejects malformed provider evidence", (changes, message) => { expect(importProblem({ ...base, ...changes })).toBe(message); });
});
