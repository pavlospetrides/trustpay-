import type { InvoiceDraftFields } from "../../intake";
import { ProviderUnavailable } from "../ai/provider";
import { normalizeIban } from "../security/account";
import { readDocument } from "./document";
import { parseLabeledText, requiredFields, type ExtractionResult } from "./extraction";

export interface InvoiceProvider { extract(data: Buffer, contentType: string): Promise<InvoiceDraftFields> }
const blankFields = (): InvoiceDraftFields => ({ supplier_name: null, registration_number: null, vat_number: null, invoice_number: null, invoice_date: null, due_date: null, total_amount: null, currency: null, iban: null, payment_reference: null });

export async function extractInvoice(data: Buffer, contentType: string, provider: InvoiceProvider | null): Promise<ExtractionResult> {
  const document = await readDocument(data, contentType);
  if (provider) {
    try {
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
