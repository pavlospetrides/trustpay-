import type { AuditEvent, AssessmentInput, Invoice, Supplier } from "../../types";
import type { AssessmentHistory } from "../../intake";
import type { Principal, TransitionAction } from "../approvals/policy";
import { authorizeDuplicateReview, authorizeTransition, releasedStatus } from "../approvals/policy";
import { assessPayment, identityMismatches, VERIFIED_ACCOUNT_TRUST_DAYS, type IdentityValues } from "../fraud/risk";
import { LIVE_INVOICE_STATUSES, assertApprovableAgainstDuplicates, duplicateReviewState, normalisationMatches, type DuplicateCandidate, type DuplicateDecision, type DuplicateDecisionValue } from "../fraud/duplicate-review";
import { StatusError } from "../api/status-error";
import { AccountProtector } from "../security/account";
import { centsToDecimal, decimalToCents } from "./money";
import { presentInvoice, presentSupplierHistory, type HistoricalPayment, type InvoiceRow } from "./present";
import { transaction, type ConnectionPool, type QueryConnection } from "./postgres";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const internalId = (id: string) => uuidPattern.test(id) ? id : null;
const timestamp = (value: Date | string): string => value instanceof Date ? value.toISOString() : value;

const INVOICE_QUERY = `select i.*,s.public_id as supplier_public_id,s.name as supplier_name,
 b.iban_last4,a.id as assessment_id,a.score,a.severity,a.kind,a.explanation,
 t.explanation as ai_explanation,t.explanation_method as ai_explanation_method
 from public.invoices i
 join public.suppliers s on s.organization_id=i.organization_id and s.id=i.supplier_id
 join public.supplier_bank_accounts b on b.organization_id=i.organization_id and b.id=i.bank_account_id
 join lateral (select * from public.risk_assessments a where a.organization_id=i.organization_id and a.invoice_id=i.id order by a.assessed_at desc,a.id desc limit 1) a on true
 left join public.invoice_intakes t on t.organization_id=i.organization_id and t.invoice_id=i.id
 where i.organization_id=$1`;

export class PgStore {
  constructor(private readonly pool: ConnectionPool, readonly protector: AccountProtector) {}

  private async read<T>(work: (connection: QueryConnection) => Promise<T>): Promise<T> {
    const connection = await this.pool.connect();
    try { return await work(connection); } finally { connection.release(); }
  }

  async health(): Promise<void> { await this.read(async (con) => { await con.query("select 1"); }); }

  async memberships(userId: string): Promise<{ id: string; name: string; role: string }[]> {
    return this.read(async (con) => (await con.query(`select o.id,o.name,m.role from public.organization_memberships m join public.organizations o on o.id=m.organization_id where m.user_id=$1 and o.status='active' order by o.name`, [userId])).rows);
  }

  async membershipRows(userId: string): Promise<{ organizationId: string; role: string }[]> {
    return (await this.memberships(userId)).map((row) => ({ organizationId: row.id, role: row.role }));
  }

  private async history(con: QueryConnection, org: string, supplierId: string): Promise<HistoricalPayment[]> {
    return (await con.query(`select p.amount::text as amount,coalesce(p.historical_invoice_number,i.invoice_number) as historical_invoice_number,b.iban_fingerprint,b.iban_last4
      from public.payment_records p join public.supplier_bank_accounts b on b.organization_id=p.organization_id and b.id=p.bank_account_id
      left join public.invoices i on i.organization_id=p.organization_id and i.id=p.invoice_id
      where p.organization_id=$1 and p.supplier_id=$2 and p.status='paid' order by p.paid_at,p.id`, [org, supplierId])).rows as HistoricalPayment[];
  }

  private async present(con: QueryConnection, row: InvoiceRow & { organization_id: string; supplier_id: string; assessment_id: string }): Promise<Invoice> {
    const history = await this.history(con, row.organization_id, row.supplier_id);
    const signals = (await con.query(`select code,weight,explanation,severity from public.risk_signals where organization_id=$1 and assessment_id=$2 order by weight desc,code`, [row.organization_id, row.assessment_id])).rows;
    return presentInvoice(row, history, signals);
  }

