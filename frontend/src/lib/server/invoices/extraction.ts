import { z } from "zod";
import type { InvoiceDraftFields } from "../../intake";
import { normalizeIban } from "../security/account";
import type { UniversalDocument, ValidationFinding } from "./universal";

const nullableText = z.string().nullable();
export const proposedFieldsSchema = z.strictObject({
  supplier_name: nullableText, registration_number: nullableText, vat_number: nullableText,
  invoice_number: nullableText, invoice_date: nullableText, due_date: nullableText,
  total_amount: nullableText, currency: nullableText, iban: nullableText, payment_reference: nullableText,
});
const isoDate = z.string().refine((value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value, "Use an ISO invoice date");
const requiredText = z.string().trim().min(2).max(128);
const amount = z.string().trim().regex(/^\d{1,10}(?:\.\d{1,2})?$/).refine((value) => { const [whole, fraction = ""] = value.split("."); const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0")); return cents > 0n && cents <= 100_000_000_000n; }, "Amount is outside accepted range").transform((value) => { const [whole, fraction = ""] = value.split("."); return `${whole}.${fraction.padEnd(2, "0")}`; });
export const reviewedInvoiceSchema = z.strictObject({
  supplier_name: requiredText, registration_number: nullableText, vat_number: nullableText,
  invoice_number: requiredText, invoice_date: isoDate, due_date: isoDate.nullable(),
  total_amount: amount, currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  iban: z.string().nullable().transform((value, context) => { if (value === null) return null; try { return normalizeIban(value); } catch { context.addIssue({ code: "custom", message: "A valid IBAN is required" }); return z.NEVER; } }),
  payment_reference: nullableText,
}).refine((value) => !value.due_date || value.due_date >= value.invoice_date, "Due date cannot precede invoice date");

export const requiredFields = ["supplier_name", "invoice_number", "invoice_date", "total_amount", "currency", "iban"] as const;
const labelMap: Record<string, keyof InvoiceDraftFields> = {
  supplier: "supplier_name", "supplier name": "supplier_name", "registration number": "registration_number", "supplier registration number": "registration_number",
  "vat number": "vat_number", "vat no": "vat_number", "invoice number": "invoice_number", "invoice no": "invoice_number",
  "invoice date": "invoice_date", "due date": "due_date", "total amount": "total_amount", total: "total_amount",
  currency: "currency", iban: "iban", "payment reference": "payment_reference",
};
const emptyFields = (): InvoiceDraftFields => ({ supplier_name: null, registration_number: null, vat_number: null, invoice_number: null, invoice_date: null, due_date: null, total_amount: null, currency: null, iban: null, payment_reference: null });
export interface ExtractionResult { fields: InvoiceDraftFields; uncertain_fields: string[]; method: "local_pdf_text" | "local_ocr_text" | "openai_ocr_text" | "openai_vision"; status: "needs_review" | "provider_unavailable"; error_code: string | null; document?: UniversalDocument; findings?: ValidationFinding[]; usage?: { input_tokens: number; output_tokens: number }; page_count?: number }

const months: Record<string, string> = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };
function englishDate(value: string): string | null {
  const match = /^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/.exec(value.trim());
  const month = match && months[match[2].slice(0, 3).toLowerCase()];
  if (!match || !month) return null;
  const date = `${match[3]}-${month}-${match[1].padStart(2, "0")}`;
  return isoDate.safeParse(date).success ? date : null;
}

export function parseLabeledText(text: string): ExtractionResult {
  const fields = emptyFields();
  const conflicts = new Set<keyof InvoiceDraftFields>();
  const uncertain = new Set<string>();
  const lines = text.split(/\r?\n/).slice(0, 400);
  function propose(key: keyof InvoiceDraftFields, value: string, needsCheck = false) {
    if (fields[key] && fields[key] !== value) conflicts.add(key);
    else fields[key] = value;
    if (needsCheck) uncertain.add(key);
  }
  for (const line of lines) {
    const match = /^\s*([A-Za-z ]{2,40}):\s*(.{1,160})\s*$/.exec(line);
    if (!match) continue;
    const key = labelMap[match[1].trim().toLowerCase().replace(/\s+/g, " ")];
    if (!key) continue;
    propose(key, match[2].trim());
  }
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].trim();
    const next = lines[index + 1]?.trim() ?? "";
    if (line.toUpperCase() === "INVOICE" && /^[A-Z0-9]+(?:[-/][A-Z0-9]+)+$/i.test(next)) propose("invoice_number", next, true);
    if (/^(?:ISSUE|INVOICE) DATE$/i.test(line)) {
      const date = englishDate(next);
      if (date) propose("invoice_date", date, true);
    }
    if (/^DUE DATE$/i.test(line)) {
      const date = englishDate(next);
      if (date) propose("due_date", date, true);
    }
    const total = /^TOTAL(?:\s+DUE|\s+AMOUNT)?\s+(EUR)\s+(\d+(?:,\d{3})*(?:\.\d{2})?)$/i.exec(line);
    if (total) {
      propose("currency", total[1].toUpperCase(), true);
      propose("total_amount", total[2].replaceAll(",", ""), true);
    }
    const iban = /^IBAN\s+([A-Z]{2}\d{2}[A-Z0-9 ]{11,40})$/i.exec(line);
    if (iban) {
      try { propose("iban", normalizeIban(iban[1]), true); } catch { uncertain.add("iban"); }
    }
    const reference = /^PAYMENT REFERENCE\s+([A-Z0-9/-]{3,70})$/i.exec(line);
    if (reference) propose("payment_reference", reference[1], true);
  }
  for (const key of conflicts) fields[key] = null;
  if (fields.iban) {
    try { fields.iban = normalizeIban(fields.iban); }
    catch { fields.iban = null; }
  }
  for (const key of conflicts) uncertain.add(key);
  for (const key of requiredFields) if (!fields[key]) uncertain.add(key);
  const recognizedCritical = requiredFields.filter((key) => key !== "iban" && fields[key]).length;
  return { fields, uncertain_fields: [...uncertain].sort(), method: "local_pdf_text", status: "needs_review", error_code: recognizedCritical === 0 ? "LOCAL_EXTRACTION_FAILED" : recognizedCritical < 5 ? "LOCAL_EXTRACTION_PARTIAL" : null };
}
