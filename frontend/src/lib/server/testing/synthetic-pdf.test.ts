import { describe, expect, it } from "vitest";
import { extractInvoice } from "../invoices/extract-invoice";
import { syntheticIban } from "../jinius/demo";
import { syntheticPdf } from "./synthetic-pdf";

describe("synthetic PDF helper", () => {
  it("produces a PDF the local reader extracts labelled fields from", async () => {
    const result = await extractInvoice(syntheticPdf(`Supplier: Synthetic (test) supplier\nInvoice Number: NEW-456\nIBAN: ${syntheticIban(99)}`), "application/pdf", null);
    expect([result.method, result.fields.supplier_name, result.fields.invoice_number, result.fields.iban]).toEqual(["local_pdf_text", "Synthetic (test) supplier", "NEW-456", syntheticIban(99)]);
  });
});
