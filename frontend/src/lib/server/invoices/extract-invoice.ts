import type { InvoiceDraftFields } from "../../intake";
import { ProviderUnavailable } from "../ai/provider";
import { normalizeIban } from "../security/account";
import { readDocument } from "./document";
import { parseLabeledText, requiredFields, type ExtractionResult } from "./extraction";
import { minorUnits, projectPayableFields, validateUniversalDocument, type UniversalDocument } from "./universal";
import { readInvoiceEvidence, type InvoiceEvidence } from "./ocr-reader";
import { accountAppearsInEvidence, validIbansInText } from "./bank-evidence";
export { accountAppearsInEvidence } from "./bank-evidence";

export interface InvoiceProvider { extract(data: Buffer, contentType: string): Promise<InvoiceDraftFields>; extractDocument?(data: Buffer, contentType: string, embeddedText: string): Promise<{ document: UniversalDocument; usage: { input_tokens: number; output_tokens: number } }>; extractTextDocument?(evidence: InvoiceEvidence): Promise<{ document: UniversalDocument; usage: { input_tokens: number; output_tokens: number } }> }
const blankFields = (): InvoiceDraftFields => ({ supplier_name: null, registration_number: null, vat_number: null, invoice_number: null, invoice_date: null, due_date: null, total_amount: null, currency: null, iban: null, payment_reference: null });

