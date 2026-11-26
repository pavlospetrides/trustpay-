import { sourceText } from "../../i18n/core";
import type { Integrations, SyncRun } from "../../types";
import type { Principal } from "../approvals/policy";
import { PgStore } from "../database/postgres-store";
import { transaction, type ConnectionPool, type QueryConnection } from "../database/postgres";
import { demoInvoices } from "./demo";
import { importProblem, recordDigest, UNKNOWN_SUPPLIER, type NormalizedInvoice } from "./import";
import { StatusError } from "../api/status-error";
import type { Invoice } from "../../types";

const STOPPED = sourceText("sync-stopped-before-finishing-imported-records-are-kept");
/** The invoice feed a sync reads; only the synthetic demo exists until Jinius supplies a contract (LiveJiniusAdapter). */
export type InvoiceSource = () => NormalizedInvoice[];
// The demo adapter publishes revision 1 of each synthetic invoice.
export const demoSource: InvoiceSource = () => demoInvoices.map((invoice) => ({ ...invoice, revision: "1" }));
const importItem = (record: NormalizedInvoice) => ({ id: `JIN-${record.id}-r${record.revision}`, supplier_id: record.supplier_id, external_invoice_id: record.id, invoice_number: record.number, amount_cents: record.amount_cents, creditor_account: record.creditor_account, invoice_date: record.date });
const iso = (value: Date | string | null): string | null => value instanceof Date ? value.toISOString() : value;
const presentRun = (row: Record<string, unknown>): SyncRun => ({ id: String(row.id), status: row.status as SyncRun["status"], started_at: iso(row.started_at as Date | string)!, finished_at: iso(row.finished_at as Date | string | null), records_seen: Number(row.records_seen), records_created: Number(row.records_created), records_needs_review: Number(row.records_needs_review), records_skipped: Number(row.records_skipped), safe_error: row.safe_error as string | null });