  async invoices(principal: Principal): Promise<Invoice[]> {
    return this.read(async (con) => {
      const rows = (await con.query(`${INVOICE_QUERY} order by i.issue_date desc,i.public_id desc`, [principal.organizationId])).rows;
      const result: Invoice[] = [];
      for (const row of rows) result.push(await this.present(con, row));
      return result;
    });
  }

  async invoice(id: string, principal: Principal): Promise<Invoice> {
    return this.read((con) => this.invoiceIn(con, id, principal));
  }

  async invoiceIn(con: QueryConnection, id: string, principal: Principal): Promise<Invoice> {
    const row = (await con.query(`${INVOICE_QUERY} and (i.id=$2::uuid or i.public_id=$3)`, [principal.organizationId, internalId(id), id])).rows[0];
    if (!row) throw new Error("Invoice not found");
    return this.present(con, row);
  }

  async suppliers(principal: Principal): Promise<Supplier[]> {
    return this.read(async (con) => {
      const rows = (await con.query(`select id,public_id,name from public.suppliers where organization_id=$1 order by name`, [principal.organizationId])).rows;
      const result: Supplier[] = [];
      for (const row of rows) {
        const history = await this.history(con, principal.organizationId, row.id);
        const summary = presentSupplierHistory(history);
        result.push({ id: row.public_id, name: row.name, short: row.name, payment_count: history.length, last4: summary.last4, historical_median_eur: summary.median });
      }
      return result;
    });
  }

  async audit(principal: Principal): Promise<AuditEvent[]> {
    return this.read(async (con) => (await con.query(`select id,actor_id,action,title,detail,target_id as invoice_id,created_at from public.audit_logs where organization_id=$1 order by created_at desc,id desc limit 200`, [principal.organizationId])).rows.map((row) => ({ id: row.id, actor: row.actor_id ?? "system", action: row.action, title: row.title, detail: row.detail, invoice_id: row.invoice_id, created_at: timestamp(row.created_at) })));
  }

  async auditEvent(con: QueryConnection, principal: Principal, targetId: string, action: string, title: string, detail: string, targetType = "invoice"): Promise<void> {
    await con.query(`insert into public.audit_logs (organization_id,actor_id,action,target_type,target_id,title,detail) values ($1,$2,$3,$4,$5,$6,$7)`, [principal.organizationId, principal.userId, action, targetType, targetId, title, detail]);
  }

  async createAssessment(item: AssessmentInput & { source?: string; due_date?: string | null; external_invoice_id?: string; supplier_name?: string; create_new_supplier?: boolean; registration_number?: string | null; vat_number?: string | null; currency?: string }, principal: Principal): Promise<Invoice> {
    if (!["owner", "admin", "analyst"].includes(principal.role)) throw new Error("Role cannot assess invoices");
    const source = item.source ?? "manual";
    if (!["manual", "synthetic_seed", "uploaded"].includes(source)) throw new Error("Unknown assessment source");
    if ((item.currency ?? "EUR") !== "EUR") throw new Error("Only EUR assessments are supported by the current risk engine");
    await transaction(this.pool, async (con) => {
      let supplier = item.supplier_id ? (await con.query(`select id from public.suppliers where organization_id=$1 and public_id=$2`, [principal.organizationId, item.supplier_id])).rows[0] : null;
      if (!supplier && source === "uploaded" && item.supplier_name) {
        supplier = (await con.query(`select id from public.suppliers where organization_id=$1 and lower(name)=lower($2) order by created_at limit 1`, [principal.organizationId, item.supplier_name])).rows[0];
        if (!supplier && item.create_new_supplier) supplier = (await con.query(`insert into public.suppliers (organization_id,public_id,name,registration_number,vat_number,status) values ($1,$2,$3,$4,$5,'review') returning id`, [principal.organizationId, `NEW-${crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`, item.supplier_name, item.registration_number ?? null, item.vat_number ?? null])).rows[0];
      }
      if (!supplier) throw new Error("Supplier not found");
      await this.recordAssessment(con, item, principal, supplier.id, source);
    });
    return this.invoice(item.id, principal);
  }

