import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { releasedStatus, type TransitionAction } from "../approvals/policy";
import type { AuditEvent, Invoice, Supplier, AssessmentInput } from "../../types";
import { VERIFIED_ACCOUNT_TRUST_DAYS, assessPayment, normalizedAccount, pythonFixed2 } from "../fraud/risk";
import { LIVE_INVOICE_STATUSES, assertApprovableAgainstDuplicates, duplicateReviewState, normalisationMatches, type DuplicateCandidate, type DuplicateDecision, type DuplicateDecisionValue } from "../fraud/duplicate-review";
import { StatusError } from "../api/status-error";
import { demoInvoices, suppliers as fixtures } from "../jinius/demo";

const TENANT = "asteria-demo";
const now = () => new Date().toISOString();
type Row = { [key: string]: unknown; id: string; supplier_id: string; invoice_number: string; amount_cents: number; creditor_account: string; invoice_date: string; source: string; risk_score: number; risk_level: string; risk_kind: string; reason: string; signals_json: string; status: Invoice["status"]; verified_by: string | null; approved_by: string | null; name: string; short_name: string };
type History = { creditor_account: string; amount_cents: number; invoice_number: string };
const mask = (value: string) => value.length >= 4 ? `•••• ${value.slice(-4)}` : "••••";
function canonical(accounts: string[]): string {
  const counts = new Map<string, number>();
  for (const account of accounts) counts.set(account, (counts.get(account) ?? 0) + 1);
  return accounts.length ? [...counts.keys()].sort().reduce((best, account) => counts.get(account)! > counts.get(best)! ? account : best) : "";
}

