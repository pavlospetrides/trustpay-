import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";
import { describe, expect, it } from "vitest";
import { corpus, renderCorpusCase } from "./fixtures/universal-corpus";
import { OpenAIInvoiceProvider } from "../ai/provider";
import { extractInvoice } from "./extract-invoice";

config({ path: resolve(process.cwd(), ".env.local"), quiet: true });

describe.runIf(process.env.TRUSTPAY_LIVE_CORPUS === "1")("live multimodal synthetic corpus", () => {
  it("measures extraction on generated documents without using private uploads", async () => {
    expect(process.env.OPENAI_API_KEY).toBeTruthy();
    const provider = new OpenAIInvoiceProvider(process.env.TRUSTPAY_AI_MODEL || "gpt-5.4-mini");
    const limit = Math.max(1, Math.min(30, Number(process.env.TRUSTPAY_LIVE_CORPUS_LIMIT || 30)));
    const sampleSet = process.env.TRUSTPAY_LIVE_CORPUS_CASE ? corpus.filter((sample) => sample.id === process.env.TRUSTPAY_LIVE_CORPUS_CASE) : corpus.slice(0, limit);
    const rows: Array<Record<string, string | number | boolean | null | undefined> & { id: string; split: string; milliseconds: number }> = [];
    for (const sample of sampleSet) {
      const { data, contentType } = await renderCorpusCase(sample);
      const start = performance.now();
      try {
        const result = await extractInvoice(data, contentType, provider);
        rows.push({ id: sample.id, split: sample.split, format: sample.format, language: sample.language, type_correct: result.document?.document_type === sample.documentType, supplier_correct: result.fields.supplier_name?.toLowerCase() === sample.supplier.toLowerCase(), number_correct: result.fields.invoice_number === sample.invoiceNumber, total_correct: result.fields.total_amount === sample.total, currency_correct: result.fields.currency === sample.currency, iban_correct: sample.iban === null || sample.multipleAccounts ? result.fields.iban === null : result.fields.iban === sample.iban.replaceAll(" ", ""), missing_iban_correct: sample.iban === null ? result.fields.iban === null : null, account_count: result.document?.accounts.length ?? 0, line_count_correct: result.document?.line_items.length === sample.lines, line_items_correct: result.document?.line_items.length === sample.lines && result.document.line_items.every((line, index) => line.description.value === `Synthetic service ${index + 1}` && line.quantity.value === "1" && line.vat_rate.value?.replace("%", "") === "24"), false_extraction: sample.iban === null && result.fields.iban !== null, input_tokens: result.usage?.input_tokens ?? 0, output_tokens: result.usage?.output_tokens ?? 0, milliseconds: Math.round(performance.now() - start), error: result.error_code });
      } catch (error) {
        rows.push({ id: sample.id, split: sample.split, format: sample.format, language: sample.language, error: error instanceof Error ? error.message : "unknown", milliseconds: Math.round(performance.now() - start) });
      }
    }
    const rate = (key: string) => rows.filter((row) => row[key] === true).length / rows.length;
    const report = { sample_count: rows.length, holdout_count: rows.filter((row) => row.split === "holdout").length, metrics: { classification_accuracy: rate("type_correct"), supplier_accuracy: rate("supplier_correct"), invoice_number_accuracy: rate("number_correct"), total_accuracy: rate("total_correct"), currency_accuracy: rate("currency_correct"), iban_accuracy: rate("iban_correct"), line_count_accuracy: rate("line_count_correct"), line_item_accuracy: rate("line_items_correct"), missing_iban_accuracy: rows.filter((row) => row.missing_iban_correct !== null).length ? rows.filter((row) => row.missing_iban_correct === true).length / rows.filter((row) => row.missing_iban_correct !== null).length : null, false_extraction_rate: rate("false_extraction") }, input_tokens: rows.reduce((sum, row) => sum + (typeof row.input_tokens === "number" ? row.input_tokens : 0), 0), output_tokens: rows.reduce((sum, row) => sum + (typeof row.output_tokens === "number" ? row.output_tokens : 0), 0), average_milliseconds: Math.round(rows.reduce((sum, row) => sum + row.milliseconds, 0) / rows.length), pricing: { model: process.env.TRUSTPAY_AI_MODEL || "gpt-5.4-mini", usd_per_million_input: 0.75, usd_per_million_output: 4.5, source: "https://developers.openai.com/api/docs/models/gpt-5.4-mini", verified_on: "2026-11-25" }, results: rows.map((row) => ({ ...row, estimated_cost_usd: ((typeof row.input_tokens === "number" ? row.input_tokens : 0) * 0.75 + (typeof row.output_tokens === "number" ? row.output_tokens : 0) * 4.5) / 1_000_000 })) };
    const filename = process.env.TRUSTPAY_LIVE_CORPUS_CASE ? `universal-reader-${process.env.TRUSTPAY_LIVE_CORPUS_CASE}.json` : "universal-reader-benchmark.json";
    writeFileSync(resolve(process.cwd(), `../docs/${filename}`), `${JSON.stringify({ ...report, estimated_total_cost_usd: (report.input_tokens * 0.75 + report.output_tokens * 4.5) / 1_000_000 }, null, 2)}\n`);
    expect(rows).toHaveLength(sampleSet.length);
  }, 1_800_000);
});