  async recordAssessment(con: QueryConnection, item: AssessmentInput & { due_date?: string | null; external_invoice_id?: string; supplier_name?: string | null; vat_number?: string | null; registration_number?: string | null; extracted_identity?: IdentityValues }, principal: Principal, supplierId: string, source: string): Promise<string> {
    const org = principal.organizationId;
    const account = this.protector.protect(item.creditor_account);
    if ((await con.query(`select 1 from public.invoices where organization_id=$1 and public_id=$2`, [org, item.id])).rows[0]) throw new Error("Assessment ID already exists");
    // Serialise assessments per supplier so two concurrent copies of one invoice cannot both miss each other.
    const supplierRecord = (await con.query(`select name as supplier_name,vat_number,registration_number,country from public.suppliers where organization_id=$1 and id=$2 for update`, [org, supplierId])).rows[0] ?? {};
    const accountVerifiedOn = await this.trustedVerification(con, org, supplierId, account.fingerprint, item.amount_cents, [principal.userId]);
    const history = await this.history(con, org, supplierId);
    const numbers = (await con.query(`select invoice_number,status,total_amount::text as total_amount,issue_date::text as issue_date from public.invoices where organization_id=$1 and supplier_id=$2`, [org, supplierId])).rows as { invoice_number: string; status: string; total_amount: string; issue_date: string }[];
    const otherOpenInvoices = numbers.filter((row) => row.status !== "rejected").map((row) => row.invoice_number);
    const otherOpenInvoiceDetails = numbers.filter((row) => row.status !== "rejected").map((row) => ({ invoiceNumber: row.invoice_number, amountCents: decimalToCents(row.total_amount), invoiceDate: row.issue_date }));
    const rejectedInvoices = numbers.filter((row) => row.status === "rejected").map((row) => row.invoice_number);
    const assessment = assessPayment({ invoiceNumber: item.invoice_number, currentAccount: account.fingerprint, amountCents: item.amount_cents, previousAccounts: history.map((row) => row.iban_fingerprint), previousPaidAmountsCents: history.map((row) => decimalToCents(row.amount)), previouslyPaidInvoices: history.flatMap((row) => row.historical_invoice_number ? [row.historical_invoice_number] : []), otherOpenInvoices, rejectedInvoices, invoiceDate: item.invoice_date, otherOpenInvoiceDetails, accountVerifiedOn, identityMismatches: [...new Set([...identityMismatches(item, supplierRecord), ...identityMismatches(item.extracted_identity ?? {}, supplierRecord)])] });
    const accountId = (await con.query(`insert into public.supplier_bank_accounts (organization_id,supplier_id,encrypted_iban,iban_fingerprint,iban_last4) values ($1,$2,$3,$4,$5) on conflict (organization_id,supplier_id,iban_fingerprint) do update set updated_at=now() returning id`, [org, supplierId, account.encrypted, account.fingerprint, account.last4])).rows[0].id;
    const invoiceId = (await con.query(`insert into public.invoices (organization_id,public_id,supplier_id,external_source,external_invoice_id,invoice_number,issue_date,due_date,currency,total_amount,bank_account_id,status,created_by) values ($1,$2,$3,$4,$5,$6,$7,$8,'EUR',$9,$10,$11,$12) returning id`, [org, item.id, supplierId, source, item.external_invoice_id ?? item.id, item.invoice_number, item.invoice_date, item.due_date ?? null, centsToDecimal(item.amount_cents), accountId, assessment.recommended_status, source === "synthetic_seed" ? null : principal.userId])).rows[0].id;
    const saved = (await con.query(`insert into public.risk_assessments (organization_id,invoice_id,score,severity,kind,recommended_status,engine_version,explanation,evidence) values ($1,$2,$3,$4,$5,$6,'auditable-rules-v1',$7,$8::jsonb) returning id`, [org, invoiceId, assessment.score, assessment.level, assessment.kind, assessment.recommended_status, assessment.reason, JSON.stringify({ historical_payment_count: history.length, policy_score_not_probability: true })])).rows[0];
    for (const signal of assessment.signals) await con.query(`insert into public.risk_signals (organization_id,assessment_id,code,severity,weight,explanation,evidence) values ($1,$2,$3,$4,$5,$6,$7::jsonb)`, [org, saved.id, signal.code, signal.severity, signal.weight, signal.explanation, JSON.stringify({ historical_payment_count: history.length })]);
    await this.auditEvent(con, principal, item.id, "ASSESSED", "Payment risk assessed", `${item.id} · policy score ${assessment.score}/100`);
    return invoiceId;
  }

