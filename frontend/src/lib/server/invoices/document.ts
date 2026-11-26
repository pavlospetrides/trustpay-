import { PDFParse } from "pdf-parse";
import sharp from "sharp";

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const signatures: Record<string, { bytes: Buffer; extension: string }> = {
  "application/pdf": { bytes: Buffer.from("%PDF-"), extension: ".pdf" },
  "image/png": { bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), extension: ".png" },
  "image/jpeg": { bytes: Buffer.from([0xff, 0xd8, 0xff]), extension: ".jpg" },
  "image/webp": { bytes: Buffer.from("RIFF"), extension: ".webp" },
};

export async function readDocument(data: Buffer, contentType: string): Promise<{ extension: string; text: string; page_count: number; embedded_text_usable: boolean }> {
  const expected = signatures[contentType];
  if (!expected || !data.subarray(0, expected.bytes.length).equals(expected.bytes) || contentType === "image/webp" && data.toString("ascii", 8, 12) !== "WEBP") throw new Error("Only PDF, PNG, JPEG, or WEBP invoices with matching file content are accepted");
  if (data.length > MAX_DOCUMENT_BYTES) throw new Error("Invoice document exceeds the 10 MB limit");
  if (contentType !== "application/pdf") {
    try {
      const image = sharp(data, { limitInputPixels: 20_000_000, failOn: "error" });
      const metadata = await image.metadata();
      const expectedFormat = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpeg";
      if (metadata.format !== expectedFormat || !metadata.width || !metadata.height || metadata.width * metadata.height > 20_000_000) throw new Error("Invoice image format or dimensions are invalid");
      await image.raw().toBuffer();
    } catch { throw new Error("Invoice image could not be read"); }
    return { extension: expected.extension, text: "", page_count: 1, embedded_text_usable: false };
  }
  const parser = new PDFParse({ data: new Uint8Array(data) });
  try {
    const info = await parser.getInfo();
    if (info.total < 1 || info.total > 10) throw new Error("PDF must have 1–10 unencrypted pages");
    const result = await parser.getText();
    const text = result.text.slice(0, 100_000);
    return { extension: expected.extension, text, page_count: info.total, embedded_text_usable: text.replace(/\s/g, "").length >= info.total * 40 };
  } catch (error) {
    if (error instanceof Error && error.message.includes("1–10 unencrypted pages")) throw error;
    if (error instanceof Error && /password|encrypted/i.test(error.message)) throw new Error("Password-protected PDFs are not supported");
    throw new Error("PDF could not be read");
  }
  finally { await parser.destroy(); }
}
