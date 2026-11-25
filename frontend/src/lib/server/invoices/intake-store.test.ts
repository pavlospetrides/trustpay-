import { describe, expect, it } from "vitest";
import { IntakeStore } from "./intake-store";
import { PrivateInvoiceStorage } from "./private-storage";
import { AccountProtector } from "../security/account";
import { PgStore } from "../database/postgres-store";
import { parseLabeledText, reviewedInvoiceSchema } from "./extraction";
import { universalDocumentSchema } from "./universal";

const org = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const id = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("tenant-scoped intake review", () => {
  it("rejects an existing supplier ID outside the authenticated organization", async () => {
    const calls: string[] = [];
    const connection = { query: async (sql: string) => { calls.push(sql); if (sql.includes("from public.invoice_intakes t")) return { rows: [{ id, organization_id: org, status: "needs_review" }] }; return { rows: [] }; }, release: () => {} };
    const pool = { connect: async () => connection };
    const protector = new AccountProtector(Buffer.alloc(32, "a"), Buffer.alloc(32, "b"));
    const storage = new PrivateInvoiceStorage({ storage: { from: () => ({ upload: async () => ({ error: null }), download: async () => ({ error: null, data: null }), remove: async () => ({ error: null }) }) } });
    const intake = new IntakeStore(pool, new PgStore(pool, protector), storage, null);
    const fields = reviewedInvoiceSchema.parse(parseLabeledText("Supplier: Synthetic Supplier\nInvoice Number: INV-1\nInvoice Date: 2026-11-24\nTotal Amount: 10.00\nCurrency: EUR\nIBAN: GB82WEST12345698765432").fields);
    await expect(intake.review(id, fields, "SUP-OTHER", false, { userId: "11111111-1111-4111-8111-111111111111", organizationId: org, role: "analyst" })).rejects.toThrow("Supplier not found");
    expect(calls).toContain("ROLLBACK");
    expect(calls.some((sql) => sql.includes("update public.invoice_intakes"))).toBe(false);
  });
  it("keeps original extracted values encrypted when a reviewer corrects fields", async () => {
    const protector = new AccountProtector(Buffer.alloc(32, "a"), Buffer.alloc(32, "b"));
    const original = reviewedInvoiceSchema.parse(parseLabeledText("Supplier: Synthetic Supplier\nInvoice Number: INV-1\nInvoice Date: 2026-11-24\nTotal Amount: 10.00\nCurrency: EUR\nIBAN: GB82WEST12345698765432").fields);
    const originalCiphertext = protector.draftCipher().seal({ fields: original, document: { document_type: "invoice" } }, org, id);
    let updated: Buffer | null = null;
    const audits: string[] = [];
    const connection = { query: async (sql: string, params?: unknown[]) => {
      if (sql.includes("from public.invoice_intakes t")) return { rows: [{ id, organization_id: org, status: "needs_review", fields_encrypted: originalCiphertext }] };
      if (sql.includes("update public.invoice_intakes")) updated = params?.[0] as Buffer;
      if (sql.includes("insert into public.audit_logs")) audits.push(JSON.stringify(params));
      return { rows: [] };
    }, release: () => {} };
    const pool = { connect: async () => connection };
    const storage = new PrivateInvoiceStorage({ storage: { from: () => ({ upload: async () => ({ error: null }), download: async () => ({ error: null, data: null }), remove: async () => ({ error: null }) }) } });
    const intake = new IntakeStore(pool, new PgStore(pool, protector), storage, null);
    await intake.review(id, { ...original, supplier_name: "Corrected Supplier", total_amount: "12.00" }, null, true, { userId: "11111111-1111-4111-8111-111111111111", organizationId: org, role: "analyst" });
    expect(updated).toBeInstanceOf(Buffer);
    const payload = protector.draftCipher().open(updated!, org, id);
    expect((payload.original_fields as typeof original).total_amount).toBe("10.00");
    expect((payload.fields as typeof original).total_amount).toBe("12.00");
    expect(payload.extracted_identity).toMatchObject({ supplier_name: original.supplier_name });
    expect(JSON.stringify(audits)).not.toContain("12.00");
  });
  it("blocks a purchase order from the payable risk workflow", async () => {
    const protector = new AccountProtector(Buffer.alloc(32, "a"), Buffer.alloc(32, "b"));
    const fields = reviewedInvoiceSchema.parse(parseLabeledText("Supplier: Synthetic Supplier\nInvoice Number: PO-1\nInvoice Date: 2026-11-24\nTotal Amount: 10.00\nCurrency: EUR\nIBAN: GB82WEST12345698765432").fields);
    const ciphertext = protector.draftCipher().seal({ fields, document: { document_type: "purchase_order", multiple_invoices: false } }, org, id);
    const calls: string[] = [];
    const connection = { query: async (sql: string) => { calls.push(sql); if (sql.includes("from public.invoice_intakes t")) return { rows: [{ id, organization_id: org, status: "reviewed", fields_encrypted: ciphertext }] }; return { rows: [] }; }, release: () => {} };
    const pool = { connect: async () => connection };
    const storage = new PrivateInvoiceStorage({ storage: { from: () => ({ upload: async () => ({ error: null }), download: async () => ({ error: null, data: null }), remove: async () => ({ error: null }) }) } });
    const intake = new IntakeStore(pool, new PgStore(pool, protector), storage, null);
    await expect(intake.analyze(id, { userId: "11111111-1111-4111-8111-111111111111", organizationId: org, role: "analyst" })).rejects.toThrow("classification");
    expect(calls).toContain("ROLLBACK");
    expect(calls.some((sql) => sql.includes("insert into public.invoices"))).toBe(false);
  });
  it("requires an audited attestation before clearing a multi-invoice flag", async () => {
    const protector = new AccountProtector(Buffer.alloc(32, "a"), Buffer.alloc(32, "b"));
    const fields = reviewedInvoiceSchema.parse(parseLabeledText("Supplier: Synthetic Supplier\nInvoice Number: INV-1\nInvoice Date: 2026-11-24\nTotal Amount: 10.00\nCurrency: EUR\nIBAN: GB82WEST12345698765432").fields);
    const empty = { value: null, source_value: null, supporting_text: null, page: null, uncertain: false };
    const mapped = (keys: string[]) => Object.fromEntries(keys.map((key) => [key, empty]));
    const reviewedDocument = universalDocumentSchema.parse({ document_type: "invoice", languages: ["en"], multiple_invoices: false, document: mapped(["invoice_number", "invoice_date", "due_date", "purchase_order_reference", "payment_reference", "original_invoice_reference"]), supplier: mapped(["legal_name", "trading_name", "registration_number", "vat_number", "address", "country", "email", "telephone"]), customer: mapped(["legal_name", "trading_name", "registration_number", "vat_number", "address", "country", "email", "telephone", "customer_reference"]), accounts: [], financial: mapped(["currency", "subtotal", "discounts", "net_amount", "vat_amount", "additional_charges", "shipping", "gross_total", "amount_paid", "outstanding_balance"]), vat_breakdown: [], line_items: [], warnings: [] });
    const ciphertext = protector.draftCipher().seal({ fields, document: { ...reviewedDocument, multiple_invoices: true } }, org, id);
    const calls: string[] = [];
    const connection = { query: async (sql: string) => { calls.push(sql); if (sql.includes("from public.invoice_intakes t")) return { rows: [{ id, organization_id: org, status: "needs_review", fields_encrypted: ciphertext }] }; return { rows: [] }; }, release: () => {} };
    const pool = { connect: async () => connection };
    const storage = new PrivateInvoiceStorage({ storage: { from: () => ({ upload: async () => ({ error: null }), download: async () => ({ error: null, data: null }), remove: async () => ({ error: null }) }) } });
    const intake = new IntakeStore(pool, new PgStore(pool, protector), storage, null);
    const principal = { userId: "11111111-1111-4111-8111-111111111111", organizationId: org, role: "analyst" as const };
    await expect(intake.review(id, fields, null, true, principal, reviewedDocument)).rejects.toThrow("reason");
    await expect(intake.review(id, fields, null, true, principal, reviewedDocument, "I checked every page and found a single invoice")).rejects.toThrow("Confirm");
    await intake.review(id, fields, null, true, principal, reviewedDocument, "I checked every page and found a single invoice", true);
    expect(calls.some((sql) => sql.includes("update public.invoice_intakes"))).toBe(true);
  });
  it("can save a missing IBAN for review but blocks analysis", async () => {
    const protector = new AccountProtector(Buffer.alloc(32, "a"), Buffer.alloc(32, "b"));
    const fields = reviewedInvoiceSchema.parse({ supplier_name: "Synthetic Supplier", registration_number: null, vat_number: null, invoice_number: "INV-1", invoice_date: "2026-11-24", due_date: null, total_amount: "10.00", currency: "EUR", iban: null, payment_reference: null });
    const ciphertext = protector.draftCipher().seal({ fields }, org, id);
    const connection = { query: async (sql: string) => { if (sql.includes("from public.invoice_intakes t")) return { rows: [{ id, organization_id: org, status: "reviewed", fields_encrypted: ciphertext }] }; return { rows: [] }; }, release: () => {} };
    const pool = { connect: async () => connection };
    const storage = new PrivateInvoiceStorage({ storage: { from: () => ({ upload: async () => ({ error: null }), download: async () => ({ error: null, data: null }), remove: async () => ({ error: null }) }) } });
    const intake = new IntakeStore(pool, new PgStore(pool, protector), storage, null);
    await expect(intake.analyze(id, { userId: "11111111-1111-4111-8111-111111111111", organizationId: org, role: "analyst" })).rejects.toThrow("IBAN");
  });
});
