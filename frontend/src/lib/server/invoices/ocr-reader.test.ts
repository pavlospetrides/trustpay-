import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { rgb } from "pdf-lib";
import { PDFParse } from "pdf-parse";
import sharp from "sharp";
import { join } from "node:path";
import { boundedPageText, languageAssetSources, limitedOcr, readInvoiceEvidence } from "./ocr-reader";
import engLanguage from "@tesseract.js-data/eng";
import ellLanguage from "@tesseract.js-data/ell";

const digital = readFileSync(new URL("./fixtures/synthetic-invoice.pdf", import.meta.url));

describe("offline invoice reading", () => {
  it("loads the language files declared by their packages for traced deployment", () => {
    expect(languageAssetSources()).toEqual({ eng: join(engLanguage.langPath, "eng.traineddata.gz"), ell: join(ellLanguage.langPath, "ell.traineddata.gz") });
  });
  it("caps simultaneous OCR work to protect server memory", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let active = 0;
    let maximum = 0;
    const jobs = Array.from({ length: 4 }, () => limitedOcr(async () => { active++; maximum = Math.max(maximum, active); await gate; active--; }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(maximum).toBe(2);
    release();
    await Promise.all(jobs);
  });
  it("reads usable PDF.js text with page and layout evidence", async () => {
    const result = await readInvoiceEvidence(digital, "application/pdf");
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].method).toBe("native_pdf_text");
    expect(result.pages[0].text).toContain("AS-2026-114");
    expect(result.pages[0].words.some((word) => word.text.includes("AS-2026-114") && word.box.width > 0)).toBe(true);
  });

  it("runs actual offline OCR on a scanned PDF page", async () => {
    const parser = new PDFParse({ data: new Uint8Array(digital) });
    const screenshot = (await parser.getScreenshot({ partial: [1], scale: 3, imageDataUrl: false })).pages[0].data;
    await parser.destroy();
    const scan = await PDFDocument.create();
    const image = await scan.embedPng(screenshot);
    const page = scan.addPage([image.width, image.height]);
    page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
    const result = await readInvoiceEvidence(Buffer.from(await scan.save()), "application/pdf");
    expect(result.pages[0].method).toBe("ocr");
    expect(result.pages[0].text).toContain("AS-2026-114");
    expect(result.pages[0].words.length).toBeGreaterThan(10);
    expect(result.pages[0].words.every((word) => word.box.width > 0 && word.confidence !== null)).toBe(true);
  }, 120_000);

  it("can force OCR on a digital page for character-error measurement", async () => {
    const result = await readInvoiceEvidence(digital, "application/pdf", { forceOcr: true });
    expect(result.pages[0].method).toBe("ocr");
    expect(result.pages[0].text).toContain("AS-2026-114");
  }, 120_000);

  it("reads a newly generated, mildly blurred and rotated invoice photo", async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600"><rect width="1200" height="1600" fill="white"/><g fill="black" font-family="Arial" font-size="42"><text x="100" y="140">IONIC LABS LTD</text><text x="100" y="250">INVOICE INV-NEW-934</text><text x="100" y="340">Date: 2026-11-26</text><text x="100" y="430">Service quantity 2 at EUR 120.00</text><text x="100" y="530">VAT 19%: EUR 45.60</text><text x="100" y="630">Total: EUR 285.60</text><text x="100" y="730">IBAN: GB82 WEST 1234 5698 7654 32</text></g></svg>`;
    const photo = await sharp(Buffer.from(svg)).rotate(2, { background: "#f5f4ee" }).blur(0.7).jpeg({ quality: 75 }).toBuffer();
    const result = await readInvoiceEvidence(photo, "image/jpeg");
    expect(result.pages[0].method).toBe("ocr");
    expect(result.pages[0].text).toContain("INV-NEW-934");
    expect(result.pages[0].text).toContain("285.60");
    expect(Math.abs(result.pages[0].rotation_radians ?? 0)).toBeGreaterThan(0.005);
  }, 120_000);

  it("recognizes Greek and English on the same newly generated image", async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1000"><rect width="1200" height="1000" fill="white"/><g fill="black" font-family="Arial" font-size="50"><text x="80" y="130">ΤΙΜΟΛΟΓΙΟ INVOICE</text><text x="80" y="250">ΕΤΑΙΡΕΙΑ ΚΥΠΡΟΣ LTD</text><text x="80" y="370">Αριθμός: EL-2026-915</text><text x="80" y="490">Σύνολο: EUR 285.60</text></g></svg>`;
    const image = await sharp(Buffer.from(svg)).png().toBuffer();
    const result = await readInvoiceEvidence(image, "image/png");
    expect(result.pages[0].text).toMatch(/ΤΙΜΟΛΟΓΙΟ/);
    expect(result.pages[0].text).toContain("INVOICE");
  }, 120_000);

  it("corrects a sideways invoice photograph", async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="white"/><g fill="black" font-family="Arial" font-size="48"><text x="70" y="120">SIDEWAYS INVOICE</text><text x="70" y="240">Invoice Number: ROT-2026-718</text><text x="70" y="360">Supplier: HARBOR TEST LTD</text><text x="70" y="480">Total EUR 285.60</text></g></svg>`;
    const sideways = await sharp(Buffer.from(svg)).rotate(90).png().toBuffer();
    const result = await readInvoiceEvidence(sideways, "image/png");
    expect(result.pages[0].text).toContain("ROT-2026-718");
  }, 120_000);

  it("flags a conflict between a weak native text layer and the scanned page", async () => {
    const parser = new PDFParse({ data: new Uint8Array(digital) });
    const image = (await parser.getScreenshot({ partial: [1], scale: 2, imageDataUrl: false })).pages[0].data;
    await parser.destroy();
    const pdf = await PDFDocument.create();
    const embedded = await pdf.embedPng(image);
    const page = pdf.addPage([600, 800]);
    page.drawImage(embedded, { x: 0, y: 0, width: 600, height: 800 });
    page.drawText("WRONG HIDDEN INVOICE NUMBER", { x: 10, y: 10, color: rgb(1, 1, 1) });
    const result = await readInvoiceEvidence(Buffer.from(await pdf.save()), "application/pdf");
    expect(result.pages[0].method).toBe("ocr");
    expect(result.pages[0].warnings).toContain("NATIVE_OCR_CONFLICT");
  }, 120_000);
  it("flags a substantial stale hidden PDF text layer before trusting its account", async () => {
    const parser = new PDFParse({ data: new Uint8Array(digital) });
    const image = (await parser.getScreenshot({ partial: [1], scale: 2, imageDataUrl: false })).pages[0].data;
    await parser.destroy();
    const pdf = await PDFDocument.create();
    const embedded = await pdf.embedPng(image);
    const page = pdf.addPage([600, 800]);
    page.drawImage(embedded, { x: 0, y: 0, width: 600, height: 800 });
    page.drawText("Invoice Number BAD-888 Supplier Hidden Test IBAN GB82WEST12345698765432 Total 9999.99", { x: 10, y: 10, size: 10, color: rgb(1, 1, 1) });
    const result = await readInvoiceEvidence(Buffer.from(await pdf.save()), "application/pdf");
    expect(result.quality).toBe("review");
    expect(result.pages[0].warnings).toContain("NATIVE_OCR_CONFLICT");
  }, 120_000);
  it("flags stale hidden PDF text when only the printed amount changes", async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="white"/><g fill="black" font-family="Arial" font-size="45"><text x="70" y="120">IONIC LABS LTD</text><text x="70" y="230">Invoice INV-915</text><text x="70" y="340">Total EUR 285.60</text><text x="70" y="450">Service consulting</text></g></svg>`;
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    const pdf = await PDFDocument.create();
    const image = await pdf.embedPng(png);
    const page = pdf.addPage([600, 400]);
    page.drawImage(image, { x: 0, y: 0, width: 600, height: 400 });
    page.drawText("IONIC LABS LTD Invoice INV-915 Total EUR 9999.99 Service consulting", { x: 10, y: 10, size: 10, color: rgb(1, 1, 1) });
    const result = await readInvoiceEvidence(Buffer.from(await pdf.save()), "application/pdf");
    expect(result.quality).toBe("review");
    expect(result.pages[0].method).toBe("ocr");
    expect(result.pages[0].warnings).toContain("NATIVE_OCR_CONFLICT");
  }, 120_000);
  it("marks an unreadable image for review after bounded retries", async () => {
    const blank = await sharp({ create: { width: 800, height: 1000, channels: 3, background: "white" } }).png().toBuffer();
    const result = await readInvoiceEvidence(blank, "image/png");
    expect(result.quality).toBe("review");
    expect(result.pages[0].warnings).toContain("OCR_LOW_CONFIDENCE");
  }, 120_000);
  it("signals when page text exceeds the bounded evidence limit", () => {
    const result = boundedPageText("A".repeat(100_001));
    expect(result.text).toHaveLength(100_000);
    expect(result.warnings).toContain("PAGE_TEXT_LIMIT");
  });
});
