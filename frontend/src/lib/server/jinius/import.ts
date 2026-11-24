import { createHmac } from "node:crypto";
import { normalizeIban } from "../security/account";

export const UNKNOWN_SUPPLIER = "Supplier is not known in this organization";

// Python's json.dumps defaults (", " separator, ASCII-only escapes), so digests stored by the Python backend still match.
const pythonJsonList = (values: (string | number)[]) =>
  `[${values.map((value) => typeof value === "number" ? String(value)
    : JSON.stringify(value).replace(/[^\x20-\x7e]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`)).join(", ")}]`;

/** Keyed, so the stored digest reveals nothing about the account; resolve uses it to detect a changed record. */
export function recordDigest(fingerprintKey: Buffer, record: Pick<NormalizedInvoice, "id" | "revision" | "supplier_id" | "number" | "amount_cents" | "date" | "creditor_account">): string {
  const fields = [record.id, record.revision, record.supplier_id, record.number, record.amount_cents, record.date, record.creditor_account];
  return createHmac("sha256", fingerprintKey).update(pythonJsonList(fields)).digest("hex");
}

export interface NormalizedInvoice {
  id: string; supplier_id: string; number: string; amount_cents: number;
  creditor_account: string; date: string; source: string; revision: string;
}

export function importProblem(record: NormalizedInvoice): string | null {
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(record.id || "") || !/^[A-Za-z0-9._]{1,64}$/.test(record.revision || "")) return "Provider invoice reference is missing or malformed";
  if (!record.number?.trim() || !Number.isSafeInteger(record.amount_cents) || record.amount_cents <= 0) return "Invoice number or amount is missing";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(record.date) || Number.isNaN(Date.parse(`${record.date}T00:00:00Z`)) || new Date(`${record.date}T00:00:00Z`).toISOString().slice(0, 10) !== record.date) return "Invoice date is missing or invalid";
  if (!record.creditor_account?.trim()) return "Invoice has no payment account";
  try { normalizeIban(record.creditor_account); } catch { return "Payment account is not a valid IBAN"; }
  return null;
}
