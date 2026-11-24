import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { Pool } from "pg";

dotenv.config({ path: ".env.local", quiet: true });
const base = process.env.TRUSTPAY_E2E_BASE_URL ?? "http://127.0.0.1:3000";
const organization = process.env.TRUSTPAY_E2E_MAKER_ORG;
const actors = {};
const clients = {};
for (const name of ["MAKER", "VERIFIER", "APPROVER", "OUTSIDER"]) {
  const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email: process.env[`TRUSTPAY_E2E_${name}_EMAIL`], password: process.env[`TRUSTPAY_E2E_${name}_PASSWORD`] });
  assert.ifError(error);
  actors[name] = data.session.access_token;
  clients[name] = client;
}
for (const name of ["MAKER", "VERIFIER", "APPROVER", "OUTSIDER"]) {
  const response = await fetch(`${base}/api/v1/me/organizations`, { headers: { Authorization: `Bearer ${actors[name]}` } });
  console.log(name, (await response.json()).map((item) => ({ id: item.id, role: item.role })));
}
async function call(actor, path, options = {}, expected = 200) {
  const response = await fetch(`${base}/api/v1${path}`, { ...options, headers: { Authorization: `Bearer ${actors[actor]}`, "X-Organization-Id": organization, ...options.headers } });
  const contentType = response.headers.get("content-type") ?? "";
  const value = contentType.includes("application/json") ? await response.json() : await response.arrayBuffer();
  if (response.status !== expected) throw new Error(`${actor} ${path}: expected ${expected}, got ${response.status}: ${JSON.stringify(value).slice(0, 700)}`);
  return value;
}
const supplierList = await call("MAKER", "/suppliers");
const supplier = supplierList.find((item) => item.name === "Aegean Supplies Synthetic Ltd");
assert.ok(supplier);
const pdf = await readFile(new URL("../src/lib/server/invoices/fixtures/synthetic-invoice.pdf", import.meta.url));
const corrupt = new FormData();
corrupt.set("file", new File(["%PDF-\ncorrupt"], "corrupt.pdf", { type: "application/pdf" }));
await call("MAKER", "/invoice-intakes", { method: "POST", body: corrupt }, 422);
const form = new FormData();
form.set("file", new File([pdf], "synthetic-invoice.pdf", { type: "application/pdf" }));
const intake = await call("MAKER", "/invoice-intakes", { method: "POST", body: form, headers: { "Idempotency-Key": `smoke-${randomUUID()}` } }, 201);
console.log("Upload:", intake.status, intake.method);
const document = await call("MAKER", `/invoice-intakes/${intake.id}/document`);
assert.equal(document.byteLength, pdf.length);
const fields = { ...intake.fields, supplier_name: supplier.name, invoice_number: `SMOKE-${intake.id.slice(0, 8)}`, invoice_date: "2026-11-23", total_amount: "8420.00", currency: "EUR", iban: "GB43TRST00000000000099" };
for (const field of ["registration_number", "vat_number", "due_date", "payment_reference"]) fields[field] ??= null;
const reviewed = await call("MAKER", `/invoice-intakes/${intake.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fields, supplier_id: supplier.id, create_new_supplier: false }) });
assert.equal(reviewed.status, "reviewed");
const invoice = await call("MAKER", `/invoice-intakes/${intake.id}/analyze`, { method: "POST" });
console.log("Analysis:", invoice.id, invoice.risk, invoice.status);
await call("MAKER", `/invoices/${invoice.id}/approve`, { method: "POST" }, 403);
await call("MAKER", `/invoices/${invoice.id}/verify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ evidence_note: "Synthetic trusted contact callback evidence" }) }, 403);
const verified = await call("VERIFIER", `/invoices/${invoice.id}/verify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ evidence_note: "Synthetic trusted contact callback evidence" }) });
assert.equal(verified.status, "ready");
const approved = await call("APPROVER", `/invoices/${invoice.id}/approve`, { method: "POST" });
assert.equal(approved.status, "approved");
const history = await call("MAKER", `/invoices/${invoice.id}/assessments`);
const documents = await call("MAKER", `/invoices/${invoice.id}/documents`);
const audit = await call("MAKER", "/audit");
assert.ok(history.length >= 1);
assert.ok(documents.length >= 1);
assert.ok(audit.some((event) => event.invoice_id === invoice.id && event.action === "APPROVE"));
await call("OUTSIDER", `/invoices/${invoice.id}`, {}, 403);
const outsiderHeaders = { "X-Organization-Id": process.env.TRUSTPAY_E2E_OUTSIDER_ORG };
await call("OUTSIDER", `/invoices/${invoice.id}`, { headers: outsiderHeaders }, 404);
await call("OUTSIDER", `/invoice-intakes/${intake.id}/document`, { headers: outsiderHeaders }, 404);
await call("OUTSIDER", `/invoices/${invoice.id}/documents/${documents[0].id}`, { headers: outsiderHeaders }, 404);
await call("OUTSIDER", `/invoices/${invoice.id}/approve`, { method: "POST", headers: outsiderHeaders }, 404);
const makerIntake = await clients.MAKER.from("invoice_intakes").select("id").eq("id", intake.id);
const outsiderIntake = await clients.OUTSIDER.from("invoice_intakes").select("id").eq("id", intake.id);
assert.ifError(makerIntake.error);
assert.ifError(outsiderIntake.error);
assert.equal(makerIntake.data.length, 1);
assert.equal(outsiderIntake.data.length, 0);
const databaseUrl = new URL(process.env.TRUSTPAY_DATABASE_URL);
databaseUrl.searchParams.delete("sslmode");
const pool = new Pool({ connectionString: databaseUrl.toString(), ssl: { ca: readFileSync(process.env.TRUSTPAY_DATABASE_CA_CERT_PATH, "utf8"), rejectUnauthorized: true } });
let storagePath;
try { storagePath = (await pool.query("select storage_path from public.invoice_intakes where id=$1 and organization_id=$2", [intake.id, organization])).rows[0].storage_path; }
finally { await pool.end(); }
const makerFile = await clients.MAKER.storage.from("invoice-documents").download(storagePath);
const outsiderFile = await clients.OUTSIDER.storage.from("invoice-documents").download(storagePath);
assert.ifError(makerFile.error);
assert.equal((await makerFile.data.arrayBuffer()).byteLength, pdf.length);
assert.ok(outsiderFile.error);
console.log("Approved with history, private document, and audit event");
console.log("Cross-tenant API, PostgreSQL RLS, and private Storage access denied");
