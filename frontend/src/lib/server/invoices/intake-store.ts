import { sourceText } from "../../i18n/core";
import type { IdentityValues } from "../fraud/risk";
import { createHash, randomUUID } from "node:crypto";
import type { Invoice } from "../../types";
import type { InvoiceIntake } from "../../intake";
import type { Principal } from "../approvals/policy";
import { ProviderUnavailable, type OpenAIInvoiceProvider } from "../ai/provider";
import { PgStore } from "../database/postgres-store";
import { transaction, type ConnectionPool, type QueryConnection } from "../database/postgres";
import { extractInvoice } from "./extract-invoice";
import { readDocument } from "./document";
import { reviewedInvoiceSchema } from "./extraction";
import { PrivateInvoiceStorage } from "./private-storage";

type Reviewed = ReturnType<typeof reviewedInvoiceSchema.parse>;
type IntakeRow = { id: string; organization_id: string; uploaded_by: string; storage_path: string; content_type: string; size_bytes: number; sha256: string; status: InvoiceIntake["status"]; fields_encrypted: Buffer | null; uncertain_fields: string[]; extraction_method: InvoiceIntake["method"]; error_code: string | null; extraction_attempts: number; explanation: string | null; explanation_method: InvoiceIntake["explanation_method"]; invoice_public_id: string | null; created_at: Date | string };
const sourceExtensions: Record<string, string> = { "application/pdf": ".pdf", "image/png": ".png", "image/jpeg": ".jpg" };
const writable = (principal: Principal) => { if (!["owner", "admin", "analyst"].includes(principal.role)) throw new Error(sourceText("role-cannot-review-invoice-intakes")); };

