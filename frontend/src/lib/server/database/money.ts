import { sourceText } from "../../i18n/core";

export function decimalToCents(value: string): number {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) throw new Error(sourceText("invalid-monetary-amount"));
  const [whole, fraction = ""] = value.split(".");
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(sourceText("monetary-amount-exceeds-safe-range"));
  return Number(cents);
}

export function centsToDecimal(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error(sourceText("invalid-monetary-amount"));
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}
