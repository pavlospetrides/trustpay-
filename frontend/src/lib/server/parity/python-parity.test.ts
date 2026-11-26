// Golden outputs recorded from the last Python backend (see record_python_fixtures.py in git history).
// Each case must give the same result in TypeScript, character for character.
import { describe, expect, it } from "vitest";
import fixtures from "./python-fixtures.json";
import { assessPayment } from "../fraud/risk";
import { AccountProtector, DraftCipher, normalizeIban } from "../security/account";
import { recordDigest } from "../jinius/import";
import { parseLabeledText } from "../invoices/extraction";
import { readDocument } from "../invoices/document";
import { DemoStore } from "../database/demo-store";
import { handleApiRequest } from "../api/handler";

const keys = { encryption: Buffer.from(fixtures.keys.encryption_b64, "base64"), fingerprint: Buffer.from(fixtures.keys.fingerprint_b64, "base64") };
const protector = new AccountProtector(keys.encryption, keys.fingerprint);
const outcome = (work: () => unknown) => { try { return { output: work() }; } catch (error) { return { error: (error as Error).message }; } };

describe("Python parity: risk policy", () => {
  it.each(fixtures.risk.map((item) => [item.name, item] as const))("%s", (_, item) => {
    const input = item.input;
    const result = outcome(() => assessPayment({ invoiceNumber: input.invoice_number, currentAccount: input.current_account, amountCents: input.amount_cents, previousAccounts: input.previous_accounts, previousPaidAmountsCents: input.previous_paid_amounts_cents, previouslyPaidInvoices: input.previously_paid_invoices }));
    expect(result).toEqual("error" in item ? { error: item.error } : { output: item.output });
  });
});

describe("Python parity: account protection", () => {
  it.each(fixtures.iban.map((item) => [item.input, item] as const))("normalizes %j", (_, item) => {
    expect(outcome(() => normalizeIban(item.input))).toEqual("error" in item ? { error: item.error } : { output: item.output });
  });
  it.each(fixtures.crypto.map((item) => [item.input, item] as const))("reads Python ciphertext and fingerprints %j", (_, item) => {
    expect(protector.reveal(Buffer.from(item.encrypted_b64, "base64"))).toBe(item.iban);
    const own = protector.protect(item.input);
    expect([own.fingerprint, own.last4, protector.reveal(own.encrypted)]).toEqual([item.fingerprint, item.last4, item.iban]);
  });
  it("opens an intake draft sealed by Python", () => {
    const { draft } = fixtures;
    expect(new DraftCipher(keys.encryption).open(Buffer.from(draft.sealed_b64, "base64"), draft.organization_id, draft.intake_id)).toEqual(draft.fields);
  });
  it.each(fixtures.record_digest.map((item) => [item.record.id, item] as const))("record digest for %s matches the digest stored by Python", (_, item) => {
    expect(recordDigest(keys.fingerprint, item.record)).toBe(item.digest);
  });
});

describe("Python parity: invoice reading", () => {
  it.each(fixtures.extraction.map((item, index) => [index, item] as const))("labelled text case %i", (_, item) => {
    const result = parseLabeledText(item.text);
    expect({ fields: result.fields, uncertain_fields: result.uncertain_fields, method: result.method, status: result.status })
      .toEqual({ fields: item.fields, uncertain_fields: item.uncertain_fields, method: item.method, status: item.status });
  });
  it.each(fixtures.documents.map((item, index) => [index, item] as const))("document check case %i", async (_, item) => {
    const result = await readDocument(Buffer.from(item.data_b64, "base64"), item.content_type).then((doc) => ({ extension: doc.extension }), (error: Error) => ({ error: error.message }));
    expect(result).toEqual("error" in item ? { error: item.error } : { extension: item.extension });
  });
});

const VOLATILE = new Set(["created_at", "updated_at", "verified_at"]);
const scrub = (value: unknown): unknown => Array.isArray(value) ? value.map(scrub)
  : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, VOLATILE.has(key) ? "<volatile>" : scrub(item)])) : value;
// Deliberate status changes from Python. FastAPI rejected the empty upload form (422) before its mode check; TypeScript refuses intake in SQLite mode first, for any body.
const INTENDED_STATUS_CHANGES: Record<string, number> = { "POST /api/v1/invoice-intakes": 403 };

describe("Python parity: SQLite demo API", () => {
  const demo = new DemoStore(":memory:");
  // Steps run in order against one database, as they did against Python.
  it.each(fixtures.api_sqlite.map((step, index) => [index, `${step.method} ${step.path}`, step] as const))("step %i %s", async (_, __, step) => {
    const init: RequestInit = { method: step.method };
    if (step.body) { init.body = JSON.stringify(step.body); init.headers = { "Content-Type": "application/json" }; }
    if (step.path === "/api/v1/invoice-intakes") init.body = new FormData();
    const request = new Request(`http://localhost${step.path}`, init);
    const response = await handleApiRequest(request, step.path.replace(/^\/api\//, "").split("/"), { mode: "sqlite", demo });
    const intended = INTENDED_STATUS_CHANGES[`${step.method} ${step.path}`];
    if (intended !== undefined) { expect(step.status).not.toBe(intended); expect(response.status).toBe(intended); expect(await response.json()).toHaveProperty("detail"); return; }
    // FastAPI's 422 body shape (type/input per issue) is not reproduced; the status and "detail" key are.
    if (step.status === 422) { expect(response.status).toBe(422); expect(await response.json()).toHaveProperty("detail"); }
    else expect({ status: response.status, body: scrub(await response.json()) }).toEqual({ status: step.status, body: step.response });
  });
});