export class DemoStore {
  private readonly db: DatabaseSync;
  constructor(readonly path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path, { timeout: 10_000, enableForeignKeyConstraints: true });
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS suppliers (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, name TEXT NOT NULL, short_name TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS payments_history (id INTEGER PRIMARY KEY AUTOINCREMENT, supplier_id TEXT NOT NULL REFERENCES suppliers(id), invoice_number TEXT NOT NULL, amount_cents INTEGER NOT NULL, creditor_account TEXT NOT NULL, paid_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS idx_history_supplier ON payments_history(supplier_id);
      CREATE TABLE IF NOT EXISTS invoices (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, supplier_id TEXT NOT NULL REFERENCES suppliers(id), invoice_number TEXT NOT NULL, amount_cents INTEGER NOT NULL, creditor_account TEXT NOT NULL, invoice_date TEXT NOT NULL, source TEXT NOT NULL, risk_score INTEGER NOT NULL, risk_level TEXT NOT NULL, risk_kind TEXT NOT NULL, reason TEXT NOT NULL, signals_json TEXT NOT NULL, status TEXT NOT NULL, verified_by TEXT, verified_note TEXT, approved_by TEXT, updated_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON invoices(tenant_id);
      CREATE TABLE IF NOT EXISTS duplicate_reviews (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT NOT NULL, invoice_id TEXT NOT NULL REFERENCES invoices(id), matched_kind TEXT NOT NULL CHECK (matched_kind IN ('invoice','payment')), matched_id TEXT NOT NULL, decision TEXT NOT NULL CHECK (decision IN ('distinct','duplicate')), reason TEXT NOT NULL, decided_by TEXT NOT NULL, decided_at TEXT NOT NULL, UNIQUE (invoice_id, matched_kind, matched_id));
      CREATE TABLE IF NOT EXISTS audit_events (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT NOT NULL, invoice_id TEXT, actor TEXT NOT NULL, action TEXT NOT NULL, title TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL);
    `);
    if (!this.db.prepare("SELECT 1 FROM suppliers LIMIT 1").get()) this.transaction(() => this.seed());
  }
  close(): void { this.db.close(); }
  private transaction<T>(operation: () => T): T {
    this.db.exec("BEGIN");
    try {
      const result = operation();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      // A RAISE(ROLLBACK) trigger or a failed COMMIT may already have ended the transaction; keep the original error.
      if (this.db.isTransaction) this.db.exec("ROLLBACK");
      throw error;
    }
  }
  private history(supplierId: string): History[] { return this.db.prepare("SELECT creditor_account,amount_cents,invoice_number FROM payments_history WHERE supplier_id=?").all(supplierId) as History[]; }
  private auditEvent(invoiceId: string | null, actor: string, action: string, title: string, detail: string): void {
    this.db.prepare("INSERT INTO audit_events (tenant_id,invoice_id,actor,action,title,detail,created_at) VALUES (?,?,?,?,?,?,?)").run(TENANT, invoiceId, actor, action, title, detail, now());
  }
  private seed(): void {
    for (const supplier of fixtures) {
      this.db.prepare("INSERT INTO suppliers VALUES (?,?,?,?)").run(supplier.id, TENANT, supplier.name, supplier.short);
      for (let j = 0; j < supplier.count; j++) {
        const number = supplier.id === "SUP-002" && j === 2 ? "MO-2128" : `${supplier.prefix}-${String(j + 1).padStart(3, "0")}`;
        this.db.prepare("INSERT INTO payments_history (supplier_id,invoice_number,amount_cents,creditor_account,paid_at) VALUES (?,?,?,?,?)").run(supplier.id, number, supplier.typicalCents + (j % 3 - 1) * 12_000, supplier.account, `2026-09-${String(j % 27 + 1).padStart(2, "0")}`);
      }
    }
    for (const invoice of demoInvoices) this.insertAssessment(invoice.id, invoice.supplier_id, invoice.number, invoice.amount_cents, invoice.creditor_account, invoice.date, invoice.source);
    this.auditEvent(null, "demo-seed", "DEMO_IMPORT", "Synthetic Jinius invoice batch imported", "4 synthetic invoices assessed using local rule engine; no Jinius API call");
  }
  reset(): void {
    this.transaction(() => {
      this.db.exec("DELETE FROM audit_events; DELETE FROM duplicate_reviews; DELETE FROM invoices; DELETE FROM payments_history; DELETE FROM suppliers;");
      this.seed();
    });
  }
  /** Same rule as PgStore.trustedVerification: an approved, verified invoice to this account, recent, covering the amount, by another verifier. */
  private trustedVerification(supplierId: string, account: string, amountCents: number, excludedUsers: string[]): string | null {
    const rows = this.db.prepare("SELECT i.creditor_account,i.amount_cents,i.verified_by,(SELECT max(a.created_at) FROM audit_events a WHERE a.invoice_id=i.id AND a.action='VERIFY') AS at FROM invoices i WHERE i.tenant_id=? AND i.supplier_id=? AND i.status='approved' AND i.verified_by IS NOT NULL").all(TENANT, supplierId) as { creditor_account: string; amount_cents: number; verified_by: string; at: string | null }[];
    const dates = rows.filter((row) => row.at && normalizedAccount(row.creditor_account) === normalizedAccount(account) && row.amount_cents >= amountCents && !excludedUsers.includes(row.verified_by) && Date.now() - Date.parse(row.at) < VERIFIED_ACCOUNT_TRUST_DAYS * 86_400_000).map((row) => row.at!).sort();
    return dates.length ? dates[dates.length - 1].slice(0, 10) : null;
  }
  private invoiceNumbers(supplierId: string, rejected: boolean): string[] {
    return this.supplierInvoices(supplierId, rejected).map((row) => row.invoiceNumber);
  }
  private supplierInvoices(supplierId: string, rejected: boolean): { invoiceNumber: string; amountCents: number; invoiceDate: string }[] {
    return (this.db.prepare(`SELECT invoice_number,amount_cents,invoice_date FROM invoices WHERE tenant_id=? AND supplier_id=? AND status${rejected ? "=" : "<>"}'rejected'`).all(TENANT, supplierId) as { invoice_number: string; amount_cents: number; invoice_date: string }[])
      .map((row) => ({ invoiceNumber: row.invoice_number, amountCents: row.amount_cents, invoiceDate: row.invoice_date }));
  }
  private insertAssessment(id: string, supplierId: string, invoiceNumber: string, amountCents: number, account: string, date: string, source: string): void {
    const history = this.history(supplierId);
    const assessment = assessPayment({ invoiceNumber, currentAccount: account, amountCents, previousAccounts: history.map((row) => row.creditor_account), previousPaidAmountsCents: history.map((row) => row.amount_cents), previouslyPaidInvoices: history.map((row) => row.invoice_number), otherOpenInvoices: this.invoiceNumbers(supplierId, false), rejectedInvoices: this.invoiceNumbers(supplierId, true), invoiceDate: date, otherOpenInvoiceDetails: this.supplierInvoices(supplierId, false), accountVerifiedOn: this.trustedVerification(supplierId, account, amountCents, []) });
    this.db.prepare("INSERT INTO invoices (id,tenant_id,supplier_id,invoice_number,amount_cents,creditor_account,invoice_date,source,risk_score,risk_level,risk_kind,reason,signals_json,status,verified_by,verified_note,approved_by,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(id, TENANT, supplierId, invoiceNumber, amountCents, account, date, source, assessment.score, assessment.level, assessment.kind, assessment.reason, JSON.stringify(assessment.signals), assessment.recommended_status, null, null, null, now());
    this.auditEvent(id, "trustpay-risk-engine", "ASSESSED", `Payment risk assessed · ${assessment.level}`, `${id} · ${assessment.score}/100 · ${assessment.reason}`);
  }
  createAssessment(item: AssessmentInput): Invoice {
    this.transaction(() => {
      if (!this.db.prepare("SELECT 1 FROM suppliers WHERE id=? AND tenant_id=?").get(item.supplier_id, TENANT)) throw new Error("Unknown demo supplier");
      if (this.db.prepare("SELECT 1 FROM invoices WHERE id=?").get(item.id)) throw new Error("An assessment with this ID already exists");
      this.insertAssessment(item.id, item.supplier_id, item.invoice_number, item.amount_cents, item.creditor_account, item.invoice_date, "manual_demo_submission");
    });
    return this.invoice(item.id);
  }
  private present(row: Row): Invoice {
    const history = this.history(row.supplier_id);
    const accounts = history.map((item) => item.creditor_account);
    const signals = JSON.parse(row.signals_json) as Invoice["signals"];
    return { id: row.id, supplier_id: row.supplier_id, supplier: row.name, short: row.short_name, invoice: row.invoice_number, amount_cents: row.amount_cents, amount: row.amount_cents / 100, iban: mask(row.creditor_account), previous: accounts.length ? mask(canonical(accounts)) : "New supplier", history: history.length, date: row.invoice_date, risk: row.risk_score, level: row.risk_level, kind: row.risk_kind, reason: row.reason, signals, notes: signals.length ? signals.map((signal) => signal.explanation) : [row.reason], status: row.status, verified: Boolean(row.verified_by), verified_by: row.verified_by, approved_by: row.approved_by, reference: row.source === "jinius_demo_adapter" ? "Synthetic Jinius demo" : "Manual demo assessment", source: row.source };
  }
  invoices(): Invoice[] {
    return (this.db.prepare("SELECT i.*,s.name,s.short_name FROM invoices i JOIN suppliers s ON s.id=i.supplier_id WHERE i.tenant_id=? ORDER BY i.invoice_date DESC,i.id DESC").all(TENANT) as Row[]).map((row) => this.present(row));
  }
  invoice(id: string): Invoice {
    const row = this.db.prepare("SELECT i.*,s.name,s.short_name FROM invoices i JOIN suppliers s ON s.id=i.supplier_id WHERE i.id=? AND i.tenant_id=?").get(id, TENANT) as Row | undefined;
    if (!row) throw new Error("Invoice not found");
    return this.present(row);
  }
  suppliers(): Supplier[] {
    const rows = this.db.prepare("SELECT id,name,short_name FROM suppliers WHERE tenant_id=? ORDER BY name").all(TENANT) as { id: string; name: string; short_name: string }[];
    return rows.map((row) => {
      const history = this.history(row.id);
      const amounts = history.map((item) => item.amount_cents).sort((a, b) => a - b);
      const median = amounts.length ? amounts.length % 2 ? amounts[Math.floor(amounts.length / 2)] : (amounts[amounts.length / 2 - 1] + amounts[amounts.length / 2]) / 2 : null;
      return { id: row.id, name: row.name, short: row.short_name, payment_count: history.length, last4: mask(canonical(history.map((item) => item.creditor_account))), historical_median_eur: median === null ? null : Number(pythonFixed2(median / 100)) };
    });
  }
  audit(): AuditEvent[] { return this.db.prepare("SELECT * FROM audit_events WHERE tenant_id=? ORDER BY id DESC LIMIT 200").all(TENANT) as unknown as AuditEvent[]; }
  /** This supplier's other live invoices and paid history records, for the duplicate rules. */
  private duplicateCandidates(supplierId: string, invoiceId: string): DuplicateCandidate[] {
    const invoices = this.db.prepare(`SELECT id,invoice_number,status FROM invoices WHERE tenant_id=? AND supplier_id=? AND id<>? AND status IN (${LIVE_INVOICE_STATUSES.map(() => "?").join(",")})`).all(TENANT, supplierId, invoiceId, ...LIVE_INVOICE_STATUSES) as { id: string; invoice_number: string; status: string }[];
    const paid = this.db.prepare("SELECT id,invoice_number FROM payments_history WHERE supplier_id=?").all(supplierId) as { id: number; invoice_number: string }[];
    return [...invoices.map((row) => ({ kind: "invoice" as const, id: row.id, invoiceNumber: row.invoice_number, status: row.status })), ...paid.map((row) => ({ kind: "payment" as const, id: String(row.id), invoiceNumber: row.invoice_number, status: "paid" }))];
  }
  /** Decisions recorded for this invoice, in either direction for invoice pairs. */
  private duplicateDecisions(invoiceId: string): DuplicateDecision[] {
    const rows = this.db.prepare("SELECT invoice_id,matched_kind,matched_id,decision,reason,decided_by,decided_at FROM duplicate_reviews WHERE tenant_id=? AND (invoice_id=? OR (matched_kind='invoice' AND matched_id=?))").all(TENANT, invoiceId, invoiceId) as { invoice_id: string; matched_kind: "invoice" | "payment"; matched_id: string; decision: DuplicateDecisionValue; reason: string; decided_by: string; decided_at: string }[];
    return rows.map((row) => ({ ...(row.invoice_id === invoiceId ? { kind: row.matched_kind, id: row.matched_id } : { kind: "invoice" as const, id: row.invoice_id }), decision: row.decision, reason: row.reason, decidedBy: row.decided_by, decidedAt: row.decided_at }));
  }
  duplicateReview(id: string) {
    const row = this.db.prepare("SELECT id,supplier_id,invoice_number FROM invoices WHERE id=? AND tenant_id=?").get(id, TENANT) as { id: string; supplier_id: string; invoice_number: string } | undefined;
    if (!row) throw new Error("Invoice not found");
    return { invoice_id: row.id, invoice_number: row.invoice_number, matches: duplicateReviewState(row.invoice_number, this.duplicateCandidates(row.supplier_id, id), this.duplicateDecisions(id)) };
  }
  /** Records an explicit duplicate decision against every undecided normalisation-only match. "duplicate" blocks the invoice. */
  reviewDuplicate(id: string, decision: DuplicateDecisionValue, reason: string): Invoice {
    this.transaction(() => {
      const row = this.db.prepare("SELECT * FROM invoices WHERE id=? AND tenant_id=?").get(id, TENANT) as Row | undefined;
      if (!row) throw new Error("Invoice not found");
      if (["approved", "rejected", "blocked"].includes(row.status)) throw new Error("Invoice cannot be reviewed for duplicates in its current state");
      if (reason.trim().length < 12) throw new Error("Duplicate review reason must have at least 12 characters");
      const decided = this.duplicateDecisions(id);
      const matches = normalisationMatches(row.invoice_number, this.duplicateCandidates(row.supplier_id, id));
      if (!matches.length) throw new StatusError(409, "No possible duplicate is waiting for review on this invoice");
      const open = matches.filter((match) => !decided.some((item) => item.kind === match.kind && item.id === match.id));
      if (!open.length) throw new StatusError(409, "Every possible duplicate on this invoice has already been reviewed");
      const actor = "risk.analyst@demo.local", at = now();
      for (const match of open) this.db.prepare("INSERT INTO duplicate_reviews (tenant_id,invoice_id,matched_kind,matched_id,decision,reason,decided_by,decided_at) VALUES (?,?,?,?,?,?,?,?)").run(TENANT, id, match.kind, match.id, decision, reason.trim(), actor, at);
      if (decision === "duplicate") this.db.prepare("UPDATE invoices SET status='blocked',updated_at=? WHERE id=?").run(at, id);
      this.auditEvent(id, actor, "DUPLICATE_REVIEW", decision === "distinct" ? "Possible duplicate confirmed as a different invoice" : "Possible duplicate confirmed — invoice blocked", `${id} · ${open.map((match) => `"${match.invoiceNumber}" (${match.kind === "payment" ? "paid" : match.status})`).join(", ")} · reason: ${reason.trim()}`);
    });
    return this.invoice(id);
  }
  transition(id: string, action: TransitionAction, note: string): Invoice {
    this.transaction(() => {
      const row = this.db.prepare("SELECT * FROM invoices WHERE id=? AND tenant_id=?").get(id, TENANT) as Row | undefined;
      if (!row) throw new Error("Invoice not found");
      let actor: string;
      let title: string;
      let detail: string;
      if (row.status === "rejected") throw new Error("Rejected invoices are final");
      if (action === "verify") {
        if (row.risk_kind === "duplicate" || row.status === "approved" || row.status === "blocked") throw new Error("Blocked or already approved payments cannot be verified");
        if (row.verified_by) throw new Error("Independent verification has already been recorded");
        if (note.trim().length < 12) throw new Error("Independent verification must include an evidence note (12+ characters)");
        actor = "risk.analyst@demo.local";
        // Verifying a held invoice records the evidence but keeps the hold until someone releases it.
        this.db.prepare("UPDATE invoices SET verified_by=?,verified_note=?,status=?,updated_at=? WHERE id=?").run(actor, note.trim(), row.status === "hold" ? "hold" : "ready", now(), id);
        title = "Independent callback recorded · simulated";
        detail = `${id} · analyst supplied evidence: ${note.trim()}`;
      } else if (action === "approve") {
        if (row.status !== "ready") throw new Error("Payment cannot be approved unless ready for review");
        if (row.risk_score >= 40 && !row.verified_by) throw new Error("Risky payment requires independent verification before approval");
        actor = "finance.manager@demo.local";
        if (row.verified_by === actor) throw new Error("Maker-checker separation failed");
        // A score lowered by another invoice's verification is approvable only while that verification still stands.
        if (!row.verified_by && String(row.signals_json).includes("BANK_ACCOUNT_VERIFIED_CHANGE") && !this.trustedVerification(row.supplier_id, row.creditor_account, row.amount_cents, [actor])) throw new Error("Risky payment requires independent verification: the account verification it relied on is no longer valid for this approval (withdrawn, expired, or recorded by you)");
        // Exact approved or paid copies block; a normalisation-only match needs a recorded "distinct" duplicate review (same rule as PgStore).
        assertApprovableAgainstDuplicates(row.invoice_number, this.duplicateCandidates(row.supplier_id, id), this.duplicateDecisions(id), actor);
        this.db.prepare("UPDATE invoices SET status='approved',approved_by=?,updated_at=? WHERE id=?").run(actor, now(), id);
        title = "Internal approval recorded — NO TRANSFER";
        detail = `${id} · finance manager approved demo decision; no bank payment initiated`;
      } else if (action === "release") {
        if (row.status !== "hold") throw new Error("Invoice cannot be released because it is not on hold");
        actor = "risk.analyst@demo.local";
        this.db.prepare("UPDATE invoices SET status=?,updated_at=? WHERE id=?").run(releasedStatus({ status: row.status, score: row.risk_score, verifiedBy: row.verified_by as string | null, createdBy: null }), now(), id);
        title = "Hold released";
        detail = `${id} · returned to the review queue`;
      } else if (action === "reject") {
        if (note.trim().length < 12) throw new Error("Rejection reason must have at least 12 characters");
        actor = "finance.manager@demo.local";
        this.db.prepare("UPDATE invoices SET status='rejected',updated_at=? WHERE id=?").run(now(), id);
        title = row.status === "approved" ? "Approval withdrawn — invoice rejected" : "Invoice rejected";
        detail = `${id} · reason: ${note.trim()}`;
      } else {
        if (row.status === "approved" || row.status === "blocked") throw new Error("This invoice cannot be placed on hold");
        actor = "risk.analyst@demo.local";
        this.db.prepare("UPDATE invoices SET status='hold',updated_at=? WHERE id=?").run(now(), id);
        title = "Invoice manually placed on hold";
        detail = `${id} · further investigation required`;
      }
      this.auditEvent(id, actor, action.toUpperCase(), title, detail);
    });
    return this.invoice(id);
  }
}
