import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { readDocument } from "./document";

const pdf = readFileSync(new URL("./fixtures/synthetic-invoice.pdf", import.meta.url));

describe("private invoice input validation", () => {
  it("reads the original synthetic PDF without an AI provider", async () => {
    const result = await readDocument(pdf, "application/pdf");
    expect(result.extension).toBe(".pdf");
    expect(result.text).toContain("Invoice Number: AS-2026-114");
  });
  it("rejects mismatched signatures, corrupt PDFs, and oversized files", async () => {
    await expect(readDocument(Buffer.from("<script>bad</script>"), "application/pdf")).rejects.toThrow();
    await expect(readDocument(Buffer.from("%PDF-\ncorrupt"), "application/pdf")).rejects.toThrow();
    await expect(readDocument(Buffer.concat([pdf, Buffer.alloc(10 * 1024 * 1024)]), "application/pdf")).rejects.toThrow();
  });
  it("decodes a synthetic PNG and refuses a corrupt image", async () => {
    const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: "white" } }).png().toBuffer();
    expect((await readDocument(png, "image/png")).extension).toBe(".png");
    await expect(readDocument(Buffer.from("\x89PNG\r\n\x1a\ninvalid"), "image/png")).rejects.toThrow();
  });
  it("accepts a real WEBP image and rejects a RIFF file without a WEBP signature", async () => {
    const webp = await sharp({ create: { width: 8, height: 8, channels: 3, background: "white" } }).webp().toBuffer();
    expect((await readDocument(webp, "image/webp")).extension).toBe(".webp");
    await expect(readDocument(Buffer.from("RIFF0000WAVE"), "image/webp")).rejects.toThrow();
  });
  it("reports the explicit ten-page limit", async () => {
    const document = await PDFDocument.create();
    for (let page = 0; page < 11; page++) document.addPage();
    await expect(readDocument(Buffer.from(await document.save()), "application/pdf")).rejects.toThrow("1–10 unencrypted pages");
  });
});