  /**
   * UTC date of the latest verification of this account that may lower a new invoice's score, or null. It counts only if
   * its invoice was approved and is still approved (rejection cancels it), was verified within the trust window, covers
   * at least this amount, and was verified by none of `excludedUsers` (the new invoice's maker and approver).
   */
  private async trustedVerification(con: QueryConnection, org: string, supplierId: string, fingerprint: string, amountCents: number, excludedUsers: (string | null)[]): Promise<string | null> {
    return (await con.query(`select (max(v.verified_at) at time zone 'UTC')::date::text as verified_on from public.verification_requests v
      join public.supplier_bank_accounts b on b.organization_id=v.organization_id and b.id=v.bank_account_id
      join public.invoices i on i.organization_id=v.organization_id and i.id=v.invoice_id
      where v.organization_id=$1 and b.supplier_id=$2 and b.iban_fingerprint=$3 and v.status='verified' and i.status='approved'
        and v.verified_at > now() - make_interval(hours => $4) and i.total_amount >= $5::numeric and not (v.completed_by = any($6::uuid[]))`,
      [org, supplierId, fingerprint, VERIFIED_ACCOUNT_TRUST_DAYS * 24, centsToDecimal(amountCents), excludedUsers.filter(Boolean)])).rows[0]?.verified_on ?? null;
  }

  /** This supplier's other live invoices (by public ID) and paid history records, for the duplicate rules. */
  private async duplicateCandidates(con: QueryConnection, org: string, supplierId: string, invoiceId: string): Promise<(DuplicateCandidate & { internalId: string })[]> {
    const invoices = (await con.query(`select id,public_id,invoice_number,status from public.invoices where organization_id=$1 and supplier_id=$2 and id<>$3 and status = any($4::text[])`, [org, supplierId, invoiceId, [...LIVE_INVOICE_STATUSES]])).rows as { id: string; public_id: string; invoice_number: string; status: string }[];
    const paid = (await con.query(`select p.id::text as id,coalesce(p.historical_invoice_number,i.invoice_number) as invoice_number from public.payment_records p left join public.invoices i on i.organization_id=p.organization_id and i.id=p.invoice_id where p.organization_id=$1 and p.supplier_id=$2 and p.status='paid'`, [org, supplierId])).rows as { id: string; invoice_number: string | null }[];
    return [...invoices.map((row) => ({ kind: "invoice" as const, id: row.public_id, internalId: row.id, invoiceNumber: row.invoice_number, status: row.status })),
      ...paid.flatMap((row) => row.invoice_number ? [{ kind: "payment" as const, id: row.id, internalId: row.id, invoiceNumber: row.invoice_number, status: "paid" }] : [])];
  }
  /**
   * Decisions recorded for this invoice, in either direction for invoice pairs. The table is read only when a
   * normalisation-only match exists, so databases without migration 20261126000200 keep working for every other invoice.
   */
  private async duplicateDecisions(con: QueryConnection, org: string, row: { id: string; invoice_number: string }, candidates: DuplicateCandidate[]): Promise<DuplicateDecision[]> {
    if (!normalisationMatches(row.invoice_number, candidates).length) return [];
    const rows = (await con.query(`select r.invoice_id,self.public_id as self_public_id,mi.public_id as matched_public_id,r.matched_payment_id::text as matched_payment_id,r.decision,r.reason,r.decided_by::text as decided_by,r.decided_at::text as decided_at
      from public.duplicate_reviews r join public.invoices self on self.organization_id=r.organization_id and self.id=r.invoice_id
      left join public.invoices mi on mi.organization_id=r.organization_id and mi.id=r.matched_invoice_id
      where r.organization_id=$1 and (r.invoice_id=$2 or r.matched_invoice_id=$2)`, [org, row.id])).rows as { invoice_id: string; self_public_id: string; matched_public_id: string | null; matched_payment_id: string | null; decision: DuplicateDecisionValue; reason: string; decided_by: string; decided_at: string }[];
    return rows.map((item) => ({ ...(item.invoice_id === row.id ? (item.matched_payment_id ? { kind: "payment" as const, id: item.matched_payment_id } : { kind: "invoice" as const, id: item.matched_public_id! }) : { kind: "invoice" as const, id: item.self_public_id }), decision: item.decision, reason: item.reason, decidedBy: item.decided_by, decidedAt: item.decided_at }));
  }

