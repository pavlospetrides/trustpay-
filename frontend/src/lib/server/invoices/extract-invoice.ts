import type { InvoiceDraftFields } from "../../intake";
import { ProviderUnavailable } from "../ai/provider";
import { normalizeIban } from "../security/account";
import { readDocument } from "./document";
import { parseLabeledText, requiredFields, type ExtractionResult } from "./extraction";
import { minorUnits, projectPayableFields, validateUniversalDocument, type UniversalDocument } from "./universal";

export interface InvoiceProvider { extract(data: Buffer, contentType: string): Promise<InvoiceDraftFields>; extractDocument?(data: Buffer, contentType: string, embeddedText: string): Promise<{ document: UniversalDocument; usage: { input_tokens: number; output_tokens: number } }> }
const blankFields = (): InvoiceDraftFields => ({ supplier_name: null, registration_number: null, vat_number: null, invoice_number: null, invoice_date: null, due_date: null, total_amount: null, currency: null, iban: null, payment_reference: null });

function validIbansInText(text: string): Set<string> {
  const values = new Set<string>();
  for (const line of text.toUpperCase().split(/\r?\n/)) {
    const starts = [...line.matchAll(/\b[A-Z]{2}\d{2}/g)];
    for (const [index, start] of starts.entries()) {
      const followingStart = starts[index + 1]?.index ?? line.length;
      const candidate = line.slice(start.index, followingStart).match(/^[A-Z0-9 \t]{15,60}/)?.[0] ?? "";
      for (let end = candidate.length; end >= 15; end--) {
        const prefix = candidate.slice(0, end).trimEnd();
        if (!/[A-Z0-9]$/.test(prefix)) continue;
        try { values.add(normalizeIban(prefix)); break; } catch { /* Try the next token boundary. */ }
      }
    }
  }
  return values;
}

export async function extractInvoice(data: Buffer, contentType: string, provider: InvoiceProvider | null): Promise<ExtractionResult> {
  const document = await readDocument(data, contentType);
  if (provider) {
    try {
      if (provider.extractDocument) {
        const detailed = await provider.extractDocument(data, contentType, document.text);
        const fields = projectPayableFields(detailed.document);
        const cents = minorUnits(fields.total_amount);
        if (cents !== null && cents > 0n) fields.total_amount = `${cents / 100n}.${(cents % 100n).toString().padStart(2, "0")}`;
        if (fields.iban) { try { fields.iban = normalizeIban(fields.iban); } catch { fields.iban = null; } }
        const findings = validateUniversalDocument(detailed.document);
        const uncertain = new Set<string>(requiredFields.filter((key) => !fields[key]));
        for (const [key, field] of Object.entries({ supplier_name: detailed.document.supplier.legal_name, invoice_number: detailed.document.document.invoice_number, invoice_date: detailed.document.document.invoice_date, total_amount: detailed.document.financial.outstanding_balance.value ? detailed.document.financial.outstanding_balance : detailed.document.financial.gross_total, currency: detailed.document.financial.currency })) if (field.uncertain) uncertain.add(key);
        if (detailed.document.accounts.length !== 1 || detailed.document.accounts[0].iban.uncertain) uncertain.add("iban");
        const printedIbans = validIbansInText(document.text);
        const modeledIbans = new Set(detailed.document.accounts.flatMap((account) => {
          try { return account.iban.value ? [normalizeIban(account.iban.value)] : []; } catch { return []; }
        }));
        if ([...printedIbans].some((iban) => !modeledIbans.has(iban))) {
          fields.iban = null;
          uncertain.add("iban");
          findings.push({ code: "ADDITIONAL_IBAN_IN_TEXT", severity: "warning", field: "accounts", detail: "The PDF text contains another valid IBAN. Check every payment destination against the original document." });
        }
        return { fields, uncertain_fields: [...uncertain].sort(), method: "openai_vision", status: "needs_review", error_code: null, document: detailed.document, findings, usage: detailed.usage, page_count: document.page_count };
      }
      const fields = await provider.extract(data, contentType);
      if (fields.iban) { try { fields.iban = normalizeIban(fields.iban); } catch { fields.iban = null; } }
      return { fields, uncertain_fields: requiredFields.filter((key) => !fields[key]).sort(), method: "openai_vision", status: "needs_review", error_code: null };
    } catch (error) {
      if (!(error instanceof ProviderUnavailable)) throw error;
      if (document.text.trim()) return { ...parseLabeledText(document.text), error_code: "VISION_PROVIDER_UNAVAILABLE" };
      return { fields: blankFields(), uncertain_fields: [...requiredFields], method: "openai_vision", status: "provider_unavailable", error_code: "VISION_PROVIDER_UNAVAILABLE" };
    }
  }
  if (document.text.trim()) return parseLabeledText(document.text);
  return { fields: blankFields(), uncertain_fields: [...requiredFields], method: "local_pdf_text", status: "provider_unavailable", error_code: "VISION_PROVIDER_NOT_CONFIGURED" };
}
