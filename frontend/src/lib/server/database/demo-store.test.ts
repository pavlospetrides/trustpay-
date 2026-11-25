import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { DemoStore } from "./demo-store";

const paths: string[] = [];
const stores: DemoStore[] = [];
function store(): DemoStore {
  const directory = mkdtempSync(join(tmpdir(), "trustpay-node-test-"));
  paths.push(directory);
  const instance = new DemoStore(join(directory, "demo.sqlite3"));
  stores.push(instance);
  return instance;
}
afterEach(() => { for (const instance of stores.splice(0)) if (instance !== undefined) { try { instance.close(); } catch { /* already closed */ } } for (const path of paths.splice(0)) rmSync(path, { recursive: true, force: true }); });

describe("synthetic local demo persistence", () => {
  it("seeds 14 Aegean payments and the four original policy scores", () => {
    const db = store();
    expect(db.suppliers().find((s) => s.id === "SUP-001")?.payment_count).toBe(14);
    expect(db.invoices().map((invoice) => [invoice.id, invoice.risk, invoice.status])).toEqual([
      ["INV-2409", 75, "needs_review"],
      ["INV-2410", 100, "blocked"],
      ["INV-2411", 65, "needs_review"],
      ["INV-2412", 0, "ready"],
    ]);
  });

  it("blocks early approval and persists separate verification and approval events", () => {
    const db = store();
    expect(() => db.transition("INV-2409", "approve", "")).toThrow();
    expect(db.transition("INV-2409", "verify", "Independent callback confirmed").status).toBe("ready");
    expect(db.transition("INV-2409", "approve", "").status).toBe("approved");
    expect(db.audit().filter((event) => event.invoice_id === "INV-2409").map((event) => event.action)).toEqual(["APPROVE", "VERIFY", "ASSESSED"]);
    expect(() => db.transition("INV-2409", "approve", "")).toThrow();
  });

  it("retains assessments across reopening the database", () => {
    const db = store();
    const path = db.path;
    db.createAssessment({ id: "NEW-1", supplier_id: "SUP-001", invoice_number: "AS-NEW", amount_cents: 800_000, creditor_account: "GB43TRST00000000000099", invoice_date: "2026-11-24" });
    db.close();
    const reopened = new DemoStore(path);
    expect(reopened.invoice("NEW-1").risk).toBe(75);
    reopened.close();
  });

  it("keeps the existing SQLite file and leaves no partial invoice or audit on a rejected assessment", () => {
    const db = store();
    const initialInvoices = db.invoices().length;
    const initialAudit = db.audit().length;
    expect(() => db.createAssessment({ id: "INV-2409", supplier_id: "SUP-001", invoice_number: "DUPLICATE", amount_cents: 100, creditor_account: "SYNTHETIC", invoice_date: "2026-11-24" })).toThrow();
    expect(db.invoices()).toHaveLength(initialInvoices);
    expect(db.audit()).toHaveLength(initialAudit);
    const path = db.path;
    db.close();
    const native = new DatabaseSync(path);
    expect(native.prepare("SELECT COUNT(*) AS total FROM payments_history WHERE supplier_id=?").get("SUP-001")).toMatchObject({ total: 14 });
    expect(native.prepare("SELECT risk_score AS score,status FROM invoices WHERE id=?").get("INV-2409")).toMatchObject({ score: 75, status: "needs_review" });
    native.close();
  });

  it("rolls back an invoice when its audit insert fails", () => {
    const db = store();
    const native = new DatabaseSync(db.path);
    native.exec("CREATE TRIGGER reject_synthetic_audit BEFORE INSERT ON audit_events WHEN NEW.invoice_id='ROLLBACK-1' BEGIN SELECT RAISE(ABORT, 'synthetic audit failure'); END");
    native.close();
    const auditBefore = db.audit().length;
    expect(() => db.createAssessment({ id: "ROLLBACK-1", supplier_id: "SUP-001", invoice_number: "AS-ROLLBACK", amount_cents: 800_000, creditor_account: "GB43TRST00000000000099", invoice_date: "2026-11-24" })).toThrow("synthetic audit failure");
    expect(() => db.invoice("ROLLBACK-1")).toThrow("Invoice not found");
    expect(db.audit()).toHaveLength(auditBefore);
  });
});