  async duplicateReview(id: string, principal: Principal) {
    return this.read(async (con) => {
      const row = (await con.query(`select id,public_id,supplier_id,invoice_number from public.invoices where organization_id=$1 and (id=$2::uuid or public_id=$3)`, [principal.organizationId, internalId(id), id])).rows[0];
      if (!row) throw new Error("Invoice not found");
      const candidates = await this.duplicateCandidates(con, principal.organizationId, row.supplier_id, row.id);
      return { invoice_id: row.public_id, invoice_number: row.invoice_number, matches: duplicateReviewState(row.invoice_number, candidates, await this.duplicateDecisions(con, principal.organizationId, row, candidates)) };
    });
  }

  /** Records an explicit decision against every undecided normalisation-only match, under the supplier lock. "duplicate" blocks the invoice. */
  async reviewDuplicate(id: string, decision: DuplicateDecisionValue, reason: string, principal: Principal): Promise<Invoice> {
    await transaction(this.pool, async (con) => {
      const row = (await con.query(`select i.*,a.score from public.invoices i join lateral (select score from public.risk_assessments a where a.organization_id=i.organization_id and a.invoice_id=i.id order by a.assessed_at desc,a.id desc limit 1) a on true where i.organization_id=$1 and (i.id=$2::uuid or i.public_id=$3) for update of i`, [principal.organizationId, internalId(id), id])).rows[0];
      if (!row) throw new Error("Invoice not found");
      authorizeDuplicateReview(principal, { status: row.status, score: row.score, verifiedBy: row.verified_by, createdBy: row.created_by });
      if (reason.trim().length < 12) throw new Error("Duplicate review reason must have at least 12 characters");
      // Same supplier lock as assessment and approval, so the matches cannot change while the decision is recorded.
      await con.query(`select 1 from public.suppliers where organization_id=$1 and id=$2 for update`, [principal.organizationId, row.supplier_id]);
      const candidates = await this.duplicateCandidates(con, principal.organizationId, row.supplier_id, row.id);
      const matches = normalisationMatches(row.invoice_number, candidates) as (DuplicateCandidate & { internalId: string })[];
      if (!matches.length) throw new StatusError(409, "No possible duplicate is waiting for review on this invoice");
      const decided = await this.duplicateDecisions(con, principal.organizationId, row, candidates);
      const open = matches.filter((match) => !decided.some((item) => item.kind === match.kind && item.id === match.id));
      if (!open.length) throw new StatusError(409, "Every possible duplicate on this invoice has already been reviewed");
      for (const match of open) await con.query(`insert into public.duplicate_reviews (organization_id,invoice_id,matched_invoice_id,matched_payment_id,decision,reason,decided_by) values ($1,$2,$3,$4,$5,$6,$7)`, [principal.organizationId, row.id, match.kind === "invoice" ? match.internalId : null, match.kind === "payment" ? match.internalId : null, decision, reason.trim(), principal.userId]);
      if (decision === "duplicate") await con.query(`update public.invoices set status='blocked',updated_at=now() where organization_id=$1 and id=$2`, [principal.organizationId, row.id]);
      await this.auditEvent(con, principal, row.public_id, "DUPLICATE_REVIEW", decision === "distinct" ? "Possible duplicate confirmed as a different invoice" : "Possible duplicate confirmed — invoice blocked", `${open.map((match) => `"${match.invoiceNumber}" (${match.kind === "payment" ? "paid" : match.status})`).join(", ")} · reason: ${reason.trim()}`);
    });
    return this.invoice(id, principal);
  }

