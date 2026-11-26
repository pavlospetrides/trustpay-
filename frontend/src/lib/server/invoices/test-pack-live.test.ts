import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve, extname, basename } from "node:path";
import { config } from "dotenv";
import { describe, expect, it } from "vitest";
import { OpenAIInvoiceProvider } from "../ai/provider";
import { normalizeIban } from "../security/account";
import { extractInvoice } from "./extract-invoice";
import { readInvoiceEvidence } from "./ocr-reader";
import { characterErrorRate } from "./ocr-metrics";
import { minorUnits } from "./universal";

config({ path: resolve(process.cwd(), ".env.local"), quiet: true });

type ExpectedLine = { description: string; quantity: number; unit_price: string; discount: string; vat_rate: number; net: string; vat: string; gross: string };
type Expected = { file: string; document_type: string; invoice_number: string; supplier: string; customer: string; issue_date: string; due_date: string | null; currency: string; iban: string | null; alternative_iban: string | null; original_invoice_reference: string | null; net_total: string; vat_total: string; printed_gross_total: string; calculated_gross_total: string; line_items: ExpectedLine[] };
type ResultRow = { case_index: number; format: string; method: string; error: string | null; account_count: number; elapsed_ms: number; input_tokens: number; output_tokens: number; estimated_api_cost_usd: number; ocr_cer: number | null; mismatches: Array<{ field: string }> };

