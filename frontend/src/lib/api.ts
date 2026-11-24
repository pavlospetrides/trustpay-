import type { AssessmentInput, AuditEvent, Health, Integrations, Invoice, Supplier, SyncRun } from "./types";
import type { AssessmentHistory, InvoiceDraftFields, InvoiceIntake } from "./intake";
import { authConfigured, organizationStorageKey, supabaseBrowser } from "./supabase";
export class ApiError extends Error { constructor(message:string, public status:number) { super(message); } }
async function authHeaders(body?: BodyInit | null):Promise<Record<string,string>> {
  const headers: Record<string,string> = body instanceof FormData ? {} : {"Content-Type":"application/json"};
  if (authConfigured) {
    const { data, error } = await supabaseBrowser().auth.getSession();
    if (error || !data.session) throw new ApiError("Sign in to continue.", 401);
    headers.Authorization = `Bearer ${data.session.access_token}`;
    const organizationId = localStorage.getItem(organizationStorageKey);
    if (organizationId) headers["X-Organization-Id"] = organizationId;
  }
  return headers;
}
async function rawRequest(path:string, init?:RequestInit):Promise<Response> {
  let response:Response;
  const headers = await authHeaders(init?.body);
  try { response = await fetch(`/api${path}`, { cache:"no-store", ...init, headers:{...headers, ...init?.headers} }); }
  catch { throw new ApiError("Cannot reach the TrustPay API. Check the npm run dev terminal for FastAPI errors, then retry.", 0); }
  if (!response.ok) { const data = await response.json().catch(() => ({})); const detail = data.detail; throw new ApiError(typeof detail === "string" ? detail : Array.isArray(detail) ? detail.map((item:{msg?:string})=>item.msg).join("; ") : `Request failed (${response.status})`, response.status); }
  return response;
}
// Identical GETs already in flight (same user, organization and path) share one request.
// Nothing is kept after the response arrives, so data is never stale.
const inflight = new Map<string, Promise<unknown>>();
async function request<T>(path:string, init?:RequestInit):Promise<T> {
  if (init?.method && init.method !== "GET") return (await rawRequest(path, init)).json() as Promise<T>;
  const headers = await authHeaders();
  const key = `${headers.Authorization ?? ""}|${headers["X-Organization-Id"] ?? ""}|${path}`;
  let pending = inflight.get(key) as Promise<T> | undefined;
  if (!pending) {
    pending = rawRequest(path, init).then((response) => response.json() as Promise<T>).finally(() => inflight.delete(key));
    inflight.set(key, pending);
  }
  return pending;
}
// The signed-in user's memberships, remembered per access token for this tab (a new sign-in or reload refreshes it).
const memberships = new Map<string, Promise<{id:string;name:string;role:string}[]>>();
async function organizations() {
  const token = (await authHeaders()).Authorization ?? "";
  let cached = memberships.get(token);
  if (!cached) {
    cached = request<{id:string;name:string;role:string}[]>("/v1/me/organizations");
    memberships.set(token, cached);
    cached.catch(() => memberships.delete(token));
  }
  return cached;
}
const post = <T>(path:string, body?:unknown) => request<T>(path,{method:"POST",body:body ? JSON.stringify(body) : undefined});
export const api = {
  health:()=>request<Health>("/health"), invoices:()=>request<Invoice[]>("/v1/invoices"), invoice:(id:string)=>request<Invoice>(`/v1/invoices/${encodeURIComponent(id)}`),
  organizations,
  uploadIntake:(file:File,key:string)=>{const form=new FormData();form.set("file",file);return request<InvoiceIntake>("/v1/invoice-intakes",{method:"POST",body:form,headers:{"Idempotency-Key":key}});},
  intake:(id:string)=>request<InvoiceIntake>(`/v1/invoice-intakes/${encodeURIComponent(id)}`),
  retryIntake:(id:string)=>post<InvoiceIntake>(`/v1/invoice-intakes/${encodeURIComponent(id)}/extract`),
  reviewIntake:(id:string,fields:InvoiceDraftFields,supplierId:string|null,createNewSupplier:boolean)=>request<InvoiceIntake>(`/v1/invoice-intakes/${encodeURIComponent(id)}`,{method:"PATCH",body:JSON.stringify({fields,supplier_id:supplierId,create_new_supplier:createNewSupplier})}),
  analyzeIntake:(id:string)=>post<Invoice>(`/v1/invoice-intakes/${encodeURIComponent(id)}/analyze`),
  intakeDocument:async(id:string)=>{const response=await rawRequest(`/v1/invoice-intakes/${encodeURIComponent(id)}/document`);return response.blob();},
  assessments:(id:string)=>request<AssessmentHistory[]>(`/v1/invoices/${encodeURIComponent(id)}/assessments`),
  documents:(id:string)=>request<{id:string;content_type:string;size_bytes:number;created_at:string}[]>(`/v1/invoices/${encodeURIComponent(id)}/documents`),
  uploadDocument:(id:string,file:File)=>{const form=new FormData();form.set("file",file);return request<{id:string}>(`/v1/invoices/${encodeURIComponent(id)}/documents`,{method:"POST",body:form});},
  downloadDocument:async(id:string,documentId:string)=>{const response=await rawRequest(`/v1/invoices/${encodeURIComponent(id)}/documents/${encodeURIComponent(documentId)}`);return response.blob();},
  suppliers:()=>request<Supplier[]>("/v1/suppliers"), audit:()=>request<AuditEvent[]>("/v1/audit"), integrations:()=>request<Integrations>("/v1/integrations"), syncJinius:()=>post<SyncRun>("/v1/integrations/jinius/sync"), resolveImport:(externalId:string,revision:string,supplierId:string)=>post<Invoice>(`/v1/integrations/jinius/imports/${encodeURIComponent(externalId)}/${encodeURIComponent(revision)}/resolve`,{supplier_id:supplierId}),
  assess:(body:AssessmentInput)=>post<Invoice>("/v1/invoices/assess",body), verify:(id:string,note:string)=>post<Invoice>(`/v1/invoices/${encodeURIComponent(id)}/verify`,{evidence_note:note}),
  approve:(id:string)=>post<Invoice>(`/v1/invoices/${encodeURIComponent(id)}/approve`), hold:(id:string)=>post<Invoice>(`/v1/invoices/${encodeURIComponent(id)}/hold`), reset:()=>post<{reset:boolean}>("/v1/demo/reset")
};
export const euro = (cents:number) => new Intl.NumberFormat("en-IE",{style:"currency",currency:"EUR"}).format(cents/100);
export const date = (value:string) => new Intl.DateTimeFormat("en-GB",{day:"numeric",month:"short",year:"numeric"}).format(new Date(`${value.slice(0,10)}T12:00:00`));
export const statusLabel = (status:string) => ({ready:"Ready for approval",needs_review:"Needs review",blocked:"Blocked",hold:"On hold",approved:"Internally approved"})[status as "ready"] || status;
export function eurosToCents(value:string):number|null { if (!/^\d+(?:\.\d{1,2})?$/.test(value.trim())) return null; const [whole,fraction=""] = value.trim().split("."); const cents=Number(whole)*100+Number(fraction.padEnd(2,"0")); return Number.isSafeInteger(cents) && cents>0 && cents<=100_000_000_000 ? cents : null; }
