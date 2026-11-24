import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { extractInvoice } from "./extract-invoice";
import { ProviderUnavailable } from "../ai/provider";

const pdf = readFileSync(new URL("./fixtures/synthetic-invoice.pdf", import.meta.url));

describe("invoice extraction fallback", () => {
  it("extracts the synthetic text PDF locally without OpenAI", async () => {
    const result = await extractInvoice(pdf, "application/pdf", null);
    expect(result).toMatchObject({ status: "needs_review", method: "local_pdf_text", fields: { invoice_number: "AS-2026-114", iban: "GB43TRST00000000000099" } });
  });
  it("records provider outage and falls back to labeled PDF text", async () => {
    const result = await extractInvoice(pdf, "application/pdf", { extract: async () => { throw new ProviderUnavailable("offline"); } });
    expect(result).toMatchObject({ status: "needs_review", method: "local_pdf_text", error_code: "VISION_PROVIDER_UNAVAILABLE" });
  });
});