export class IntakeStore {
  constructor(private readonly pool: ConnectionPool, private readonly store: PgStore, private readonly storage: PrivateInvoiceStorage, private readonly provider: OpenAIInvoiceProvider | null) {}
  private async read<T>(work: (con: QueryConnection) => Promise<T>): Promise<T> {
    const con = await this.pool.connect();
    try { return await work(con); } finally { con.release(); }
  }
  private async row(con: QueryConnection, id: string, principal: Principal, lock = false): Promise<IntakeRow> {
    const row = (await con.query(`select t.*,i.public_id as invoice_public_id from public.invoice_intakes t left join public.invoices i on i.organization_id=t.organization_id and i.id=t.invoice_id where t.organization_id=$1 and t.id=$2 ${lock ? "for update of t" : ""}`, [principal.organizationId, id])).rows[0] as IntakeRow | undefined;
    if (!row) throw new Error(sourceText("invoice-intake-not-found"));
    return row;
  }
  private present(row: IntakeRow): InvoiceIntake {
    const payload = row.fields_encrypted ? this.store.protector.draftCipher().open(row.fields_encrypted, row.organization_id, row.id) : {};
    return { id: row.id, status: row.status, fields: (payload.fields ?? {}) as InvoiceIntake["fields"], supplier_id: (payload.supplier_id as string | null) ?? null, create_new_supplier: Boolean(payload.create_new_supplier), uncertain_fields: row.uncertain_fields, method: row.extraction_method, error_code: row.error_code, extraction_attempts: row.extraction_attempts, explanation: row.explanation, explanation_method: row.explanation_method, invoice_id: row.invoice_public_id, content_type: row.content_type, size_bytes: row.size_bytes, created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at };
  }
  async get(id: string, principal: Principal): Promise<InvoiceIntake> { return this.read(async (con) => this.present(await this.row(con, id, principal))); }
  private async audit(con: QueryConnection, principal: Principal, id: string, action: string, detail: string): Promise<void> {
    await this.store.auditEvent(con, principal, id, action, action.replaceAll("_", " ").toLowerCase(), detail, "invoice_intake");
  }
  private async recent(con: QueryConnection, principal: Principal): Promise<number> {
    const row = (await con.query(`select count(*)::int as total from public.invoice_intakes where organization_id=$1 and uploaded_by=$2 and created_at > now() - interval '1 hour'`, [principal.organizationId, principal.userId])).rows[0];
    return row.total;
  }
  async create(data: Buffer, contentType: string, principal: Principal, idempotencyKey: string | null): Promise<InvoiceIntake> {
    writable(principal);
    await readDocument(data, contentType);
    if (idempotencyKey && !/^[A-Za-z0-9._-]{8,128}$/.test(idempotencyKey)) throw new Error(sourceText("idempotency-key-must-be-8-128-safe-characters"));
    const digest = createHash("sha256").update(data).digest("hex");
    if (idempotencyKey) {
      const existing = await this.read(async (con) => (await con.query(`select id,sha256 from public.invoice_intakes where organization_id=$1 and uploaded_by=$2 and idempotency_key=$3`, [principal.organizationId, principal.userId, idempotencyKey])).rows[0]);
      if (existing) {
        if (existing.sha256.trim() !== digest) throw new Error(sourceText("idempotency-key-already-used-for-a-different-document"));
        return this.get(existing.id, principal);
      }
    }
    if (await this.read((con) => this.recent(con, principal)) >= 20) throw new Error(sourceText("hourly-invoice-intake-limit-reached"));
    const result = await extractInvoice(data, contentType, this.provider);
    const id = randomUUID();
    const path = `${principal.organizationId}/${id}/${randomUUID()}${sourceExtensions[contentType]}`;
    const encrypted = this.store.protector.draftCipher().seal({ fields: result.fields }, principal.organizationId, id);
    let uploaded = false;
    try {
      await transaction(this.pool, async (con) => {
        await con.query(`select pg_advisory_xact_lock(hashtextextended($1::text,0))`, [`intake:${principal.organizationId}:${principal.userId}`]);
        if (await this.recent(con, principal) >= 20) throw new Error(sourceText("hourly-invoice-intake-limit-reached"));
        await con.query(`insert into public.invoice_intakes (id,organization_id,uploaded_by,storage_path,content_type,size_bytes,sha256,idempotency_key,status,fields_encrypted,uncertain_fields,extraction_method,error_code) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13)`, [id, principal.organizationId, principal.userId, path, contentType, data.length, digest, idempotencyKey, result.status, encrypted, JSON.stringify(result.uncertain_fields), result.method, result.error_code]);
        await this.storage.upload(path, contentType, data);
        uploaded = true;
        await this.audit(con, principal, id, "INTAKE_UPLOADED", sourceText("private-invoice-uploaded-for-human-review"));
      });
    } catch (error) {
      if (uploaded) await this.storage.remove(path).catch(() => {});
      throw error;
    }
    return this.get(id, principal);
  }
  async retry(id: string, principal: Principal): Promise<InvoiceIntake> {
    writable(principal);
    const previous = await this.read((con) => this.row(con, id, principal));
    if (!["provider_unavailable", "needs_review"].includes(previous.status)) throw new Error(sourceText("this-intake-cannot-be-re-extracted"));
    if (previous.extraction_attempts >= 3) throw new Error(sourceText("invoice-extraction-retry-limit-reached"));
    const data = await this.storage.download(previous.storage_path);
    const result = await extractInvoice(data, previous.content_type, this.provider);
    const encrypted = this.store.protector.draftCipher().seal({ fields: result.fields }, principal.organizationId, id);
    await transaction(this.pool, async (con) => {
      const current = await this.row(con, id, principal, true);
      if (!["provider_unavailable", "needs_review"].includes(current.status)) throw new Error(sourceText("this-intake-has-already-been-reviewed"));
      if (current.extraction_attempts >= 3) throw new Error(sourceText("invoice-extraction-retry-limit-reached"));
      await con.query(`update public.invoice_intakes set status=$1,fields_encrypted=$2,uncertain_fields=$3::jsonb,extraction_method=$4,error_code=$5,extraction_attempts=extraction_attempts+1,updated_at=now() where organization_id=$6 and id=$7`, [result.status, encrypted, JSON.stringify(result.uncertain_fields), result.method, result.error_code, principal.organizationId, id]);
      await this.audit(con, principal, id, "INTAKE_REEXTRACTED", sourceText("invoice-extraction-retried"));
    });
    return this.get(id, principal);
  }
  async review(id: string, fields: Reviewed, supplierId: string | null, createNewSupplier: boolean, principal: Principal): Promise<InvoiceIntake> {
    writable(principal);
    const reviewed = reviewedInvoiceSchema.parse(fields);
    if (supplierId && createNewSupplier || !supplierId && !createNewSupplier) throw new Error(sourceText("select-an-existing-supplier-or-confirm-a-new"));
    await transaction(this.pool, async (con) => {
      const row = await this.row(con, id, principal, true);
      if (row.status === "analyzed") throw new Error(sourceText("analyzed-intake-cannot-be-changed"));
      // Keep what the document itself said about the supplier, so a reviewer's edit cannot erase an identity mismatch.
      const previous = row.fields_encrypted ? this.store.protector.draftCipher().open(row.fields_encrypted, principal.organizationId, id) : null;
      const source = (previous?.extracted_identity ?? previous?.fields ?? {}) as Record<string, string | null | undefined>;
      const extractedIdentity = { supplier_name: source.supplier_name ?? null, vat_number: source.vat_number ?? null, registration_number: source.registration_number ?? null };
      const encrypted = this.store.protector.draftCipher().seal({ fields: reviewed, supplier_id: supplierId, create_new_supplier: createNewSupplier, extracted_identity: extractedIdentity }, principal.organizationId, id);
      if (supplierId && !(await con.query(`select 1 from public.suppliers where organization_id=$1 and public_id=$2`, [principal.organizationId, supplierId])).rows[0]) throw new Error(sourceText("supplier-not-found"));
      await con.query(`update public.invoice_intakes set status='reviewed',fields_encrypted=$1,uncertain_fields='[]'::jsonb,error_code=null,updated_at=now() where organization_id=$2 and id=$3`, [encrypted, principal.organizationId, id]);
      await this.audit(con, principal, id, "INTAKE_REVIEWED", sourceText("extracted-fields-confirmed-by-reviewer"));
    });
    return this.get(id, principal);
  }
  async analyze(id: string, principal: Principal): Promise<Invoice> {
    writable(principal);
    const publicId = `UPL-${id.replaceAll("-", "").slice(0, 16).toUpperCase()}`;
    const result = await transaction(this.pool, async (con) => {
      const row = await this.row(con, id, principal, true);
      if (row.status === "analyzed") return null;
      if (row.status !== "reviewed" || !row.fields_encrypted) throw new Error(sourceText("review-all-required-invoice-fields-before-analysis"));
      const payload = this.store.protector.draftCipher().open(row.fields_encrypted, principal.organizationId, id);
      const fields = reviewedInvoiceSchema.parse(payload.fields);
      if (fields.currency !== "EUR") throw new Error(sourceText("only-eur-assessments-are-supported"));
      let supplierId = payload.supplier_id as string | null;
      let supplier = supplierId ? (await con.query(`select id from public.suppliers where organization_id=$1 and public_id=$2`, [principal.organizationId, supplierId])).rows[0] : null;
      if (!supplier && payload.create_new_supplier) {
        supplierId = `NEW-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
        supplier = (await con.query(`insert into public.suppliers (organization_id,public_id,name,registration_number,vat_number,status) values ($1,$2,$3,$4,$5,'review') returning id`, [principal.organizationId, supplierId, fields.supplier_name, fields.registration_number, fields.vat_number])).rows[0];
      }
      if (!supplier) throw new Error(sourceText("supplier-not-found"));
      const [whole, fraction = ""] = fields.total_amount.split(".");
      const amountCents = Number(BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0")));
      const invoiceId = await this.store.recordAssessment(con, { id: publicId, supplier_id: supplierId ?? "", invoice_number: fields.invoice_number, amount_cents: amountCents, creditor_account: fields.iban, invoice_date: fields.invoice_date, due_date: fields.due_date, supplier_name: fields.supplier_name, vat_number: fields.vat_number, registration_number: fields.registration_number, extracted_identity: payload.extracted_identity as IdentityValues | undefined }, principal, supplier.id, "uploaded");
      const documentId = row.storage_path.split("/").at(-1)!.split(".")[0];
      await con.query(`insert into public.invoice_documents (id,organization_id,invoice_id,storage_path,content_type,size_bytes,uploaded_by) values ($1,$2,$3,$4,$5,$6,$7) on conflict (storage_path) do nothing`, [documentId, principal.organizationId, invoiceId, row.storage_path, row.content_type, row.size_bytes, row.uploaded_by]);
      const policy = (await con.query(`select explanation from public.risk_assessments where organization_id=$1 and invoice_id=$2 order by assessed_at desc,id desc limit 1`, [principal.organizationId, invoiceId])).rows[0];
      await con.query(`update public.invoice_intakes set status='analyzed',invoice_id=$1,explanation=$2,explanation_method='verified_policy',updated_at=now() where organization_id=$3 and id=$4`, [invoiceId, policy.explanation, principal.organizationId, id]);
      await this.audit(con, principal, id, "INTAKE_ANALYZED", sourceText("reviewed-invoice-analyzed-by-policy-engine"));
      return invoiceId;
    });
    const invoice = await this.store.invoice(publicId, principal);
    if (result && this.provider) {
      try {
        const explanation = await this.provider.explain({ risk_score: invoice.risk, risk_level: invoice.level, historical_payment_count: invoice.history, current_account: invoice.iban, previous_account: invoice.previous, signals: invoice.signals.map((signal) => signal.code) });
        await transaction(this.pool, async (con) => { await con.query(`update public.invoice_intakes set explanation=$1,explanation_method='openai_summary',updated_at=now() where organization_id=$2 and id=$3 and status='analyzed'`, [explanation, principal.organizationId, id]); });
        return this.store.invoice(publicId, principal);
      } catch (error) { if (!(error instanceof ProviderUnavailable)) throw error; }
    }
    return invoice;
  }
  async document(id: string, principal: Principal): Promise<{ data: Buffer; contentType: string }> {
    const row = await this.read((con) => this.row(con, id, principal));
    return { data: await this.storage.download(row.storage_path), contentType: row.content_type };
  }
}
