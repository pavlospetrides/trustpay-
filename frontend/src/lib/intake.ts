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
  method: "local_pdf_text" | "openai_vision" | null;
  error_code: string | null;
  extraction_attempts: number;
  explanation: string | null;
  explanation_method: "verified_policy" | "openai_summary" | null;
  invoice_id: string | null;
  content_type: string;
  size_bytes: number;
  created_at: string;
};

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
  if (!accepted[file.type]?.includes(extension)) return "Choose a PDF, PNG, JPEG, or WEBP invoice.";
  if (file.size < 1) return "The invoice file is empty.";
  if (file.size > 10 * 1024 * 1024) return "Invoice files must be 10 MB or smaller.";
  return null;
}

const required = ["supplier_name", "invoice_number", "invoice_date", "total_amount", "currency"] as const;
export function missingReviewFields(fields: Partial<InvoiceDraftFields>): string[] {
  return required.filter((name) => !fields[name]?.trim());
}
