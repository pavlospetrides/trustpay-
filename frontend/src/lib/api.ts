import type { AssessmentInput, AuditEvent, Health, Integrations, Invoice, Supplier } from "./types";
export class ApiError extends Error { constructor(message:string, public status:number) { super(message); } }
async function request<T>(path:string, init?:RequestInit):Promise<T> {
  let response:Response;
  try { response = await fetch(`/api${path}`, { cache:"no-store", ...init, headers:{"Content-Type":"application/json", ...init?.headers} }); }
  catch { throw new ApiError("Cannot reach the local FastAPI service. Start it on 127.0.0.1:8000 and retry.", 0); }
  if (!response.ok) { const data = await response.json().catch(() => ({})); const detail = data.detail; throw new ApiError(typeof detail === "string" ? detail : Array.isArray(detail) ? detail.map((item:{msg?:string})=>item.msg).join("; ") : `Request failed (${response.status})`, response.status); }
  return response.json() as Promise<T>;
}
const post = <T>(path:string, body?:unknown) => request<T>(path,{method:"POST",body:body ? JSON.stringify(body) : undefined});
export const api = {
  health:()=>request<Health>("/health"), invoices:()=>request<Invoice[]>("/v1/invoices"), invoice:(id:string)=>request<Invoice>(`/v1/invoices/${encodeURIComponent(id)}`),
  suppliers:()=>request<Supplier[]>("/v1/suppliers"), audit:()=>request<AuditEvent[]>("/v1/audit"), integrations:()=>request<Integrations>("/v1/integrations"),
  assess:(body:AssessmentInput)=>post<Invoice>("/v1/invoices/assess",body), verify:(id:string,note:string)=>post<Invoice>(`/v1/invoices/${encodeURIComponent(id)}/verify`,{evidence_note:note}),
  approve:(id:string)=>post<Invoice>(`/v1/invoices/${encodeURIComponent(id)}/approve`), hold:(id:string)=>post<Invoice>(`/v1/invoices/${encodeURIComponent(id)}/hold`), reset:()=>post<{reset:boolean}>("/v1/demo/reset")
};
export const euro = (cents:number) => new Intl.NumberFormat("en-IE",{style:"currency",currency:"EUR"}).format(cents/100);
export const date = (value:string) => new Intl.DateTimeFormat("en-GB",{day:"numeric",month:"short",year:"numeric"}).format(new Date(`${value.slice(0,10)}T12:00:00`));
export const statusLabel = (status:string) => ({ready:"Ready for approval",needs_review:"Needs review",blocked:"Blocked",hold:"On hold",approved:"Internally approved"})[status as "ready"] || status;
export function eurosToCents(value:string):number|null { if (!/^\d+(?:\.\d{1,2})?$/.test(value.trim())) return null; const [whole,fraction=""] = value.trim().split("."); const cents=Number(whole)*100+Number(fraction.padEnd(2,"0")); return Number.isSafeInteger(cents) && cents>0 && cents<=100_000_000_000 ? cents : null; }