export async function extractInvoice(data: Buffer, contentType: string, provider: InvoiceProvider | null, options: { reader?: "ocr" | "vision" } = {}): Promise<ExtractionResult> {
  const document = await readDocument(data, contentType);
  const useOcr = (options.reader ?? process.env.TRUSTPAY_INVOICE_READER) === "ocr";
  const evidence = useOcr ? await readInvoiceEvidence(data, contentType).catch(() => null) : null;
  if (provider) {
    try {
      if (provider.extractDocument || evidence && provider.extractTextDocument) {
        let textMode = Boolean(evidence && provider.extractTextDocument && (evidence.quality === "sufficient" || !provider.extractDocument));
        let detailed: { document: UniversalDocument; usage: { input_tokens: number; output_tokens: number } };
        if (textMode) {
          try {
            detailed = await provider.extractTextDocument!(evidence!);
            if (evidence!.pages.length > 1 && detailed.document.line_items.length < 2) {
              const retry = await provider.extractTextDocument!(evidence!);
              const usage = { input_tokens: detailed.usage.input_tokens + retry.usage.input_tokens, output_tokens: detailed.usage.output_tokens + retry.usage.output_tokens };
              detailed = { document: retry.document.line_items.length > detailed.document.line_items.length ? retry.document : detailed.document, usage };
            }
          }
          catch (error) {
            if (!(error instanceof ProviderUnavailable) || !provider.extractDocument) throw error;
            textMode = false;
            detailed = await provider.extractDocument(data, contentType, document.text);
          }
        } else detailed = await provider.extractDocument!(data, contentType, document.text);
        const fields = projectPayableFields(detailed.document);
        const cents = minorUnits(fields.total_amount);
        if (cents !== null && cents > 0n) fields.total_amount = `${cents / 100n}.${(cents % 100n).toString().padStart(2, "0")}`;
        if (fields.iban) { try { fields.iban = normalizeIban(fields.iban); } catch { fields.iban = null; } }
        const findings = validateUniversalDocument(detailed.document);
        const uncertain = new Set<string>(requiredFields.filter((key) => !fields[key]));
        if (textMode && evidence && evidence.pages.length > 1 && detailed.document.line_items.length < 2) findings.push({ code: "POSSIBLE_MISSING_LINE_ITEMS", severity: "warning", field: "line_items", detail: "Few line items were extracted from a multi-page document after a bounded retry. Review every page and table row." });
        for (const [key, field] of Object.entries({ supplier_name: detailed.document.supplier.legal_name, invoice_number: detailed.document.document.invoice_number, invoice_date: detailed.document.document.invoice_date, total_amount: detailed.document.financial.outstanding_balance.value ? detailed.document.financial.outstanding_balance : detailed.document.financial.gross_total, currency: detailed.document.financial.currency })) if (field.uncertain) uncertain.add(key);
        if (detailed.document.accounts.length !== 1 || detailed.document.accounts[0].iban.uncertain) uncertain.add("iban");
        const printedIbans = validIbansInText([document.text, evidence?.text ?? ""].join("\n"));
        const modeledIbans = new Set(detailed.document.accounts.flatMap((account) => {
          try { return account.iban.value ? [normalizeIban(account.iban.value)] : []; } catch { return []; }
        }));
        if ([...printedIbans].some((iban) => !modeledIbans.has(iban))) {
          fields.iban = null;
          uncertain.add("iban");
          findings.push({ code: "ADDITIONAL_IBAN_IN_TEXT", severity: "warning", field: "accounts", detail: "The PDF text contains another valid IBAN. Check every payment destination against the original document." });
        }
        if (textMode && evidence) for (const page of evidence.pages) for (const iban of validIbansInText(page.text)) {
          if (modeledIbans.has(iban)) continue;
          const empty = { value: null, source_value: null, supporting_text: null, page: null, uncertain: false };
          detailed.document.accounts.push({ iban: { value: iban, source_value: iban, supporting_text: "OCR account candidate; verify against original", page: page.number, uncertain: true }, account_number: { ...empty }, bank_name: { ...empty }, bic: { ...empty }, beneficiary_name: { ...empty }, instructions: { ...empty } });
          modeledIbans.add(iban);
          fields.iban = null;
          uncertain.add("iban");
          findings.push({ code: "OCR_ACCOUNT_ADDED_FOR_REVIEW", severity: "warning", field: "accounts", detail: "OCR found an additional checksum-valid account omitted by text analysis. Verify every character in the original." });
        }
        if (textMode && detailed.document.accounts.some((account) => account.iban.value && !accountAppearsInEvidence(evidence!.text, account.iban.value))) {
          fields.iban = null;
          uncertain.add("iban");
          findings.push({ code: "ACCOUNT_NOT_IN_OCR", severity: "warning", field: "accounts", detail: "An account returned by analysis does not match OCR text exactly. Check the original document character by character." });
        }
        if (textMode && evidence?.quality === "review") {
          for (const key of requiredFields) uncertain.add(key);
          findings.push({ code: "OCR_LOW_CONFIDENCE", severity: "warning", field: "document", detail: "OCR quality is insufficient on at least one page. Compare every financial field with the original document." });
        }
        return { fields, uncertain_fields: [...uncertain].sort(), method: textMode ? "openai_ocr_text" : "openai_vision", status: "needs_review", error_code: textMode && evidence?.quality === "review" ? "OCR_LOW_CONFIDENCE" : null, document: detailed.document, findings, usage: detailed.usage, page_count: document.page_count };
      }
      const fields = await provider.extract(data, contentType);
      if (fields.iban) { try { fields.iban = normalizeIban(fields.iban); } catch { fields.iban = null; } }
      return { fields, uncertain_fields: requiredFields.filter((key) => !fields[key]).sort(), method: "openai_vision", status: "needs_review", error_code: null };
    } catch (error) {
      if (!(error instanceof ProviderUnavailable)) throw error;
      if (document.text.trim() || evidence?.text.trim()) return { ...parseLabeledText(evidence?.text || document.text), method: evidence ? "local_ocr_text" : "local_pdf_text", error_code: evidence && provider.extractTextDocument && !provider.extractDocument ? "TEXT_ANALYSIS_PROVIDER_UNAVAILABLE" : "VISION_PROVIDER_UNAVAILABLE" };
      return { fields: blankFields(), uncertain_fields: [...requiredFields], method: "openai_vision", status: "provider_unavailable", error_code: "VISION_PROVIDER_UNAVAILABLE" };
    }
  }
  if (evidence?.text.trim()) return { ...parseLabeledText(evidence.text), method: "local_ocr_text", uncertain_fields: [...requiredFields], error_code: evidence.quality === "review" ? "OCR_LOW_CONFIDENCE" : "OCR_ANALYSIS_NOT_CONFIGURED" };
  if (document.text.trim()) return parseLabeledText(document.text);
  return { fields: blankFields(), uncertain_fields: [...requiredFields], method: "local_pdf_text", status: "provider_unavailable", error_code: useOcr ? "OCR_UNAVAILABLE" : "VISION_PROVIDER_NOT_CONFIGURED" };
}
