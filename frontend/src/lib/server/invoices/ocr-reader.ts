import { copyFileSync, mkdtempSync, rmdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { PDFParse } from "pdf-parse";
import sharp from "sharp";
import { createWorker } from "tesseract.js";
import engLanguage from "@tesseract.js-data/eng";
import ellLanguage from "@tesseract.js-data/ell";
import { readDocument } from "./document";
import { validIbansInText } from "./bank-evidence";

export type EvidenceWord = { text: string; confidence: number | null; box: { x: number; y: number; width: number; height: number } };
export type EvidencePage = { number: number; method: "native_pdf_text" | "ocr"; text: string; words: EvidenceWord[]; confidence: number; width: number; height: number; rotation_radians?: number | null; orientation_degrees?: number; warnings: string[] };
export type InvoiceEvidence = { pages: EvidencePage[]; text: string; quality: "sufficient" | "review"; warnings: string[] };

const MAX_PIXELS = 20_000_000;
const MAX_OCR_CHARS = 100_000;
export function boundedPageText(text: string): { text: string; warnings: string[] } {
  return text.length > MAX_OCR_CHARS ? { text: text.slice(0, MAX_OCR_CHARS), warnings: ["PAGE_TEXT_LIMIT"] } : { text, warnings: [] };
}
const TWO_LANGUAGES = ["eng", "ell"] as const;
export const languageAssetSources = () => ({ eng: join(engLanguage.langPath, "eng.traineddata.gz"), ell: join(ellLanguage.langPath, "ell.traineddata.gz") });
let activeOcr = 0;
const waitingOcr: Array<() => void> = [];

export async function limitedOcr<T>(work: () => Promise<T>): Promise<T> {
  if (activeOcr < 2) activeOcr++;
  else {
    if (waitingOcr.length >= 8) throw new Error("OCR queue is full");
    await new Promise<void>((resolve) => waitingOcr.push(resolve));
  }
  try { return await work(); }
  finally {
    const next = waitingOcr.shift();
    if (next) next(); else activeOcr--;
  }
}

function localLanguages(): string {
  const directory = mkdtempSync(join(tmpdir(), "trustpay-ocr-"));
  const sources = languageAssetSources();
  for (const code of TWO_LANGUAGES) {
    copyFileSync(sources[code], join(directory, `${code}.traineddata.gz`));
  }
  return directory;
}

function usableNative(text: string): boolean {
  const printable = [...text].filter((character) => /[\p{L}\p{N}]/u.test(character)).length;
  const replacements = [...text].filter((character) => character === "�").length;
  return printable >= 40 && replacements / Math.max(printable, 1) < 0.02;
}

function linesFromWords(words: EvidenceWord[]): string {
  const sorted = [...words].sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
  const lines: EvidenceWord[][] = [];
  for (const word of sorted) {
    const last = lines.at(-1);
    if (!last || Math.abs(word.box.y - last[0].box.y) > Math.max(5, word.box.height * 0.6)) lines.push([word]);
    else last.push(word);
  }
  return lines.map((line) => line.sort((a, b) => a.box.x - b.box.x).map((word) => word.text).join(" ")).join("\n");
}

function nativeOcrConflict(native: string, ocr: string): boolean {
  if (!usableNative(ocr)) return true;
  const nativeAccounts = validIbansInText(native);
  const ocrAccounts = validIbansInText(ocr);
  if (nativeAccounts.size !== ocrAccounts.size || [...nativeAccounts].some((account) => !ocrAccounts.has(account))) return true;
  const financialTokens = (value: string) => new Set((value.toUpperCase().match(/[\p{L}\p{N}.,/-]*\d[\p{L}\p{N}.,/-]*/gu) ?? []).map((token) => token.replace(/[^\p{L}\p{N}]/gu, "")).filter((token) => token.length >= 2));
  const nativeFinancial = financialTokens(native);
  const ocrFinancial = financialTokens(ocr);
  if ([...nativeFinancial].some((token) => !ocrFinancial.has(token))) return true;
  const sourceWords = [...new Set(native.toUpperCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [])];
  const seen = new Set(ocr.toUpperCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []);
  return sourceWords.length >= 3 && sourceWords.filter((word) => seen.has(word)).length / sourceWords.length < 0.55;
}

async function recognizeImage(data: Buffer, width: number, height: number, number: number): Promise<EvidencePage> {
  const langPath = localLanguages();
  let worker: Awaited<ReturnType<typeof createWorker>> | null = null;
  try {
    const active = await createWorker([...TWO_LANGUAGES], undefined, { langPath, cacheMethod: "none" });
    worker = active;
    await active.setParameters({ user_defined_dpi: "300" });
    const candidates: EvidencePage[] = [];
    const base = await sharp(data, { limitInputPixels: MAX_PIXELS }).rotate().png().toBuffer();
    const run = async (image: Buffer, orientation: number) => {
      const dimensions = await sharp(image, { limitInputPixels: MAX_PIXELS }).metadata();
      const output = await active.recognize(image, { rotateAuto: true }, { blocks: true, text: true });
      const words: EvidenceWord[] = [];
      for (const block of output.data.blocks ?? []) for (const paragraph of block.paragraphs) for (const line of paragraph.lines) for (const word of line.words) {
        if (!word.text.trim()) continue;
        words.push({ text: word.text.trim(), confidence: word.confidence, box: { x: word.bbox.x0, y: word.bbox.y0, width: word.bbox.x1 - word.bbox.x0, height: word.bbox.y1 - word.bbox.y0 } });
      }
      const text = linesFromWords(words) || output.data.text.trim();
      const bounded = boundedPageText(text);
      candidates.push({ number, method: "ocr", text: bounded.text, words, confidence: output.data.confidence, width: dimensions.width ?? width, height: dimensions.height ?? height, rotation_radians: output.data.rotateRadians, orientation_degrees: orientation, warnings: bounded.warnings });
    };
    await run(base, 0);
    if (candidates[0].confidence < 75 || !usableNative(candidates[0].text)) {
      for (const orientation of [90, 180, 270]) await run(await sharp(base).rotate(orientation).png().toBuffer(), orientation);
    }
    let best = candidates.sort((a, b) => (b.confidence + Math.min(b.words.length, 40)) - (a.confidence + Math.min(a.words.length, 40)))[0];
    if (best.confidence < 75 || !usableNative(best.text)) {
      const oriented = await sharp(base).rotate(best.orientation_degrees ?? 0).grayscale().normalize().median(3).sharpen().png().toBuffer();
      await run(oriented, best.orientation_degrees ?? 0);
      best = candidates.sort((a, b) => (b.confidence + Math.min(b.words.length, 40)) - (a.confidence + Math.min(a.words.length, 40)))[0];
    }
    if (best.confidence < 75 || !usableNative(best.text)) best.warnings.push("OCR_LOW_CONFIDENCE");
    return best;
  } finally {
    if (worker) await worker.terminate();
    for (const code of TWO_LANGUAGES) { try { unlinkSync(join(langPath, `${code}.traineddata.gz`)); } catch { /* A failed initialization may not have copied both files. */ } }
    rmdirSync(langPath);
  }
}

async function readInvoiceEvidenceUnbounded(data: Buffer, contentType: string, options: { forceOcr?: boolean } = {}): Promise<InvoiceEvidence> {
  const validated = await readDocument(data, contentType);
  const pages: EvidencePage[] = [];
  if (contentType !== "application/pdf") {
    const metadata = await sharp(data, { limitInputPixels: MAX_PIXELS }).metadata();
    pages.push(await recognizeImage(data, metadata.width!, metadata.height!, 1));
  } else {
    const loading = getDocument({ data: new Uint8Array(data), useSystemFonts: true });
    const pdf = await loading.promise;
    const parser = new PDFParse({ data: new Uint8Array(data) });
    try {
      for (let number = 1; number <= validated.page_count; number++) {
        const page = await pdf.getPage(number);
        const viewport = page.getViewport({ scale: 1 });
        const content = await page.getTextContent();
        const words: EvidenceWord[] = content.items.flatMap((item) => {
          if (!("str" in item) || !item.str.trim()) return [];
          const [x, y] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
          return [{ text: item.str.trim(), confidence: null, box: { x, y: y - Math.abs(item.height), width: Math.abs(item.width), height: Math.abs(item.height) } }];
        });
        const nativeText = linesFromWords(words);
        const nativeUsable = usableNative(nativeText);
        const operators = nativeUsable && !options.forceOcr ? await page.getOperatorList() : null;
        const containsRaster = Boolean(operators?.fnArray.some((operator) => [OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintInlineImageXObjectGroup, OPS.paintImageXObjectRepeat].includes(operator)));
        if (!options.forceOcr && nativeUsable && !containsRaster) {
          const bounded = boundedPageText(nativeText);
          pages.push({ number, method: "native_pdf_text", text: bounded.text, words, confidence: 100, width: viewport.width, height: viewport.height, warnings: bounded.warnings });
        }
        else {
          const scale = Math.min(300 / 72, Math.sqrt(MAX_PIXELS / (viewport.width * viewport.height)));
          const render = (await parser.getScreenshot({ partial: [number], scale, imageDataUrl: false, imageBuffer: true })).pages[0];
          const ocr = await recognizeImage(Buffer.from(render.data), render.width, render.height, number);
          const conflict = nativeUsable && containsRaster && nativeOcrConflict(nativeText, ocr.text);
          const nativeWords = nativeText.toUpperCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [];
          const seen = new Set(ocr.text.toUpperCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []);
          if (conflict || !nativeUsable && nativeWords.length >= 3 && nativeWords.filter((word) => seen.has(word)).length / nativeWords.length < 0.75) ocr.warnings.push("NATIVE_OCR_CONFLICT");
          const bounded = boundedPageText(nativeText);
          pages.push(nativeUsable && containsRaster && !conflict ? { number, method: "native_pdf_text", text: bounded.text, words, confidence: 100, width: viewport.width, height: viewport.height, warnings: bounded.warnings } : ocr);
        }
        page.cleanup();
      }
    } finally { await parser.destroy(); await pdf.destroy(); }
  }
  const warnings = pages.flatMap((page) => page.warnings.map((warning) => `Page ${page.number}: ${warning}`));
  return { pages, text: pages.map((page) => `--- Page ${page.number} (${page.method}) ---\n${page.text}`).join("\n"), quality: warnings.length ? "review" : "sufficient", warnings };
}

export async function readInvoiceEvidence(data: Buffer, contentType: string, options: { forceOcr?: boolean } = {}): Promise<InvoiceEvidence> {
  return limitedOcr(() => readInvoiceEvidenceUnbounded(data, contentType, options));
}
