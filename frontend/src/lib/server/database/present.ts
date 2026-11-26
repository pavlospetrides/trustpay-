import type { Invoice, Signal } from "../../types";
import { decimalToCents } from "./money";

export interface HistoricalPayment { iban_fingerprint: string; iban_last4: string; amount: string; historical_invoice_number: string | null }
export interface InvoiceRow {
  public_id: string; supplier_public_id: string; supplier_name: string; invoice_number: string;
  total_amount: string; iban_last4: string; issue_date: string; score: number;
  severity: string; kind: string; explanation: string; status: Invoice["status"];
  verified_by: string | null; approved_by: string | null; external_source: string;
  ai_explanation: string | null; ai_explanation_method: Invoice["ai_explanation_method"];
}
const sourceLabels: Record<string, string> = { synthetic_seed: "Synthetic development seed", uploaded: "Uploaded invoice", jinius_demo_adapter: "Synthetic Jinius demo" };
const mask = (last4?: string | null) => last4 ? `•••• ${last4.trim()}` : "••••";

export function presentInvoice(row: InvoiceRow, history: HistoricalPayment[], signals: (Signal & { severity?: string })[]): Invoice {
  const counts = new Map<string, number>();
  for (const item of history) counts.set(item.iban_fingerprint, (counts.get(item.iban_fingerprint) ?? 0) + 1);
  const canonical = counts.size ? [...counts.keys()].sort().reduce((best, value) => counts.get(value)! > counts.get(best)! ? value : best) : null;
  const previous = history.find((item) => item.iban_fingerprint === canonical)?.iban_last4;
  const amountCents = decimalToCents(row.total_amount);
  return {
    id: row.public_id, supplier_id: row.supplier_public_id, supplier: row.supplier_name, short: row.supplier_name,
    invoice: row.invoice_number, amount_cents: amountCents, amount: amountCents / 100, iban: mask(row.iban_last4),
    previous: previous ? mask(previous) : "New supplier", history: history.length,
    date: row.issue_date,
    risk: row.score, level: row.severity, kind: row.kind, reason: row.explanation, signals,
    ai_explanation: row.ai_explanation, ai_explanation_method: row.ai_explanation_method,
    notes: signals.length ? signals.map((signal) => signal.explanation) : [row.explanation],
    status: row.status, verified: Boolean(row.verified_by), verified_by: row.verified_by, approved_by: row.approved_by,
    reference: sourceLabels[row.external_source] ?? "Manual assessment", source: row.external_source,
  };
}

export function presentSupplierHistory(history: HistoricalPayment[]): { last4: string; median: number | null } {
  const counts = new Map<string, number>();
  for (const item of history) counts.set(item.iban_fingerprint, (counts.get(item.iban_fingerprint) ?? 0) + 1);
  const canonical = counts.size ? [...counts.keys()].sort().reduce((best, value) => counts.get(value)! > counts.get(best)! ? value : best) : null;
  const previous = history.find((item) => item.iban_fingerprint === canonical)?.iban_last4;
  const amounts = history.map((item) => decimalToCents(item.amount)).sort((a, b) => a - b);
  const middle = Math.floor(amounts.length / 2);
  const median = amounts.length ? (amounts.length % 2 ? amounts[middle] : (amounts[middle - 1] + amounts[middle]) / 2) / 100 : null;
  return { last4: mask(previous), median };
}
