import { normalizeIban } from "../security/account";

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
