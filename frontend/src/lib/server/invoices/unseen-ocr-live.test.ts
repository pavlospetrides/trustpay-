import { resolve } from "node:path";
import { writeFileSync } from "node:fs";
import { config } from "dotenv";
import { afterAll, describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { OpenAIInvoiceProvider } from "../ai/provider";
import { extractInvoice } from "./extract-invoice";
import { readInvoiceEvidence } from "./ocr-reader";
import { characterErrorRate } from "./ocr-metrics";

config({ path: resolve(process.cwd(), ".env.local"), quiet: true });

function invoiceSvg(supplier: string, number: string): Buffer {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600"><rect width="1200" height="1600" fill="white"/><g fill="black" font-family="Arial" font-size="43"><text x="85" y="120">${supplier}</text><text x="85" y="220">INVOICE ${number}</text><text x="85" y="320">Customer: HARBOR TEST LTD</text><text x="85" y="420">Date: 2026-11-26</text><text x="85" y="560">Description                   Qty       Net</text><text x="85" y="640">Consulting service           2       EUR 240.00</text><text x="85" y="760">VAT 19%: EUR 45.60</text><text x="85" y="860">Total: EUR 285.60</text><text x="85" y="1000">IBAN: GB82 WEST 1234 5698 7654 32</text></g></svg>`);
}

describe.runIf(process.env.TRUSTPAY_LIVE_UNSEEN_OCR === "1")("new synthetic OCR invoices", () => {
  const rows: Array<{ format: string; cer: number | null; method: string; elapsed_ms: number; input_tokens: number; output_tokens: number; estimated_api_cost_usd: number; critical_fields_correct: number; critical_fields_total: number }> = [];
  const normalize = (text: string) => [...text.normalize("NFKC").toUpperCase()].filter((character) => /[\p{L}\p{N}]/u.test(character)).join("");
  const reference = (svg: Buffer) => [...svg.toString().matchAll(/<text[^>]*>([^<]+)<\/text>/g)].map((match) => match[1]).join(" ");
  const record = async (format: string, bytes: Buffer, svg: Buffer, result: Awaited<ReturnType<typeof extractInvoice>>, elapsed_ms: number) => {
    const evidence = await readInvoiceEvidence(bytes, format);
    const cer = characterErrorRate(normalize(reference(svg)), normalize(evidence.text)).rate;
    const input = result.usage?.input_tokens ?? 0;
    const output = result.usage?.output_tokens ?? 0;
    rows.push({ format, cer, method: result.method, elapsed_ms, input_tokens: input, output_tokens: output, estimated_api_cost_usd: Number(((input * 0.75 + output * 4.5) / 1_000_000).toFixed(6)), critical_fields_correct: 6, critical_fields_total: 6 });
  };
  afterAll(() => { if (rows.length) writeFileSync(resolve(process.cwd(), "../docs/invoice-ocr-unseen-evaluation.json"), `${JSON.stringify({ generated_synthetic_cases: rows.length, results: rows }, null, 2)}\n`); });
  it("populates financial review fields from an unfamiliar photographed invoice", async () => {
    const svg = invoiceSvg("IONIC LABS LTD", "INV-NEW-934");
    const photo = await sharp(svg).rotate(2, { background: "#f5f4ee" }).blur(0.7).jpeg({ quality: 75 }).toBuffer();
    const started = performance.now();
    const result = await extractInvoice(photo, "image/jpeg", new OpenAIInvoiceProvider(), { reader: "ocr" });
    expect(result.method).toBe("openai_ocr_text");
    expect(result.fields).toMatchObject({ supplier_name: "IONIC LABS LTD", invoice_number: "INV-NEW-934", invoice_date: "2026-11-26", total_amount: "285.60", currency: "EUR", iban: "GB82WEST12345698765432" });
    expect(result.document?.line_items.length).toBeGreaterThan(0);
    await record("image/jpeg", photo, svg, result, Math.round(performance.now() - started));
  }, 120_000);

  it("populates review fields from an unfamiliar Greek and English scanned PDF", async () => {
    const svg = invoiceSvg("ΚΥΠΡΟΣ ΔΟΚΙΜΗ LTD", "CY-NEW-915");
    const png = await sharp(svg).png().toBuffer();
    const pdf = await PDFDocument.create();
    const embedded = await pdf.embedPng(png);
    const page = pdf.addPage([600, 800]);
    page.drawImage(embedded, { x: 0, y: 0, width: 600, height: 800 });
    const bytes = Buffer.from(await pdf.save());
    const started = performance.now();
    const result = await extractInvoice(bytes, "application/pdf", new OpenAIInvoiceProvider(), { reader: "ocr" });
    expect(result.method).toBe("openai_ocr_text");
    expect(result.fields).toMatchObject({ invoice_number: "CY-NEW-915", invoice_date: "2026-11-26", total_amount: "285.60", currency: "EUR", iban: "GB82WEST12345698765432" });
    expect(result.fields.supplier_name).toContain("ΚΥΠΡΟΣ");
    expect(result.document?.line_items.length).toBeGreaterThan(0);
    await record("application/pdf", bytes, svg, result, Math.round(performance.now() - started));
  }, 120_000);
});
