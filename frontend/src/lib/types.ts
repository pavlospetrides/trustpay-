export type Status = "ready" | "needs_review" | "blocked" | "hold" | "approved";
export interface Signal { code: string; explanation: string; weight?: number }
export interface Invoice { id:string; supplier_id:string; supplier:string; short:string; invoice:string; amount_cents:number; amount:number; iban:string; previous:string; history:number; date:string; risk:number; level:string; kind:string; reason:string; ai_explanation?:string|null; ai_explanation_method?:"verified_policy"|"openai_summary"|null; signals:Signal[]; notes:string[]; status:Status; verified:boolean; verified_by:string|null; approved_by:string|null; reference:string; source:string }
export interface Supplier { id:string; name:string; short:string; payment_count:number; last4:string; historical_median_eur:number|null }
export interface AuditEvent { id:number; actor:string; action:string; title:string; detail:string; invoice_id:string|null; created_at:string }
export interface SyncRun { id:string; status:"running"|"success"|"failed"; started_at:string; finished_at:string|null; records_seen:number; records_created:number; records_needs_review:number; records_skipped:number; safe_error:string|null }
export interface ImportReview { external_id:string; revision:string; reason:string; created_at:string }
export interface Integrations { jinius:{status:string;adapter:string;source_label:string;live_connected:boolean;sync_available:boolean;next_step:string;last_run?:SyncRun|null;last_success_at?:string|null;imported_count?:number;needs_review_count?:number;needs_review?:ImportReview[]};bank_payment:{status:string;payment_initiation:boolean} }
export interface Health { status:string; mode:string; payment_initiation:boolean; jinius_connection:string; risk_model:string }
export interface AssessmentInput { id:string; supplier_id:string; invoice_number:string; amount_cents:number; creditor_account:string; invoice_date:string }