export class JiniusSync {
  constructor(private readonly pool: ConnectionPool, private readonly store: PgStore, private readonly source: InvoiceSource = demoSource) {}
  private async read<T>(work: (con: QueryConnection) => Promise<T>): Promise<T> {
    const con = await this.pool.connect();
    try { return await work(con); } finally { con.release(); }
  }
  async integrations(principal: Principal): Promise<Integrations> {
    const org = principal.organizationId;
    const connection = await this.read(async (con) => (await con.query(`select status from public.integration_connections where organization_id=$1 and provider='jinius'`, [org])).rows[0]);
    const jinius: Integrations["jinius"] = { status: connection?.status ?? "disconnected", adapter: "DemoJiniusAdapter", source_label: sourceText("synthetic-jinius-demo"), live_connected: false, sync_available: true, next_step: sourceText("live-sync-needs-the-official-jinius-sandbox-contract") };
    try {
      await this.read(async (con) => {
        const last = (await con.query(`select r.id,r.status,r.started_at,r.finished_at,r.records_seen,r.records_created,r.records_needs_review,r.records_skipped,r.safe_error from public.sync_runs r join public.integration_connections c on c.organization_id=r.organization_id and c.id=r.connection_id where r.organization_id=$1 and c.provider='jinius' order by r.started_at desc,r.id desc limit 1`, [org])).rows[0];
        const success = (await con.query(`select max(r.finished_at) as at from public.sync_runs r join public.integration_connections c on c.organization_id=r.organization_id and c.id=r.connection_id where r.organization_id=$1 and c.provider='jinius' and r.status='success'`, [org])).rows[0];
        const counts = (await con.query(`select count(*) filter (where status='assessed')::int as assessed,count(*) filter (where status='needs_review')::int as needs_review from public.integration_imports where organization_id=$1 and provider='jinius'`, [org])).rows[0];
        const reviews = (await con.query(`select external_id,revision,review_reason,created_at,evidence->>'supplier_reference' as supplier_reference from public.integration_imports where organization_id=$1 and provider='jinius' and status='needs_review' order by created_at desc,external_id limit 50`, [org])).rows;
        jinius.last_run = last ? presentRun(last) : null;
        jinius.last_success_at = iso(success.at);
        jinius.imported_count = counts.assessed;
        jinius.needs_review_count = counts.needs_review;
        jinius.needs_review = reviews.map((row) => ({ external_id: row.external_id, revision: row.revision, reason: row.review_reason, supplier_reference: row.supplier_reference, resolvable: row.review_reason === UNKNOWN_SUPPLIER, created_at: iso(row.created_at)! }));
      });
    } catch (error) {
      if (!(error instanceof Error && "code" in error && ["42P01", "42703"].includes(String(error.code)))) throw error;
      jinius.sync_available = false;
      jinius.next_step = sourceText("apply-migration-20261124000100-integration-imports-sql-to-enable");
    }
    return { jinius, bank_payment: { status: "disabled", payment_initiation: false } };
  }
  async run(principal: Principal): Promise<SyncRun> {
    if (!["owner", "admin"].includes(principal.role)) throw new Error(sourceText("only-organization-owners-and-admins-can-run-an"));
    const org = principal.organizationId;
    const initial = await transaction(this.pool, async (con) => {
      const connection = (await con.query(`insert into public.integration_connections (organization_id,provider,configuration) values ($1,'jinius',$2::jsonb) on conflict (organization_id,provider) do update set updated_at=now() returning id`, [org, JSON.stringify({ adapter: "DemoJiniusAdapter" })])).rows[0];
      await con.query(`update public.sync_runs set status='failed',finished_at=now(),safe_error=$1 where organization_id=$2 and connection_id=$3 and status='running' and started_at < now() - interval '15 minutes'`, [STOPPED, org, connection.id]);
      const run = (await con.query(`insert into public.sync_runs (organization_id,connection_id,status) values ($1,$2,'running') returning id`, [org, connection.id])).rows[0];
      return { connectionId: connection.id as string, runId: run.id as string };
    });
    const counts = { seen: 0, created: 0, review: 0, skipped: 0 };
    let safeError: string | null = null;
    try {
      for (const record of this.source()) {
        counts.seen++;
        const result = await this.importInvoice(record, initial.connectionId, initial.runId, principal);
        if (result === "assessed") counts.created++;
        else if (result === "needs_review") counts.review++;
        else counts.skipped++;
        await this.updateCounts(initial.runId, org, counts);
      }
    } catch (error) {
      console.error(`Jinius synthetic sync ${initial.runId} failed (${error instanceof Error ? error.constructor.name : "UnknownError"})`);
      safeError = STOPPED;
    }
    return transaction(this.pool, async (con) => {
      await con.query(`update public.sync_runs set records_seen=$1,records_created=$2,records_needs_review=$3,records_skipped=$4 where organization_id=$5 and id=$6`, [counts.seen, counts.created, counts.review, counts.skipped, org, initial.runId]);
      const row = (await con.query(`update public.sync_runs set status=$1,finished_at=now(),safe_error=$2 where organization_id=$3 and id=$4 returning *`, [safeError ? "failed" : "success", safeError, org, initial.runId])).rows[0];
      await this.store.auditEvent(con, principal, initial.runId, "INTEGRATION_SYNC", safeError ? sourceText("jinius-sync-failed") : sourceText("jinius-sync-completed"), sourceText("synthetic-jinius-demo-seen-assessed-need-review-already", { p0: counts.seen, p1: counts.created, p2: counts.review, p3: counts.skipped }), "sync_run");
      return presentRun(row);
    });
  }
  /** Human review: assign an existing supplier to an unknown-supplier import, then assess it once. */
  async resolve(externalId: string, revision: string, supplierPublicId: string, principal: Principal): Promise<Invoice> {
    if (!["owner", "admin", "analyst"].includes(principal.role)) throw new StatusError(403, sourceText("role-cannot-resolve-imported-invoices"));
    const org = principal.organizationId;
    return transaction(this.pool, async (con) => {
      const row = (await con.query(`select id,status,review_reason,source,evidence from public.integration_imports where organization_id=$1 and provider='jinius' and external_id=$2 and revision=$3 for update`, [org, externalId, revision])).rows[0];
      if (!row) throw new StatusError(404, sourceText("imported-invoice-not-found"));
      if (row.status !== "needs_review" || row.review_reason !== UNKNOWN_SUPPLIER) throw new StatusError(422, sourceText("only-imports-waiting-for-an-unknown-supplier-can"));
      const supplier = (await con.query(`select id from public.suppliers where organization_id=$1 and public_id=$2`, [org, supplierPublicId])).rows[0];
      if (!supplier) throw new StatusError(404, sourceText("supplier-not-found"));
      // The full IBAN is never stored with the import, so the provider stays the source of truth.
      const record = this.source().find((item) => item.id === externalId && item.revision === revision);
      if (!record) throw new StatusError(422, sourceText("the-provider-no-longer-returns-this-invoice-revision"));
      const queued = row.evidence?.record_digest;
      if (!queued) throw new StatusError(422, sourceText("this-record-was-queued-before-change-checks-existed"));
      if (queued !== recordDigest(this.store.protector.fingerprintKey, record)) throw new StatusError(422, sourceText("the-provider-changed-this-record-since-it-was"));
      const problem = importProblem(record);
      if (problem) throw new StatusError(422, problem);
      const item = importItem(record);
      let invoiceId: string;
      try { invoiceId = await this.store.recordAssessment(con, item, principal, supplier.id, row.source); }
      catch (error) { throw error instanceof Error && error.message === sourceText("assessment-id-already-exists") ? new StatusError(409, error.message) : error; }
      await con.query(`update public.integration_imports set status='assessed',invoice_id=$1,review_reason=null,updated_at=now() where organization_id=$2 and id=$3`, [invoiceId, org, row.id]);
      await this.store.auditEvent(con, principal, `${externalId}@${revision}`, "IMPORT_RESOLVED", sourceText("imported-invoice-resolved-by-human-review"), sourceText("supplier-assigned-assessed-as", { p0: supplierPublicId, p1: item.id }), "integration_import");
      // Read back in the same transaction: a committed resolve never answers with an error.
      return this.store.invoiceIn(con, item.id, principal);
    });
  }
  private async updateCounts(runId: string, org: string, counts: { seen: number; created: number; review: number; skipped: number }): Promise<void> {
    await this.read(async (con) => { await con.query(`update public.sync_runs set records_seen=$1,records_created=$2,records_needs_review=$3,records_skipped=$4 where organization_id=$5 and id=$6`, [counts.seen, counts.created, counts.review, counts.skipped, org, runId]); });
  }
  private async importInvoice(record: NormalizedInvoice, connectionId: string, runId: string, principal: Principal): Promise<"assessed" | "needs_review" | "skipped"> {
    const org = principal.organizationId;
    return transaction(this.pool, async (con) => {
      const evidence = { supplier_reference: record.supplier_id, invoice_number: record.number, amount_cents: record.amount_cents, issue_date: record.date, account_last4: record.creditor_account?.slice(-4) || null, record_digest: recordDigest(this.store.protector.fingerprintKey, record) };
      const claim = (await con.query(`insert into public.integration_imports (organization_id,connection_id,sync_run_id,provider,external_id,revision,source,status,evidence) values ($1,$2,$3,'jinius',$4,$5,$6,'needs_review',$7::jsonb) on conflict (organization_id,provider,external_id,revision) do nothing returning id`, [org, connectionId, runId, record.id.slice(0, 200), record.revision.slice(0, 200), record.source, JSON.stringify(evidence)])).rows[0];
      if (!claim) return "skipped";
      let reason = importProblem(record);
      const supplier = !reason ? (await con.query(`select id from public.suppliers where organization_id=$1 and public_id=$2`, [org, record.supplier_id])).rows[0] : null;
      if (!reason && !supplier) reason = UNKNOWN_SUPPLIER;
      let invoiceId: string | null = null;
      if (!reason && supplier) {
        try { invoiceId = await this.store.recordAssessment(con, importItem(record), principal, supplier.id, record.source); }
        catch (error) { if (error instanceof Error && error.message === sourceText("assessment-id-already-exists")) reason = sourceText("an-invoice-with-this-provider-reference-already-exists"); else throw error; }
      }
      if (invoiceId) {
        await con.query(`update public.integration_imports set status='assessed',invoice_id=$1,updated_at=now() where organization_id=$2 and id=$3`, [invoiceId, org, claim.id]);
        return "assessed";
      }
      await con.query(`update public.integration_imports set review_reason=$1,updated_at=now() where organization_id=$2 and id=$3`, [reason, org, claim.id]);
      await this.store.auditEvent(con, principal, `${record.id}@${record.revision}`, "IMPORT_NEEDS_REVIEW", sourceText("imported-invoice-needs-human-review"), reason!, "integration_import");
      return "needs_review";
    });
  }
}
