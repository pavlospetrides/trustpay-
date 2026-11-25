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

  it("keeps the trigger's error when SQLite already rolled the transaction back", () => {
    const db = store();
    const native = new DatabaseSync(db.path);
    native.exec("CREATE TRIGGER rollback_synthetic_audit BEFORE INSERT ON audit_events WHEN NEW.invoice_id='ROLLBACK-2' BEGIN SELECT RAISE(ROLLBACK, 'synthetic rollback'); END");
    native.close();
    expect(() => db.createAssessment({ id: "ROLLBACK-2", supplier_id: "SUP-001", invoice_number: "AS-ROLLBACK-2", amount_cents: 800_000, creditor_account: "GB43TRST00000000000099", invoice_date: "2026-11-24" })).toThrow("synthetic rollback");
    expect(() => db.invoice("ROLLBACK-2")).toThrow("Invoice not found");
  });

  it("keeps an approval and its audit history after the file is reopened", () => {
    const db = store();
    db.transition("INV-2409", "verify", "Independent callback confirmed");
    db.transition("INV-2409", "approve", "");
    const path = db.path;
    db.close();
    const reopened = new DemoStore(path);
    stores.push(reopened);
    expect(reopened.invoice("INV-2409").status).toBe("approved");
    expect(reopened.audit().filter((event) => event.invoice_id === "INV-2409").map((event) => event.action)).toEqual(["APPROVE", "VERIFY", "ASSESSED"]);
  });

  it("blocks a second open copy of a supplier invoice until the first is rejected", () => {
    const db = store();
    const copy = (id: string) => db.createAssessment({ id, supplier_id: "SUP-001", invoice_number: "as-2026-200", amount_cents: 842_000, creditor_account: "GB43TRST00000000000099", invoice_date: "2026-11-24" });
    copy("COPY-1");
    const second = copy("COPY-2");
    expect([second.risk, second.status]).toEqual([100, "blocked"]);
    expect(second.signals.map((signal) => signal.code)).toContain("DUPLICATE_OPEN_INVOICE");
    db.transition("COPY-1", "reject", "Supplier says this invoice was never issued");
    db.transition("COPY-2", "reject", "Blocked duplicate copy closed by reviewer");
    const resubmitted = copy("COPY-3");
    expect(resubmitted.signals.map((signal) => signal.code)).toEqual(expect.arrayContaining(["PREVIOUSLY_REJECTED_INVOICE"]));
    expect(resubmitted.signals.map((signal) => signal.code)).not.toContain("DUPLICATE_OPEN_INVOICE");
    expect(resubmitted.status).toBe("needs_review");
    expect(() => db.transition("COPY-3", "approve", "")).toThrow();
  });

  it("refuses to approve a second copy that predates duplicate screening", () => {
    const db = store();
    db.createAssessment({ id: "OLD-A", supplier_id: "SUP-003", invoice_number: "KM-7001", amount_cents: 100_000, creditor_account: "SYNTHETIC-A", invoice_date: "2026-11-24" });
    db.createAssessment({ id: "OLD-B", supplier_id: "SUP-003", invoice_number: "KM-7002", amount_cents: 100_000, creditor_account: "SYNTHETIC-A", invoice_date: "2026-11-24" });
    const native = new DatabaseSync(db.path);
    native.prepare("UPDATE invoices SET invoice_number='km-7001', status='ready', verified_by='legacy@demo.local' WHERE id IN ('OLD-A','OLD-B')").run();
    native.close();
    expect(db.transition("OLD-A", "approve", "").status).toBe("approved");
    expect(() => db.transition("OLD-B", "approve", "")).toThrow("another copy is already approved");
  });

  it("keeps a hold in place when the held invoice is verified", () => {
    const db = store();
    db.transition("INV-2409", "hold", "");
    expect(db.transition("INV-2409", "verify", "Independent callback confirmed").status).toBe("hold");
    expect(() => db.transition("INV-2409", "approve", "")).toThrow();
    expect(db.transition("INV-2409", "release", "").status).toBe("ready");
  });

  it("releases a verified hold for approval and keeps rejection final", () => {
    const db = store();
    db.transition("INV-2409", "verify", "Independent callback confirmed");
    db.transition("INV-2409", "hold", "");
    expect(db.transition("INV-2409", "release", "").status).toBe("ready");
    expect(db.transition("INV-2409", "approve", "").status).toBe("approved");
    expect(() => db.transition("INV-2409", "reject", "too short")).toThrow("at least 12");
    expect(db.transition("INV-2409", "reject", "Supplier reported the bank change as fraud").status).toBe("rejected");
    expect(() => db.transition("INV-2409", "approve", "")).toThrow("final");
    expect(db.audit().filter((event) => event.invoice_id === "INV-2409").map((event) => event.action)).toEqual(["REJECT", "APPROVE", "RELEASE", "HOLD", "VERIFY", "ASSESSED"]);
  });
});
