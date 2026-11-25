import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { importProblem, recordDigest } from "./import";
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

describe("record digest", () => {
  it("signs a missing field as null, as Python's json.dumps did, instead of crashing the sync", () => {
    const key = Buffer.alloc(32, "b");
    const expected = createHmac("sha256", key).update('["INV-2409", "1", "SUP-001", "AS-2026-114", 842000, "2026-11-19", null]').digest("hex");
    expect(recordDigest(key, { ...base, creditor_account: undefined as unknown as string })).toBe(expected);
  });
});
