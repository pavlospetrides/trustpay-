import { sourceText } from "../../i18n/core";
import { z } from "zod";
import type { InvoiceDraftFields } from "../../intake";
import { normalizeIban } from "../security/account";

const nullableText = z.string().nullable();
export const proposedFieldsSchema = z.strictObject({
  supplier_name: nullableText, registration_number: nullableText, vat_number: nullableText,
  invoice_number: nullableText, invoice_date: nullableText, due_date: nullableText,
  total_amount: nullableText, currency: nullableText, iban: nullableText, payment_reference: nullableText,
});
const isoDate = z.string().refine((value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value, sourceText("use-an-iso-invoice-date"));
const requiredText = z.string().trim().min(2).max(128);
const amount = z.string().trim().regex(/^\d{1,10}(?:\.\d{1,2})?$/).refine((value) => { const [whole, fraction = ""] = value.split("."); const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0")); return cents > 0n && cents <= 100_000_000_000n; }, sourceText("amount-is-outside-accepted-range")).transform((value) => { const [whole, fraction = ""] = value.split("."); return `${whole}.${fraction.padEnd(2, "0")}`; });
export const reviewedInvoiceSchema = z.strictObject({
  supplier_name: requiredText, registration_number: nullableText, vat_number: nullableText,
  invoice_number: requiredText, invoice_date: isoDate, due_date: isoDate.nullable(),
  total_amount: amount, currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  iban: z.string().transform((value, context) => { try { return normalizeIban(value); } catch { context.addIssue({ code: "custom", message: sourceText("a-valid-iban-is-required") }); return z.NEVER; } }),
  payment_reference: nullableText,
}).refine((value) => !value.due_date || value.due_date >= value.invoice_date, sourceText("due-date-cannot-precede-invoice-date"));

export const requiredFields = ["supplier_name", "invoice_number", "invoice_date", "total_amount", "currency", "iban"] as const;
const labelMap: Record<string, keyof InvoiceDraftFields> = {
  supplier: "supplier_name", "supplier name": "supplier_name", "registration number": "registration_number", "supplier registration number": "registration_number",
  "vat number": "vat_number", "vat no": "vat_number", "invoice number": "invoice_number", "invoice no": "invoice_number",
  "invoice date": "invoice_date", "due date": "due_date", "total amount": "total_amount", total: "total_amount",
  currency: "currency", iban: "iban", "payment reference": "payment_reference",
};
const emptyFields = (): InvoiceDraftFields => ({ supplier_name: null, registration_number: null, vat_number: null, invoice_number: null, invoice_date: null, due_date: null, total_amount: null, currency: null, iban: null, payment_reference: null });
export interface ExtractionResult { fields: InvoiceDraftFields; uncertain_fields: string[]; method: "local_pdf_text" | "openai_vision"; status: "needs_review" | "provider_unavailable"; error_code: string | null }

export function parseLabeledText(text: string): ExtractionResult {
  const fields = emptyFields();
  const conflicts = new Set<keyof InvoiceDraftFields>();
  for (const line of text.split(/\r?\n/).slice(0, 400)) {
    const match = /^\s*([A-Za-z ]{2,40}):\s*(.{1,160})\s*$/.exec(line);
    if (!match) continue;
    const key = labelMap[match[1].trim().toLowerCase().replace(/\s+/g, " ")];
    if (!key) continue;
    const value = match[2].trim();
    if (fields[key] && fields[key] !== value) conflicts.add(key);
    else fields[key] = value;
  }
  for (const key of conflicts) fields[key] = null;
  if (fields.iban) {
    try { fields.iban = normalizeIban(fields.iban); }
    catch { fields.iban = null; }
  }
  const uncertain = new Set<string>(conflicts);
  for (const key of requiredFields) if (!fields[key]) uncertain.add(key);
  return { fields, uncertain_fields: [...uncertain].sort(), method: "local_pdf_text", status: "needs_review", error_code: null };
}
