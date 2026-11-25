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
import type { ExtractionResult } from "./extraction";
import { applyReviewedFields, minorUnits, universalDocumentSchema, validateUniversalDocument, type UniversalDocument } from "./universal";
import { PrivateInvoiceStorage } from "./private-storage";

type Reviewed = ReturnType<typeof reviewedInvoiceSchema.parse>;
type IntakeRow = { id: string; organization_id: string; uploaded_by: string; storage_path: string; content_type: string; size_bytes: number; sha256: string; status: InvoiceIntake["status"]; fields_encrypted: Buffer | null; uncertain_fields: string[]; extraction_method: InvoiceIntake["method"]; error_code: string | null; extraction_attempts: number; explanation: string | null; explanation_method: InvoiceIntake["explanation_method"]; invoice_public_id: string | null; created_at: Date | string };
const sourceExtensions: Record<string, string> = { "application/pdf": ".pdf", "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp" };
const writable = (principal: Principal) => { if (!["owner", "admin", "analyst"].includes(principal.role)) throw new Error("Role cannot review invoice intakes"); };
function correctedPaths(before: unknown, after: unknown, prefix = ""): string[] {
  if (before === after) return [];
  if (typeof before !== "object" || before === null || typeof after !== "object" || after === null) return [prefix];
  if ("value" in before && "value" in after) return before.value === after.value ? [] : [prefix];
  const left = before as Record<string, unknown>;
  const right = after as Record<string, unknown>;
  return [...new Set([...Object.keys(left), ...Object.keys(right)])].flatMap((key) => correctedPaths(left[key], right[key], prefix ? `${prefix}.${key}` : key));
}

