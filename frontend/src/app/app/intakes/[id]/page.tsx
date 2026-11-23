"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useState, type FormEvent } from "react";
import { ArrowLeft, FileCheck2, RotateCcw } from "lucide-react";
import { api } from "@/lib/api";
import type { InvoiceDraftFields } from "@/lib/intake";
import { missingReviewFields } from "@/lib/intake";
import { useApi } from "@/hooks/use-api";
import { ErrorState, Loading, PageHeading, Panel } from "@/components/ui/primitives";

const labels: { name: keyof InvoiceDraftFields; label: string; type?: string }[] = [
  { name: "supplier_name", label: "Supplier name" },
  { name: "registration_number", label: "Registration number" },
  { name: "vat_number", label: "VAT number" },
  { name: "invoice_number", label: "Invoice number" },
  { name: "invoice_date", label: "Invoice date", type: "date" },
  { name: "due_date", label: "Due date", type: "date" },
  { name: "total_amount", label: "Total amount", type: "text" },
  { name: "currency", label: "Currency" },
  { name: "iban", label: "Destination IBAN" },
  { name: "payment_reference", label: "Payment reference" },
];

export default function InvoiceIntakeReview() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const load = useCallback(() => api.intake(id), [id]);
  const draft = useApi(load);
  const suppliers = useApi(api.suppliers);
  const [edited, setEdited] = useState<{ id: string; fields: InvoiceDraftFields } | null>(null);
  const [selectedSupplier, setSelectedSupplier] = useState<{ id: string; value: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const intake = draft.data;
  const fields = edited?.id === id ? edited.fields : intake?.fields ?? null;
  const match = suppliers.data?.find(s => s.name.toLowerCase() === fields?.supplier_name?.toLowerCase());
  const supplierId = selectedSupplier?.id === id ? selectedSupplier.value :
    intake?.create_new_supplier ? "new" : intake?.supplier_id || match?.id || "";

  async function retry() {
    setBusy(true); setError(""); setMessage("");
    try { const updated = await api.retryIntake(id); setEdited(null); draft.setData(updated); setMessage("Extraction retried. Review the proposed fields."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Extraction retry failed"); }
    finally { setBusy(false); }
  }

  async function download() {
    setError("");
    try {
      const blob = await api.intakeDocument(id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = `invoice-${id}`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Document download failed"); }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!fields || busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const updated = await api.reviewIntake(id, fields, supplierId === "new" ? null : supplierId, supplierId === "new");
      setEdited(null);
      draft.setData(updated);
      setMessage("Reviewed fields saved. Run fraud analysis when ready.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save corrections"); }
    finally { setBusy(false); }
  }

  async function analyze() {
    setBusy(true); setError(""); setMessage("");
    try { const invoice = await api.analyzeIntake(id); router.push(`/app/payments/${encodeURIComponent(invoice.id)}`); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Risk analysis failed"); setBusy(false); }
  }

  if (draft.loading && !draft.data) return <Loading/>;
  if (draft.error && !draft.data) return <ErrorState message={draft.error} retry={draft.refresh}/>;
  if (!intake || !fields) return null;
  const missing = missingReviewFields(fields);
  return <>
    <Link className="back-link" href="/app/payments/new"><ArrowLeft size={17}/> New assessment</Link>
    <PageHeading title="Review extracted invoice" description="Confirm every field before the Python risk engine evaluates this invoice."/>
    <div className="intake-review-grid"><Panel className="intake-review-panel">
      <div className="section-head"><div><span className="overline">EXTRACTION / {intake.method === "openai_vision" ? "VISION MODEL" : "LOCAL PDF TEXT"}</span><h2>Proposed invoice fields</h2><p>Highlighted fields need your attention. An extraction is never an approval.</p></div><FileCheck2 size={25} aria-hidden="true"/></div>
      {intake.status === "provider_unavailable" && <div className="notice danger">Visual extraction is unavailable. Enter the fields manually or retry when the provider is configured.</div>}
      {intake.status === "analyzed" && intake.invoice_id && <div className="notice success">Assessment saved. <Link href={`/app/payments/${encodeURIComponent(intake.invoice_id)}`}>Open the risk result</Link>.</div>}
      <form className="assessment-form" onSubmit={save}><div className="intake-fields">
        {labels.map(({ name, label, type }) => <label key={name} className={intake.uncertain_fields.includes(name) || missing.includes(name) ? "field-uncertain" : ""}>
          {label}{intake.uncertain_fields.includes(name) && <small>Check extracted value</small>}
          <input name={name} type={type || "text"} value={fields[name] ?? ""}
            required={(["supplier_name", "invoice_number", "invoice_date", "total_amount", "currency", "iban"] as string[]).includes(name)}
            disabled={busy || intake.status === "analyzed"}
            onChange={event => setEdited({ id, fields: { ...fields, [name]: event.target.value || null } })}/>
        </label>)}
      </div><label>Supplier match<select value={supplierId} required disabled={busy || intake.status === "analyzed"} onChange={event => setSelectedSupplier({ id, value: event.target.value })}>
        <option value="">Choose a supplier</option>
        {suppliers.data?.map(s => <option value={s.id} key={s.id}>{s.name} · {s.payment_count} payments</option>)}
        <option value="new">Confirm as new supplier · no payment history</option>
      </select><small>Confirm the supplier independently. A new supplier is flagged for review.</small></label>
      {error && <div className="notice danger" role="alert">{error}</div>}
      {message && <div className="notice success" role="status">{message}</div>}
      <div className="intake-actions"><button className="button secondary" type="submit" disabled={busy || intake.status === "analyzed" || missing.length > 0 || !supplierId}>Save corrections</button>
        <button className="button primary" type="button" disabled={busy || intake.status !== "reviewed"} onClick={() => void analyze()}>{busy ? "Working…" : "Analyze risk"}</button></div>
      </form>
    </Panel><aside className="intake-review-side"><Panel><h2>Original evidence</h2><p>Private file · {(intake.size_bytes / 1024).toFixed(0)} KB</p><button className="button quiet full" type="button" onClick={() => void download()}>Download original</button><button className="button quiet full" type="button" disabled={busy || intake.status === "analyzed" || intake.status === "reviewed" || intake.extraction_attempts >= 3} onClick={() => void retry()}><RotateCcw size={16}/> Retry extraction</button></Panel>
      <Panel><h2>What happens next?</h2><p>TrustPay checks the confirmed IBAN, duplicate invoice number, and amount against this organization’s supplier history.</p><p>Scores are review priorities, not fraud probabilities. Approval remains server controlled.</p></Panel>
    </aside></div>
  </>;
}
