import { describe, expect, it } from "vitest";
import { decimalToCents, centsToDecimal } from "./money";

describe("PostgreSQL numeric conversion", () => {
  it("converts decimal strings without binary floating-point rounding", () => {
    expect(decimalToCents("8420.01")).toBe(842001);
    expect(centsToDecimal(842001)).toBe("8420.01");
    expect(decimalToCents("0.01")).toBe(1);
  });
  it("rejects unsafe and fractional-cent values", () => {
    expect(() => decimalToCents("1.001")).toThrow();
    expect(() => decimalToCents("90071992547409.92")).toThrow();
  });
});