  async transition(id: string, action: TransitionAction, note: string, principal: Principal): Promise<Invoice> {
    await transaction(this.pool, async (con) => {
      const row = (await con.query(`select i.*,a.score,a.assessment_id from public.invoices i join lateral (select score,id as assessment_id from public.risk_assessments a where a.organization_id=i.organization_id and a.invoice_id=i.id order by a.assessed_at desc,a.id desc limit 1) a on true where i.organization_id=$1 and (i.id=$2::uuid or i.public_id=$3) for update of i`, [principal.organizationId, internalId(id), id])).rows[0];
      if (!row) throw new Error("Invoice not found");
      const policyRow = { status: row.status, score: row.score, verifiedBy: row.verified_by, createdBy: row.created_by };
      authorizeTransition(principal, action, policyRow);
      let title: string;
      if (action === "verify") {
        if (note.trim().length < 12) throw new Error("Independent verification needs an evidence reference (12+ characters)");
        await con.query(`insert into public.verification_requests (organization_id,invoice_id,bank_account_id,verification_type,status,initiated_by,completed_by,verified_at,evidence_reference) values ($1,$2,$3,'independent_callback','verified',$4,$4,now(),$5)`, [principal.organizationId, row.id, row.bank_account_id, principal.userId, note.trim()]);
        await con.query(`update public.supplier_bank_accounts set verification_status='verified',last_verified_at=now(),updated_at=now() where organization_id=$1 and id=$2`, [principal.organizationId, row.bank_account_id]);
        // Verifying a held invoice records the evidence but keeps the hold until someone releases it.
        await con.query(`update public.invoices set verified_by=$1,status=$2,updated_at=now() where organization_id=$3 and id=$4`, [principal.userId, row.status === "hold" ? "hold" : "ready", principal.organizationId, row.id]);
        title = "Independent verification recorded";
      } else if (action === "approve") {
        // Same supplier lock as assessment: two copies cannot be approved concurrently, and copies from before #30 are caught here.
        await con.query(`select 1 from public.suppliers where organization_id=$1 and id=$2 for update`, [principal.organizationId, row.supplier_id]);
        // A score lowered by another invoice's verification is approvable only while that verification still stands.
        if (!row.assessment_id) throw new Error("Invoice cannot be approved without a current risk assessment");
        if (!row.verified_by && (await con.query(`select 1 from public.risk_signals where organization_id=$1 and assessment_id=$2 and code='BANK_ACCOUNT_VERIFIED_CHANGE'`, [principal.organizationId, row.assessment_id])).rows[0]) {
          const fingerprint = (await con.query(`select iban_fingerprint from public.supplier_bank_accounts where organization_id=$1 and id=$2`, [principal.organizationId, row.bank_account_id])).rows[0].iban_fingerprint;
          if (!(await this.trustedVerification(con, principal.organizationId, row.supplier_id, fingerprint, decimalToCents(String(row.total_amount)), [row.created_by, principal.userId]))) throw new Error("Risky invoice needs independent verification: the account verification it relied on is no longer valid for this approval (withdrawn, expired, or recorded by you or the invoice creator)");
        }
        // Exact approved or paid copies block; a normalisation-only match needs a recorded "distinct" duplicate review (same rule as DemoStore).
        const candidates = await this.duplicateCandidates(con, principal.organizationId, row.supplier_id, row.id);
        assertApprovableAgainstDuplicates(row.invoice_number, candidates, await this.duplicateDecisions(con, principal.organizationId, row, candidates), principal.userId);
        await con.query(`insert into public.payment_approvals (organization_id,invoice_id,actor_id,decision,reason) values ($1,$2,$3,'approved','Internal review only; no payment initiation')`, [principal.organizationId, row.id, principal.userId]);
        await con.query(`update public.invoices set approved_by=$1,status='approved',updated_at=now() where organization_id=$2 and id=$3`, [principal.userId, principal.organizationId, row.id]);
        title = "Internal approval recorded — no transfer";
      } else if (action === "release") {
        await con.query(`update public.invoices set status=$1,updated_at=now() where organization_id=$2 and id=$3`, [releasedStatus(policyRow), principal.organizationId, row.id]);
        title = "Hold released";
      } else if (action === "reject") {
        // Approval reads other invoices' verifications under this lock, so a rejection cannot slip between that read and its commit.
        await con.query(`select 1 from public.suppliers where organization_id=$1 and id=$2 for update`, [principal.organizationId, row.supplier_id]);
        if (note.trim().length < 12) throw new Error("Rejection reason must have at least 12 characters");
        await con.query(`insert into public.payment_approvals (organization_id,invoice_id,actor_id,decision,reason) values ($1,$2,$3,'rejected',$4)`, [principal.organizationId, row.id, principal.userId, note.trim()]);
        await con.query(`update public.invoices set status='rejected',updated_at=now() where organization_id=$1 and id=$2`, [principal.organizationId, row.id]);
        title = row.status === "approved" ? "Approval withdrawn — invoice rejected" : "Invoice rejected";
      } else {
        await con.query(`update public.invoices set status='hold',updated_at=now() where organization_id=$1 and id=$2`, [principal.organizationId, row.id]);
        title = "Invoice placed on hold";
      }
      await this.auditEvent(con, principal, row.public_id, action.toUpperCase(), title, "Decision recorded with authorized actor; no payment initiated");
    });
    return this.invoice(id, principal);
  }

