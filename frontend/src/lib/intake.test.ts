import { describe, expect, it } from "vitest";
import { extractionPresentation, missingReviewFields, validateInvoiceFile } from "./intake";

describe("invoice intake validation", () => {
  it("accepts a synthetic PDF within the 10 MB cap", () => {
    expect(validateInvoiceFile({ name: "synthetic.pdf", type: "application/pdf", size: 4096 })).toBeNull();
    expect(validateInvoiceFile({ name: "synthetic.webp", type: "image/webp", size: 4096 })).toBeNull();
  });

  it("rejects an oversized or mismatched image before upload", () => {
    expect(validateInvoiceFile({ name: "invoice.png", type: "image/png", size: 10 * 1024 * 1024 + 1 })).toMatch(/10 MB/);
    expect(validateInvoiceFile({ name: "invoice.exe", type: "application/pdf", size: 100 })).toMatch(/PDF, PNG, JPEG, or WEBP/);
  });

  it("keeps missing IBAN and amount in review", () => {
    expect(missingReviewFields({ supplier_name: "Synthetic Ltd", invoice_number: "A-1", invoice_date: "2026-11-23", total_amount: "", currency: "EUR", iban: "" })).toEqual(["total_amount"]);
  });
  it("identifies a partial local fallback and explains what failed", () => {
    expect(extractionPresentation({ method: "local_pdf_text", error_code: "LOCAL_EXTRACTION_PARTIAL", status: "needs_review" })).toEqual({ method: "Local PDF Fallback", outcome: "Manual Review Required", warning: "Local text extraction missed critical fields. Check the original document and complete the missing fields." });
  });
  it("distinguishes a provider outage from successful multimodal extraction", () => {
    expect(extractionPresentation({ method: "local_pdf_text", error_code: "VISION_PROVIDER_UNAVAILABLE", status: "needs_review" }).warning).toMatch(/OpenAI.*unavailable/);
    expect(extractionPresentation({ method: "openai_vision", error_code: null, status: "needs_review" }).method).toBe("OpenAI Multimodal");
  });
  it("reports a complete provider failure without claiming local extraction occurred", () => {
    expect(extractionPresentation({ method: "openai_vision", error_code: "VISION_PROVIDER_UNAVAILABLE", status: "provider_unavailable" })).toEqual({ method: "OpenAI Multimodal", outcome: "Extraction Failed", warning: "No reliable invoice fields were extracted. Enter the fields manually or retry when OpenAI extraction is available." });
  });
});
