import { randomUUID } from "node:crypto";
import { z, ZodError } from "zod";
import type { Invoice } from "../../types";
import { DemoStore } from "../database/demo-store";
import { PgStore } from "../database/postgres-store";
import { IntakeStore } from "../invoices/intake-store";
import { PrivateInvoiceStorage } from "../invoices/private-storage";
import { readDocument, MAX_DOCUMENT_BYTES } from "../invoices/document";
import { reviewedInvoiceSchema } from "../invoices/extraction";
import { JiniusSync } from "../jinius/sync";
import { authenticateRequest } from "../auth/request";

export type ApiContext =
  | { mode: "sqlite"; demo: DemoStore }
  | { mode: "postgres"; pg: PgStore; intake: IntakeStore; storage: PrivateInvoiceStorage; jinius: JiniusSync; verifyToken(token: string): Promise<string>; aiEnabled: boolean };

const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });
const missing = () => json({ detail: "Not found" }, 404);
const uuid = z.uuid();
const isoDate = z.string().refine((value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value);
const assessmentInput = z.strictObject({ id: z.string().min(3).max(64).regex(/^[A-Za-z0-9_-]+$/), supplier_id: z.string().min(3).max(32), invoice_number: z.string().min(2).max(70), amount_cents: z.number().int().positive().max(100_000_000_000), creditor_account: z.string().min(4).max(64), invoice_date: isoDate });
const reviewInput = z.strictObject({ fields: reviewedInvoiceSchema, supplier_id: z.string().nullable(), create_new_supplier: z.boolean() });
const verifyInput = z.strictObject({ evidence_note: z.string().min(12).max(500) });
const invoiceOutput = z.object({ id: z.string(), supplier_id: z.string(), amount_cents: z.number().int(), risk: z.number().int().min(0).max(100), iban: z.string().startsWith("••••"), status: z.enum(["ready", "needs_review", "blocked", "hold", "approved"]), signals: z.array(z.object({ code: z.string(), explanation: z.string() })) }).passthrough();
const invoiceJson = (value: Invoice, status = 200) => json(invoiceOutput.parse(value), status);

function errorResponse(error: unknown, mode: ApiContext["mode"]): Response {
  if (error instanceof ZodError || error instanceof SyntaxError) return json({ detail: error instanceof ZodError ? error.issues.map((issue) => ({ msg: issue.message, loc: issue.path })) : "Malformed JSON" }, 422);
  const message = error instanceof Error ? error.message : "Request failed";
  const code = error instanceof Error && "code" in error ? String(error.code) : "";
  if (code === "23505") return json({ detail: "Record already exists" }, 409);
  if (code === "23503" || code === "22P02") return json({ detail: "Invalid reference" }, 422);
  if (/Authentication required|Invalid or expired access token/.test(message)) return json({ detail: message }, 401);
  if (/X-Organization-Id is required|Invalid organization ID/.test(message)) return json({ detail: message }, 400);
  if (/No organization membership|No membership in requested organization/.test(message)) return json({ detail: message }, 403);
  if (/Authentication service unavailable|Database unavailable|Private storage|Private document|CA certificate|PostgreSQL mode requires/.test(message)) return json({ detail: message }, 503);
  if (/limit reached|retry limit/.test(message)) return json({ detail: message }, 429);
  if (/not found|Unknown demo supplier|Supplier not found|Assessment not found/.test(message)) return json({ detail: message }, 404);
  if (/already exists|Idempotency key already used/.test(message)) return json({ detail: message }, 409);
  if (/Role|cannot independently|Maker-checker|needs independent verification|not ready|cannot be verified|cannot be placed|cannot be approved|unavailable in PostgreSQL mode|requires PostgreSQL mode/.test(message)) return json({ detail: message }, mode === "sqlite" ? 409 : 403);
  if (/Invalid|valid|must|Only|Select|Review|cannot|could not be read|unsupported|exceeds|outside|unknown|malformed/.test(message)) return json({ detail: message }, 422);
  console.error(`TrustPay API error: ${error instanceof Error ? error.constructor.name : "UnknownError"}`);
  return json({ detail: "Internal server error" }, 500);
}

async function uploadFile(request: Request): Promise<{ data: Buffer; contentType: string }> {
  const length = Number(request.headers.get("Content-Length") || 0);
  if (length > MAX_DOCUMENT_BYTES + 100_000) throw new Error("Invoice document exceeds the 10 MB limit");
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new Error("A file is required");
  if (file.size > MAX_DOCUMENT_BYTES) throw new Error("Invoice document exceeds the 10 MB limit");
  return { data: Buffer.from(await file.arrayBuffer()), contentType: file.type };
}

async function authorized(request: Request, context: Extract<ApiContext, { mode: "postgres" }>) {
  return authenticateRequest(request, { verifyToken: context.verifyToken, memberships: (userId) => context.pg.membershipRows(userId) });
}

export async function handleApiRequest(request: Request, segments: string[], context: ApiContext): Promise<Response> {
  try {
    const method = request.method;
    if (segments.length === 1 && segments[0] === "health" && method === "GET") {
      if (context.mode === "postgres") await context.pg.health();
      return json({ status: "ok", mode: context.mode === "postgres" ? "supabase-postgres" : "synthetic-local-demo", payment_initiation: false, jinius_connection: context.mode === "postgres" ? "disconnected" : "mock", risk_model: "auditable-rules-v1", invoice_reader: context.mode === "postgres" && context.aiEnabled ? "openai_vision" : "local_pdf_text" });
    }
    if (segments[0] !== "v1") return missing();
    const path = segments.slice(1);
    if (path.join("/") === "me/organizations" && method === "GET") {
      if (context.mode === "sqlite") return json([{ id: "asteria-demo", name: "Asteria synthetic demo", role: "demo" }]);
      const token = request.headers.get("Authorization");
      if (!token?.startsWith("Bearer ")) throw new Error("Authentication required");
      return json(await context.pg.memberships(await context.verifyToken(token.slice(7).trim())));
    }
    const principal = context.mode === "postgres" ? await authorized(request, context) : null;
    if (path.length === 1 && path[0] === "invoices" && method === "GET") return json(context.mode === "sqlite" ? context.demo.invoices().map((invoice) => invoiceOutput.parse(invoice)) : (await context.pg.invoices(principal!)).map((invoice) => invoiceOutput.parse(invoice)));
    if (path.join("/") === "invoices/assess" && method === "POST") {
      const input = assessmentInput.parse(await request.json());
      return invoiceJson(context.mode === "sqlite" ? context.demo.createAssessment(input) : await context.pg.createAssessment(input, principal!), 201);
    }
    if (path.length === 2 && path[0] === "invoices" && method === "GET") return invoiceJson(context.mode === "sqlite" ? context.demo.invoice(path[1]) : await context.pg.invoice(path[1], principal!));
    if (path.length >= 3 && path[0] === "invoices" && path[2] === "assessments" && method === "GET") {
      if (context.mode === "sqlite") return json({ detail: "Assessment history requires PostgreSQL mode" }, 404);
      const history = await context.pg.assessmentHistory(path[1], principal!);
      if (path.length === 3) return json(history);
      if (path.length === 4) return history.find((item) => item.id === uuid.parse(path[3])) ? json(history.find((item) => item.id === path[3])) : json({ detail: "Assessment not found" }, 404);
    }
    if (path.length === 3 && path[0] === "invoices" && ["verify", "approve", "hold"].includes(path[2]) && method === "POST") {
      const action = path[2] as "verify" | "approve" | "hold";
      const note = action === "verify" ? verifyInput.parse(await request.json()).evidence_note : "";
      return invoiceJson(context.mode === "sqlite" ? context.demo.transition(path[1], action, note) : await context.pg.transition(path[1], action, note, principal!));
    }
    if (path.length >= 3 && path[0] === "invoices" && path[2] === "documents") {
      if (context.mode === "sqlite") return method === "GET" && path.length === 3 ? json([]) : json({ detail: "Private document storage requires PostgreSQL mode" }, 403);
      if (path.length === 3 && method === "GET") return json(await context.pg.documentList(path[1], principal!));
      if (path.length === 3 && method === "POST") {
        if (!["owner", "admin", "analyst"].includes(principal!.role)) throw new Error("Role cannot upload invoice documents");
        await context.pg.invoice(path[1], principal!);
        const file = await uploadFile(request);
        const document = await readDocument(file.data, file.contentType);
        const id = randomUUID();
        const storagePath = `${principal!.organizationId}/${randomUUID()}/${id}${document.extension}`;
        await context.storage.upload(storagePath, file.contentType, file.data);
        try { await context.pg.recordDocument(path[1], id, storagePath, file.contentType, file.data.length, principal!); }
        catch (error) { await context.storage.remove(storagePath).catch(() => {}); throw error; }
        return json({ id, content_type: file.contentType, size_bytes: file.data.length }, 201);
      }
      if (path.length === 4 && method === "GET") {
        const record = await context.pg.documentPath(path[1], uuid.parse(path[3]), principal!);
        const data = await context.storage.download(record.storage_path);
        return new Response(new Uint8Array(data), { status: 200, headers: { ...headers, "Content-Type": record.content_type, "Content-Disposition": "attachment" } });
      }
    }
    if (path.join("/") === "suppliers" && method === "GET") return json(context.mode === "sqlite" ? context.demo.suppliers() : await context.pg.suppliers(principal!));
    if (path.join("/") === "audit" && method === "GET") return json(context.mode === "sqlite" ? context.demo.audit() : await context.pg.audit(principal!));
    if (path.join("/") === "integrations" && method === "GET") return json(context.mode === "sqlite" ? { jinius: { status: "mock", adapter: "DemoJiniusAdapter", source_label: "Synthetic Jinius demo", live_connected: false, sync_available: false, next_step: "Request authorized sandbox documentation and scopes from organizers" }, bank_payment: { status: "disabled", payment_initiation: false } } : await context.jinius.integrations(principal!));
    if (path.join("/") === "integrations/jinius/sync" && method === "POST") return context.mode === "sqlite" ? json({ detail: "Integration sync requires PostgreSQL mode" }, 403) : json(await context.jinius.run(principal!));
    if (path.join("/") === "demo/reset" && method === "POST") {
      if (context.mode === "postgres") return json({ detail: "Demo reset is unavailable in PostgreSQL mode" }, 403);
      context.demo.reset(); return json({ reset: true, warning: "Synthetic local demo only" });
    }
    if (path[0] === "invoice-intakes") {
      if (context.mode === "sqlite") return json({ detail: "Invoice intake requires PostgreSQL mode" }, method === "GET" ? 404 : 403);
      if (path.length === 1 && method === "POST") {
        const file = await uploadFile(request);
        return json(await context.intake.create(file.data, file.contentType, principal!, request.headers.get("Idempotency-Key")), 201);
      }
      if (path.length >= 2) {
        const id = uuid.parse(path[1]);
        if (path.length === 2 && method === "GET") return json(await context.intake.get(id, principal!));
        if (path.length === 2 && method === "PATCH") { const input = reviewInput.parse(await request.json()); return json(await context.intake.review(id, input.fields, input.supplier_id, input.create_new_supplier, principal!)); }
        if (path.length === 3 && path[2] === "extract" && method === "POST") return json(await context.intake.retry(id, principal!));
        if (path.length === 3 && path[2] === "analyze" && method === "POST") return invoiceJson(await context.intake.analyze(id, principal!));
        if (path.length === 3 && path[2] === "document" && method === "GET") {
          const file = await context.intake.document(id, principal!);
          return new Response(new Uint8Array(file.data), { status: 200, headers: { ...headers, "Content-Type": file.contentType, "Content-Disposition": "attachment" } });
        }
      }
    }
    return missing();
  } catch (error) { return errorResponse(error, context.mode); }
}
