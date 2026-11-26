import { sourceText } from "./i18n/core";

export type InvoiceDraftFields = {
  supplier_name: string | null;
  registration_number: string | null;
  vat_number: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  total_amount: string | null;
  currency: string | null;
  iban: string | null;
  payment_reference: string | null;
};

export type InvoiceIntake = {
  id: string;
  status: "needs_review" | "provider_unavailable" | "reviewed" | "analyzed";
  fields: InvoiceDraftFields;
  original_fields?: InvoiceDraftFields;
  document?: import("./server/invoices/universal").UniversalDocument | null;
  reviewed_document?: import("./server/invoices/universal").UniversalDocument | null;
  classification_override_reason?: string | null;
  single_invoice_confirmed?: boolean;
  findings?: import("./server/invoices/universal").ValidationFinding[];
  usage?: { input_tokens: number; output_tokens: number } | null;
  estimated_cost_usd?: number | null;
  page_count?: number;
  supplier_id: string | null;
  create_new_supplier: boolean;
  uncertain_fields: string[];
  method: "local_pdf_text" | "local_ocr_text" | "openai_ocr_text" | "openai_vision" | null;
  error_code: string | null;
  extraction_attempts: number;
  retry_available?: boolean;
  explanation: string | null;
  explanation_method: "verified_policy" | "openai_summary" | null;
  invoice_id: string | null;
  content_type: string;
  size_bytes: number;
  created_at: string;
};

export function extractionPresentation(intake: Pick<InvoiceIntake, "method" | "error_code" | "status">): { method: string; outcome: string; warning: string | null } {
  const method = intake.method === "openai_vision" ? sourceText("intake.method-vision") : intake.method === "openai_ocr_text" ? sourceText("intake.method-ocr-openai") : intake.method === "local_ocr_text" ? sourceText("intake.method-ocr-local") : intake.method === "local_pdf_text" ? sourceText("intake.method-pdf-local") : sourceText("intake.outcome-failed");
  if (intake.status === "provider_unavailable") return { method, outcome: sourceText("intake.outcome-failed"), warning: sourceText("intake.warning-no-fields") };
  if (intake.error_code === "OCR_LOW_CONFIDENCE") return { method, outcome: sourceText("intake.outcome-manual"), warning: sourceText("intake.warning-ocr-confidence") };
  if (intake.error_code === "OCR_ANALYSIS_NOT_CONFIGURED") return { method, outcome: sourceText("intake.outcome-manual"), warning: sourceText("intake.warning-ocr-local") };
  if (intake.error_code === "TEXT_ANALYSIS_PROVIDER_UNAVAILABLE") return { method, outcome: sourceText("intake.outcome-manual"), warning: sourceText("intake.warning-ocr-provider") };
  if (intake.error_code === "VISION_PROVIDER_UNAVAILABLE") return { method, outcome: sourceText("intake.outcome-manual"), warning: sourceText("intake.warning-pdf-provider") };
  if (intake.error_code === "LOCAL_EXTRACTION_PARTIAL") return { method, outcome: sourceText("intake.outcome-manual"), warning: sourceText("intake.warning-partial") };
  if (intake.error_code === "LOCAL_EXTRACTION_FAILED") return { method, outcome: sourceText("intake.outcome-failed"), warning: sourceText("intake.warning-no-fields") };
  return { method, outcome: intake.status === "needs_review" ? sourceText("intake.outcome-manual") : sourceText("intake.outcome-reviewed"), warning: null };
}

export type AssessmentHistory = {
  id: string;
  score: number;
  severity: string;
  kind: string;
  recommended_status: string;
  engine_version: string;
  explanation: string;
  evidence: { historical_payment_count?: number; policy_score_not_probability?: boolean };
  assessed_at: string;
  signals: { code: string; severity: string; weight: number; explanation: string; evidence: object }[];
};

const accepted: Record<string, string[]> = {
  "application/pdf": ["pdf"],
  "image/png": ["png"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/webp": ["webp"],
};

export function validateInvoiceFile(file: Pick<File, "name" | "type" | "size">): string | null {
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  if (!accepted[file.type]?.includes(extension)) return sourceText("intake.choose-supported-invoice");
  if (file.size < 1) return sourceText("the-invoice-file-is-empty");
  if (file.size > 10 * 1024 * 1024) return sourceText("invoice-files-must-be-10-mb-or-smaller");
  return null;
}

const required = ["supplier_name", "invoice_number", "invoice_date", "total_amount", "currency"] as const;
export function missingReviewFields(fields: Partial<InvoiceDraftFields>): string[] {
  return required.filter((name) => !fields[name]?.trim());
}
