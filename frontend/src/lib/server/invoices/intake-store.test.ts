import { describe, expect, it } from "vitest";
import { IntakeStore } from "./intake-store";
import { PrivateInvoiceStorage } from "./private-storage";
import { AccountProtector } from "../security/account";
import { PgStore } from "../database/postgres-store";
import { parseLabeledText, reviewedInvoiceSchema } from "./extraction";

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
});