describe.runIf(process.env.TRUSTPAY_LIVE_TEST_PACK === "1")("supplied synthetic invoice pack", () => {
  it("measures every PDF and image against its independent reference", async () => {
    const packPath = process.env.TRUSTPAY_TEST_PACK_PATH;
    expect(packPath).toBeTruthy();
    expect(process.env.OPENAI_API_KEY).toBeTruthy();
    expect(process.env.TRUSTPAY_ENVIRONMENT).toBe("development");
    expect(process.env.TRUSTPAY_AI_EXTERNAL_DOCUMENTS).toBe("development");
    const expected = JSON.parse(readFileSync(resolve(packPath!, "reference/expected_results.json"), "utf8")) as Expected[];
    const references = new Map(expected.map((sample) => [basename(sample.file, extname(sample.file)), sample]));
    const files = readdirSync(resolve(packPath!, "invoices")).filter((file) => /\.(pdf|jpe?g|png|webp)$/i.test(file) && (!process.env.TRUSTPAY_TEST_PACK_CASE || file === process.env.TRUSTPAY_TEST_PACK_CASE)).sort();
    expect(files.length).toBeGreaterThan(0);
    if (!process.env.TRUSTPAY_TEST_PACK_CASE) for (const sample of expected) expect(files).toContain(sample.file);
    const provider = new OpenAIInvoiceProvider(process.env.TRUSTPAY_AI_MODEL || "gpt-5.4-mini");
    const reader = process.env.TRUSTPAY_TEST_PACK_READER === "ocr" ? "ocr" : "vision";
    const report: ResultRow[] = [];
    const fieldAccuracy: Record<string, { correct: number; total: number }> = {};
    const payableTotalAccuracy = { correct: 0, total: 0 };
    for (const [index, file] of files.entries()) {
      const sample = references.get(basename(file, extname(file)));
      if (!sample) throw new Error(`Missing reference for ${file}`);
      const extension = extname(file).toLowerCase();
      const contentType = extension === ".pdf" ? "application/pdf" : extension === ".png" ? "image/png" : extension === ".webp" ? "image/webp" : "image/jpeg";
      const bytes = readFileSync(resolve(packPath!, "invoices", file));
      const started = performance.now();
      const result = await extractInvoice(bytes, contentType, provider, { reader });
      const elapsed = Math.round(performance.now() - started);
      let ocrCer: number | null = null;
      if (reader === "ocr" && contentType === "application/pdf") {
        const native = await readInvoiceEvidence(bytes, contentType);
        if (native.pages.every((page) => page.method === "native_pdf_text")) {
          const forced = await readInvoiceEvidence(bytes, contentType, { forceOcr: true });
          const normalize = (text: string) => [...text.normalize("NFKC").toUpperCase()].filter((character) => /[\p{L}\p{N}]/u.test(character)).join("").slice(0, 5_000);
          ocrCer = characterErrorRate(normalize(native.pages.map((page) => page.text).join(" ")), normalize(forced.pages.map((page) => page.text).join(" "))).rate;
        }
      }
      const document = result.document;
      const mismatches: Array<{ field: string }> = [];
      const compare = (field: string, wanted: string | null, actual: string | null, amount = false) => {
        const tally = fieldAccuracy[field] ?? { correct: 0, total: 0 };
        tally.total++;
        const correct = amount ? minorUnits(wanted) === minorUnits(actual) : wanted === actual;
        if (correct) tally.correct++;
        else mismatches.push({ field });
        fieldAccuracy[field] = tally;
      };
      compare("document_type", sample.document_type, document?.document_type ?? null);
      compare("supplier", sample.supplier, result.fields.supplier_name);
      compare("customer", sample.customer, document?.customer.legal_name.value ?? null);
      compare("invoice_number", sample.invoice_number, result.fields.invoice_number);
      compare("issue_date", sample.issue_date, result.fields.invoice_date);
      compare("due_date", sample.due_date, result.fields.due_date);
      compare("currency", sample.currency, result.fields.currency);
      compare("original_invoice_reference", sample.original_invoice_reference, document?.document.original_invoice_reference.value ?? null);
      compare("net_total", sample.net_total, document?.financial.net_amount.value ?? document?.financial.subtotal.value ?? null, true);
      compare("vat_total", sample.vat_total, document?.financial.vat_amount.value ?? null, true);
      compare("printed_gross_total", sample.printed_gross_total, document?.financial.gross_total.value ?? null, true);
      payableTotalAccuracy.total++;
      if (minorUnits(sample.printed_gross_total) === minorUnits(result.fields.total_amount)) payableTotalAccuracy.correct++;
      const expectedPayableIban = sample.alternative_iban ? null : (() => { try { return sample.iban ? normalizeIban(sample.iban) : null; } catch { return null; } })();
      compare("payable_iban", expectedPayableIban, result.fields.iban);
      const expectedAccounts = [sample.iban, sample.alternative_iban].filter((value): value is string => Boolean(value)).map((value) => value.replaceAll(" ", "")).sort().join("|");
      const actualAccounts = document?.accounts.map((account) => account.iban.value?.replaceAll(" ", "") ?? "").filter(Boolean).sort().join("|") ?? "";
      compare("printed_account_ibans", expectedAccounts, actualAccounts);
      compare("gross_mismatch_flag", String(minorUnits(sample.printed_gross_total) !== minorUnits(sample.calculated_gross_total)), String(Boolean(result.findings?.some((finding) => finding.code === "GROSS_MISMATCH"))));
      compare("line_count", String(sample.line_items.length), String(document?.line_items.length ?? 0));
      for (const [index, line] of sample.line_items.entries()) {
        const actual = document?.line_items[index];
        compare("line.description", line.description, actual?.description.value ?? null);
        compare("line.quantity", String(line.quantity), actual?.quantity.value ? String(Number(actual.quantity.value.replace(",", "."))) : null);
        compare("line.unit_price", line.unit_price, actual?.unit_price.value ?? null, true);
        compare("line.discount", line.discount, actual?.discount.value ?? null, true);
        compare("line.vat_rate", String(line.vat_rate), actual?.vat_rate.value ? String(Number(actual.vat_rate.value.replace("%", "").replace(",", "."))) : null);
        compare("line.net", line.net, actual?.net_amount.value ?? null, true);
        // The pack derives these two amounts in its reference, but its invoice rows do not print them.
      }
      const usage = result.usage ?? { input_tokens: 0, output_tokens: 0 };
      report.push({ case_index: index + 1, format: extension.slice(1), method: result.method, error: result.error_code, account_count: document?.accounts.length ?? 0, elapsed_ms: elapsed, input_tokens: usage.input_tokens, output_tokens: usage.output_tokens, estimated_api_cost_usd: Number(((usage.input_tokens * 0.75 + usage.output_tokens * 4.5) / 1_000_000).toFixed(6)), ocr_cer: ocrCer, mismatches });
    }
    const comparedFields = Object.values(fieldAccuracy).reduce((sum, field) => sum + field.total, 0);
    const correctFields = Object.values(fieldAccuracy).reduce((sum, field) => sum + field.correct, 0);
    const mismatches = report.flatMap((item) => item.mismatches.map((difference) => ({ case_index: item.case_index, ...difference })));
    const summary = { reader, documents: report.length, compared_fields: comparedFields, correct_fields: correctFields, accuracy: correctFields / comparedFields, field_accuracy: fieldAccuracy, payable_total_accuracy: payableTotalAccuracy, total_elapsed_ms: report.reduce((sum, item) => sum + item.elapsed_ms, 0), total_estimated_api_cost_usd: Number(report.reduce((sum, item) => sum + item.estimated_api_cost_usd, 0).toFixed(6)), mean_ocr_cer: (() => { const values = report.flatMap((item) => item.ocr_cer === null ? [] : [item.ocr_cer]); return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null; })(), unscored_derived_line_values: files.reduce((sum, file) => sum + (references.get(basename(file, extname(file)))?.line_items.length ?? 0) * 2, 0), api_failures: report.filter((item) => item.error), mismatches, results: report };
    const reportName = process.env.TRUSTPAY_TEST_PACK_CASE ? "invoice-test-pack-case-evaluation.json" : reader === "ocr" ? "invoice-test-pack-ocr-evaluation.json" : "invoice-test-pack-vision-rerun.json";
    writeFileSync(resolve(process.cwd(), "../docs", reportName), `${JSON.stringify(summary, null, 2)}\n`);
    expect(report).toHaveLength(files.length);
    if (reader === "ocr" && !process.env.TRUSTPAY_TEST_PACK_CASE) {
      for (const field of ["supplier", "invoice_number", "issue_date", "printed_gross_total", "currency", "payable_iban", "printed_account_ibans"]) {
        expect(fieldAccuracy[field], `${field} must match every independent reference`).toEqual({ correct: files.length, total: files.length });
      }
      expect(payableTotalAccuracy, "payable total must match every independent reference").toEqual({ correct: files.length, total: files.length });
      expect(correctFields).toBeGreaterThanOrEqual(454);
      expect(summary.api_failures).toHaveLength(0);
    }
  }, 900_000);
});
