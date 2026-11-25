import type { AuditEvent, AssessmentInput, Invoice, Supplier } from "../../types";
import type { AssessmentHistory } from "../../intake";
import type { Principal, TransitionAction } from "../approvals/policy";
import { authorizeTransition } from "../approvals/policy";
import { assessPayment } from "../fraud/risk";
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

  async recordAssessment(con: QueryConnection, item: AssessmentInput & { due_date?: string | null; external_invoice_id?: string }, principal: Principal, supplierId: string, source: string): Promise<string> {
    const org = principal.organizationId;
    const account = this.protector.protect(item.creditor_account);
    if ((await con.query(`select 1 from public.invoices where organization_id=$1 and public_id=$2`, [org, item.id])).rows[0]) throw new Error("Assessment ID already exists");
    const history = await this.history(con, org, supplierId);
    const assessment = assessPayment({ invoiceNumber: item.invoice_number, currentAccount: account.fingerprint, amountCents: item.amount_cents, previousAccounts: history.map((row) => row.iban_fingerprint), previousPaidAmountsCents: history.map((row) => decimalToCents(row.amount)), previouslyPaidInvoices: history.flatMap((row) => row.historical_invoice_number ? [row.historical_invoice_number] : []) });
    const accountId = (await con.query(`insert into public.supplier_bank_accounts (organization_id,supplier_id,encrypted_iban,iban_fingerprint,iban_last4) values ($1,$2,$3,$4,$5) on conflict (organization_id,supplier_id,iban_fingerprint) do update set updated_at=now() returning id`, [org, supplierId, account.encrypted, account.fingerprint, account.last4])).rows[0].id;
    const invoiceId = (await con.query(`insert into public.invoices (organization_id,public_id,supplier_id,external_source,external_invoice_id,invoice_number,issue_date,due_date,currency,total_amount,bank_account_id,status,created_by) values ($1,$2,$3,$4,$5,$6,$7,$8,'EUR',$9,$10,$11,$12) returning id`, [org, item.id, supplierId, source, item.external_invoice_id ?? item.id, item.invoice_number, item.invoice_date, item.due_date ?? null, centsToDecimal(item.amount_cents), accountId, assessment.recommended_status, source === "synthetic_seed" ? null : principal.userId])).rows[0].id;
    const saved = (await con.query(`insert into public.risk_assessments (organization_id,invoice_id,score,severity,kind,recommended_status,engine_version,explanation,evidence) values ($1,$2,$3,$4,$5,$6,'auditable-rules-v1',$7,$8::jsonb) returning id`, [org, invoiceId, assessment.score, assessment.level, assessment.kind, assessment.recommended_status, assessment.reason, JSON.stringify({ historical_payment_count: history.length, policy_score_not_probability: true })])).rows[0];
    for (const signal of assessment.signals) await con.query(`insert into public.risk_signals (organization_id,assessment_id,code,severity,weight,explanation,evidence) values ($1,$2,$3,$4,$5,$6,$7::jsonb)`, [org, saved.id, signal.code, signal.severity, signal.weight, signal.explanation, JSON.stringify({ historical_payment_count: history.length })]);
    await this.auditEvent(con, principal, item.id, "ASSESSED", "Payment risk assessed", `${item.id} · policy score ${assessment.score}/100`);
    return invoiceId;
  }

  async transition(id: string, action: TransitionAction, note: string, principal: Principal): Promise<Invoice> {
    await transaction(this.pool, async (con) => {
      const row = (await con.query(`select i.*,a.score from public.invoices i join lateral (select score from public.risk_assessments a where a.organization_id=i.organization_id and a.invoice_id=i.id order by a.assessed_at desc,a.id desc limit 1) a on true where i.organization_id=$1 and (i.id=$2::uuid or i.public_id=$3) for update of i`, [principal.organizationId, internalId(id), id])).rows[0];
      if (!row) throw new Error("Invoice not found");
      authorizeTransition(principal, action, { status: row.status, score: row.score, verifiedBy: row.verified_by, createdBy: row.created_by });
      let title: string;
      if (action === "verify") {
        if (note.trim().length < 12) throw new Error("Independent verification needs an evidence reference (12+ characters)");
        await con.query(`insert into public.verification_requests (organization_id,invoice_id,bank_account_id,verification_type,status,initiated_by,completed_by,verified_at,evidence_reference) values ($1,$2,$3,'independent_callback','verified',$4,$4,now(),$5)`, [principal.organizationId, row.id, row.bank_account_id, principal.userId, note.trim()]);
        await con.query(`update public.supplier_bank_accounts set verification_status='verified',last_verified_at=now(),updated_at=now() where organization_id=$1 and id=$2`, [principal.organizationId, row.bank_account_id]);
        await con.query(`update public.invoices set verified_by=$1,status='ready',updated_at=now() where organization_id=$2 and id=$3`, [principal.userId, principal.organizationId, row.id]);
        title = "Independent verification recorded";
      } else if (action === "approve") {
        await con.query(`insert into public.payment_approvals (organization_id,invoice_id,actor_id,decision,reason) values ($1,$2,$3,'approved','Internal review only; no payment initiation')`, [principal.organizationId, row.id, principal.userId]);
        await con.query(`update public.invoices set approved_by=$1,status='approved',updated_at=now() where organization_id=$2 and id=$3`, [principal.userId, principal.organizationId, row.id]);
        title = "Internal approval recorded — no transfer";
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
