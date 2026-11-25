import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import sharp from "sharp";
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
});