export class IntakeStore {
  private readonly activeExtractions = new Map<string, Promise<ExtractionResult>>();
  constructor(private readonly pool: ConnectionPool, private readonly store: PgStore, private readonly storage: PrivateInvoiceStorage, private readonly provider: OpenAIInvoiceProvider | null) {}
  private async extractCached(data: Buffer, contentType: string, organizationId: string, digest: string): Promise<ExtractionResult> {
    const key = `${organizationId}:${digest}`;
    const running = this.activeExtractions.get(key);
    if (running) return running;
    const pending = (async () => {
      const cached = await this.read(async (con) => (await con.query(`select id,fields_encrypted,uncertain_fields,extraction_method from public.invoice_intakes where organization_id=$1 and sha256=$2 and extraction_method='openai_vision' and fields_encrypted is not null order by created_at desc limit 1`, [organizationId, digest])).rows[0] as Pick<IntakeRow, "id" | "fields_encrypted" | "uncertain_fields" | "extraction_method"> | undefined);
      if (cached?.fields_encrypted) {
        const payload = this.store.protector.draftCipher().open(cached.fields_encrypted, organizationId, cached.id);
        if (payload.document) return { fields: (payload.original_fields ?? payload.fields) as InvoiceIntake["fields"], uncertain_fields: cached.uncertain_fields, method: "openai_vision" as const, status: "needs_review" as const, error_code: null, document: payload.document as ExtractionResult["document"], findings: payload.findings as ExtractionResult["findings"], page_count: payload.page_count as number, usage: { input_tokens: 0, output_tokens: 0 } };
      }
      return extractInvoice(data, contentType, this.provider);
    })();
    this.activeExtractions.set(key, pending);
    try { return await pending; } finally { this.activeExtractions.delete(key); }
  }
  private async read<T>(work: (con: QueryConnection) => Promise<T>): Promise<T> {
    const con = await this.pool.connect();
    try { return await work(con); } finally { con.release(); }
  }
  private async row(con: QueryConnection, id: string, principal: Principal, lock = false): Promise<IntakeRow> {
    const row = (await con.query(`select t.*,i.public_id as invoice_public_id from public.invoice_intakes t left join public.invoices i on i.organization_id=t.organization_id and i.id=t.invoice_id where t.organization_id=$1 and t.id=$2 ${lock ? "for update of t" : ""}`, [principal.organizationId, id])).rows[0] as IntakeRow | undefined;
    if (!row) throw new Error("Invoice intake not found");
    return row;
  }
  private present(row: IntakeRow): InvoiceIntake {
    const payload = row.fields_encrypted ? this.store.protector.draftCipher().open(row.fields_encrypted, row.organization_id, row.id) : {};
    const usage = (payload.usage as InvoiceIntake["usage"]) ?? null;
    const inputRate = Number(process.env.TRUSTPAY_AI_INPUT_USD_PER_M);
    const outputRate = Number(process.env.TRUSTPAY_AI_OUTPUT_USD_PER_M);
    const estimatedCost = usage && Number.isFinite(inputRate) && Number.isFinite(outputRate) && inputRate >= 0 && outputRate >= 0 && process.env.TRUSTPAY_AI_INPUT_USD_PER_M && process.env.TRUSTPAY_AI_OUTPUT_USD_PER_M ? (usage.input_tokens * inputRate + usage.output_tokens * outputRate) / 1_000_000 : null;
    return { id: row.id, status: row.status, fields: (payload.fields ?? {}) as InvoiceIntake["fields"], original_fields: (payload.original_fields ?? payload.fields ?? {}) as InvoiceIntake["fields"], document: (payload.document as InvoiceIntake["document"]) ?? null, reviewed_document: (payload.reviewed_document as InvoiceIntake["reviewed_document"]) ?? null, classification_override_reason: (payload.classification_override_reason as string | null) ?? null, single_invoice_confirmed: Boolean(payload.single_invoice_confirmed), findings: (payload.reviewed_findings ?? payload.findings ?? []) as InvoiceIntake["findings"], usage, estimated_cost_usd: estimatedCost, page_count: (payload.page_count as number) ?? 1, supplier_id: (payload.supplier_id as string | null) ?? null, create_new_supplier: Boolean(payload.create_new_supplier), uncertain_fields: row.uncertain_fields, method: row.extraction_method, error_code: row.error_code, extraction_attempts: row.extraction_attempts, explanation: row.explanation, explanation_method: row.explanation_method, invoice_id: row.invoice_public_id, content_type: row.content_type, size_bytes: row.size_bytes, created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at };
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
    if (idempotencyKey && !/^[A-Za-z0-9._-]{8,128}$/.test(idempotencyKey)) throw new Error("Idempotency-Key must be 8–128 safe characters");
    const digest = createHash("sha256").update(data).digest("hex");
    if (idempotencyKey) {
      const existing = await this.read(async (con) => (await con.query(`select id,sha256 from public.invoice_intakes where organization_id=$1 and uploaded_by=$2 and idempotency_key=$3`, [principal.organizationId, principal.userId, idempotencyKey])).rows[0]);
      if (existing) {
        if (existing.sha256.trim() !== digest) throw new Error("Idempotency key already used for a different document");
        return this.get(existing.id, principal);
      }
    }
    if (await this.read((con) => this.recent(con, principal)) >= 20) throw new Error("Hourly invoice intake limit reached");
    const result = await this.extractCached(data, contentType, principal.organizationId, digest);
    const id = randomUUID();
    const path = `${principal.organizationId}/${id}/${randomUUID()}${sourceExtensions[contentType]}`;
    const encrypted = this.store.protector.draftCipher().seal({ fields: result.fields, original_fields: result.fields, document: result.document, findings: result.findings, page_count: result.page_count, usage: result.usage }, principal.organizationId, id);
    let uploaded = false;
    try {
      await transaction(this.pool, async (con) => {
        await con.query(`select pg_advisory_xact_lock(hashtextextended($1::text,0))`, [`intake:${principal.organizationId}:${principal.userId}`]);
        if (await this.recent(con, principal) >= 20) throw new Error("Hourly invoice intake limit reached");
        await con.query(`insert into public.invoice_intakes (id,organization_id,uploaded_by,storage_path,content_type,size_bytes,sha256,idempotency_key,status,fields_encrypted,uncertain_fields,extraction_method,error_code) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13)`, [id, principal.organizationId, principal.userId, path, contentType, data.length, digest, idempotencyKey, result.status, encrypted, JSON.stringify(result.uncertain_fields), result.method, result.error_code]);
        await this.storage.upload(path, contentType, data);
        uploaded = true;
        await this.audit(con, principal, id, "INTAKE_UPLOADED", "Private invoice uploaded for human review");
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
    if (!["provider_unavailable", "needs_review"].includes(previous.status)) throw new Error("This intake cannot be re-extracted");
    if (previous.extraction_attempts >= 3) throw new Error("Invoice extraction retry limit reached");
    const data = await this.storage.download(previous.storage_path);
    const result = await extractInvoice(data, previous.content_type, this.provider);
    const encrypted = this.store.protector.draftCipher().seal({ fields: result.fields, original_fields: result.fields, document: result.document, findings: result.findings, page_count: result.page_count, usage: result.usage }, principal.organizationId, id);
    await transaction(this.pool, async (con) => {
      const current = await this.row(con, id, principal, true);
      if (!["provider_unavailable", "needs_review"].includes(current.status)) throw new Error("This intake has already been reviewed");
      if (current.extraction_attempts >= 3) throw new Error("Invoice extraction retry limit reached");
      await con.query(`update public.invoice_intakes set status=$1,fields_encrypted=$2,uncertain_fields=$3::jsonb,extraction_method=$4,error_code=$5,extraction_attempts=extraction_attempts+1,updated_at=now() where organization_id=$6 and id=$7`, [result.status, encrypted, JSON.stringify(result.uncertain_fields), result.method, result.error_code, principal.organizationId, id]);
      await this.audit(con, principal, id, "INTAKE_REEXTRACTED", "Invoice extraction retried");
    });
    return this.get(id, principal);
  }
  async review(id: string, fields: Reviewed, supplierId: string | null, createNewSupplier: boolean, principal: Principal, reviewedDocument?: UniversalDocument | null, classificationReason?: string | null, singleInvoiceConfirmed = false): Promise<InvoiceIntake> {
    writable(principal);
    const reviewed = reviewedInvoiceSchema.parse(fields);
    const verifiedDocument = reviewedDocument ? applyReviewedFields(universalDocumentSchema.parse(reviewedDocument), reviewed) : null;
    if (verifiedDocument) {
      const payable = verifiedDocument.financial.outstanding_balance.value ?? verifiedDocument.financial.gross_total.value;
      if (payable && minorUnits(payable) !== minorUnits(reviewed.total_amount)) throw new Error("Payable amount must match the reviewed gross total or outstanding balance");
    }
    if (supplierId && createNewSupplier || !supplierId && !createNewSupplier) throw new Error("Select an existing supplier or confirm a new one");
    await transaction(this.pool, async (con) => {
      const row = await this.row(con, id, principal, true);
      if (row.status === "analyzed") throw new Error("Analyzed intake cannot be changed");
      if (supplierId && !(await con.query(`select 1 from public.suppliers where organization_id=$1 and public_id=$2`, [principal.organizationId, supplierId])).rows[0]) throw new Error("Supplier not found");
      const previous = row.fields_encrypted ? this.store.protector.draftCipher().open(row.fields_encrypted, principal.organizationId, id) : {};
      const originalDocument = previous.document as UniversalDocument | undefined;
      const classificationChanged = Boolean(originalDocument && verifiedDocument && originalDocument.document_type !== verifiedDocument.document_type);
      const multipleCleared = Boolean(originalDocument?.multiple_invoices && verifiedDocument && !verifiedDocument.multiple_invoices);
      if ((classificationChanged || multipleCleared) && (!classificationReason || classificationReason.trim().length < 20 || classificationReason.length > 500)) throw new Error("Give a 20–500 character reason for changing document classification");
      if (multipleCleared && !singleInvoiceConfirmed) throw new Error("Confirm that every page contains exactly one invoice before resolving a multi-invoice flag");
      const oldFields = (previous.fields ?? {}) as InvoiceIntake["fields"];
      const changed = Object.keys(reviewed).filter((key) => reviewed[key as keyof Reviewed] !== oldFields[key as keyof Reviewed]);
      if (verifiedDocument && previous.document) changed.push(...correctedPaths(previous.reviewed_document ?? previous.document, verifiedDocument).filter(Boolean));
      const encrypted = this.store.protector.draftCipher().seal({ ...previous, fields: reviewed, original_fields: previous.original_fields ?? previous.fields, reviewed_document: verifiedDocument, reviewed_findings: verifiedDocument ? validateUniversalDocument(verifiedDocument) : previous.findings, classification_override_reason: classificationChanged || multipleCleared ? classificationReason?.trim() : null, single_invoice_confirmed: multipleCleared && singleInvoiceConfirmed, supplier_id: supplierId, create_new_supplier: createNewSupplier }, principal.organizationId, id);
      await con.query(`update public.invoice_intakes set status='reviewed',fields_encrypted=$1,uncertain_fields='[]'::jsonb,error_code=null,updated_at=now() where organization_id=$2 and id=$3`, [encrypted, principal.organizationId, id]);
      await this.audit(con, principal, id, "INTAKE_REVIEWED", changed.length ? `Reviewer corrected fields: ${[...new Set(changed)].slice(0, 50).join(", ")}` : "Extracted fields confirmed by reviewer");
      if (classificationChanged || multipleCleared) await this.audit(con, principal, id, "INTAKE_CLASSIFICATION_OVERRIDDEN", "Reviewer documented a classification override in the encrypted intake");
    });
    return this.get(id, principal);
  }
  async analyze(id: string, principal: Principal): Promise<Invoice> {
    writable(principal);
    const publicId = `UPL-${id.replaceAll("-", "").slice(0, 16).toUpperCase()}`;
    const result = await transaction(this.pool, async (con) => {
      const row = await this.row(con, id, principal, true);
      if (row.status === "analyzed") return null;
      if (row.status !== "reviewed" || !row.fields_encrypted) throw new Error("Review all required invoice fields before analysis");
      const payload = this.store.protector.draftCipher().open(row.fields_encrypted, principal.organizationId, id);
      const originalDocument = payload.document as InvoiceIntake["document"];
      const document = (payload.reviewed_document ?? payload.document) as InvoiceIntake["document"];
      if (originalDocument && document && (originalDocument.document_type !== document.document_type || originalDocument.multiple_invoices && !document.multiple_invoices) && !payload.classification_override_reason) throw new Error("Document classification override requires documented review");
      if (originalDocument?.multiple_invoices && document && !document.multiple_invoices && !payload.single_invoice_confirmed) throw new Error("Multi-invoice document requires explicit single-invoice confirmation");
      if (document && (!["invoice", "commercial_invoice", "electronic_invoice"].includes(document.document_type) || document.multiple_invoices)) throw new Error("Document classification requires separate invoice review before analysis");
      const fields = reviewedInvoiceSchema.parse(payload.fields);
      if (!fields.iban) throw new Error("A reviewed payment IBAN is required before risk analysis");
      if (fields.currency !== "EUR") throw new Error("Only EUR assessments are supported");
      let supplierId = payload.supplier_id as string | null;
      let supplier = supplierId ? (await con.query(`select id from public.suppliers where organization_id=$1 and public_id=$2`, [principal.organizationId, supplierId])).rows[0] : null;
      if (!supplier && payload.create_new_supplier) {
        supplierId = `NEW-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
        supplier = (await con.query(`insert into public.suppliers (organization_id,public_id,name,registration_number,vat_number,status) values ($1,$2,$3,$4,$5,'review') returning id`, [principal.organizationId, supplierId, fields.supplier_name, fields.registration_number, fields.vat_number])).rows[0];
      }
      if (!supplier) throw new Error("Supplier not found");
      const [whole, fraction = ""] = fields.total_amount.split(".");
      const amountCents = Number(BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0")));
      const invoiceId = await this.store.recordAssessment(con, { id: publicId, supplier_id: supplierId ?? "", invoice_number: fields.invoice_number, amount_cents: amountCents, creditor_account: fields.iban, invoice_date: fields.invoice_date, due_date: fields.due_date }, principal, supplier.id, "uploaded");
      const documentId = row.storage_path.split("/").at(-1)!.split(".")[0];
      await con.query(`insert into public.invoice_documents (id,organization_id,invoice_id,storage_path,content_type,size_bytes,uploaded_by) values ($1,$2,$3,$4,$5,$6,$7) on conflict (storage_path) do nothing`, [documentId, principal.organizationId, invoiceId, row.storage_path, row.content_type, row.size_bytes, row.uploaded_by]);
      const policy = (await con.query(`select explanation from public.risk_assessments where organization_id=$1 and invoice_id=$2 order by assessed_at desc,id desc limit 1`, [principal.organizationId, invoiceId])).rows[0];
      await con.query(`update public.invoice_intakes set status='analyzed',invoice_id=$1,explanation=$2,explanation_method='verified_policy',updated_at=now() where organization_id=$3 and id=$4`, [invoiceId, policy.explanation, principal.organizationId, id]);
      await this.audit(con, principal, id, "INTAKE_ANALYZED", "Reviewed invoice analyzed by policy engine");
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