  async assessmentHistory(id: string, principal: Principal): Promise<AssessmentHistory[]> {
    return this.read(async (con) => {
      const invoiceId = await this.internalInvoiceId(con, id, principal);
      const rows = (await con.query(`select id,score,severity,kind,recommended_status,engine_version,explanation,evidence,assessed_at from public.risk_assessments where organization_id=$1 and invoice_id=$2 order by assessed_at desc,id desc`, [principal.organizationId, invoiceId])).rows;
      const result: AssessmentHistory[] = [];
      for (const row of rows) {
        const signals = (await con.query(`select code,severity,weight,explanation,evidence from public.risk_signals where organization_id=$1 and assessment_id=$2 order by weight desc,code`, [principal.organizationId, row.id])).rows;
        result.push({ ...row, assessed_at: timestamp(row.assessed_at), signals });
      }
      return result;
    });
  }

  async internalInvoiceId(con: QueryConnection, id: string, principal: Principal): Promise<string> {
    const row = (await con.query(`select id from public.invoices where organization_id=$1 and (id=$2::uuid or public_id=$3)`, [principal.organizationId, internalId(id), id])).rows[0];
    if (!row) throw new Error("Invoice not found");
    return row.id;
  }

  async documentList(id: string, principal: Principal): Promise<{ id: string; content_type: string; size_bytes: number; created_at: string }[]> {
    return this.read(async (con) => {
      const invoiceId = await this.internalInvoiceId(con, id, principal);
      return (await con.query(`select id,content_type,size_bytes,created_at from public.invoice_documents where organization_id=$1 and invoice_id=$2 order by created_at desc`, [principal.organizationId, invoiceId])).rows.map((row) => ({ ...row, created_at: timestamp(row.created_at) }));
    });
  }

  async documentPath(id: string, documentId: string, principal: Principal): Promise<{ storage_path: string; content_type: string }> {
    return this.read(async (con) => {
      const invoiceId = await this.internalInvoiceId(con, id, principal);
      const row = (await con.query(`select storage_path,content_type from public.invoice_documents where organization_id=$1 and invoice_id=$2 and id=$3`, [principal.organizationId, invoiceId, documentId])).rows[0];
      if (!row) throw new Error("Document not found");
      return row;
    });
  }

  async recordDocument(id: string, documentId: string, path: string, contentType: string, size: number, principal: Principal): Promise<void> {
    if (!["owner", "admin", "analyst"].includes(principal.role)) throw new Error("Role cannot upload invoice documents");
    await transaction(this.pool, async (con) => {
      const invoiceId = await this.internalInvoiceId(con, id, principal);
      await con.query(`insert into public.invoice_documents (id,organization_id,invoice_id,storage_path,content_type,size_bytes,uploaded_by) values ($1,$2,$3,$4,$5,$6,$7)`, [documentId, principal.organizationId, invoiceId, path, contentType, size, principal.userId]);
      await this.auditEvent(con, principal, id, "DOCUMENT_UPLOADED", "Private invoice evidence uploaded", `${id} · ${contentType} · ${size} bytes`);
    });
  }
}
