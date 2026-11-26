"use client";

import Link from "next/link";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, FileCheck2, RotateCcw } from "lucide-react";
import { api } from "@/lib/api";
import type { InvoiceDraftFields } from "@/lib/intake";
import type { UniversalDocument } from "@/lib/server/invoices/universal";
import { extractionPresentation, missingReviewFields } from "@/lib/intake";
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
type EvidenceValue = UniversalDocument["supplier"]["legal_name"];
function EvidenceEditor({ title, entries, path, disabled, onChange }: { title: string; entries: [string, EvidenceValue][]; path: (string | number)[]; disabled: boolean; onChange: (path: (string | number)[], value: string) => void }) {
  if (!entries.length) return null;
  return <section className="intake-evidence-section"><h3>{title}</h3><div className="intake-fields">{entries.map(([key, evidence]) => <label key={key}>{key.replaceAll("_", " ")}<input type="text" aria-label={`${title} ${key.replaceAll("_", " ")}`} value={evidence.value ?? ""} disabled={disabled} onChange={(event) => onChange([...path, key], event.target.value)}/>{evidence.supporting_text && <small className="field-evidence">Page {evidence.page ?? "?"}: {evidence.supporting_text}</small>}</label>)}</div></section>;
}

export default function InvoiceIntakeReview() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const load = useCallback(() => api.intake(id), [id]);
  const draft = useApi(load);
  const suppliers = useApi(api.suppliers);
  const [edited, setEdited] = useState<{ id: string; fields: InvoiceDraftFields } | null>(null);
  const [editedDocument, setEditedDocument] = useState<{ id: string; document: UniversalDocument } | null>(null);
  const [overrideReason, setOverrideReason] = useState<{ id: string; value: string } | null>(null);
  const [singleConfirmed, setSingleConfirmed] = useState<{ id: string; value: boolean } | null>(null);
  const [selectedSupplier, setSelectedSupplier] = useState<{ id: string; value: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState("");
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const intake = draft.data;
  const fields = edited?.id === id ? edited.fields : intake?.fields ?? null;
  const activeDocument = editedDocument?.id === id ? editedDocument.document : intake?.reviewed_document ?? intake?.document ?? null;
  const reason = overrideReason?.id === id ? overrideReason.value : intake?.classification_override_reason ?? "";
  const confirmedSingle = singleConfirmed?.id === id ? singleConfirmed.value : Boolean(intake?.single_invoice_confirmed);
  function changeEvidence(path: (string | number)[], value: string) {
    if (!activeDocument) return;
    const updated = structuredClone(activeDocument);
    let parent: unknown = updated;
    for (const key of path.slice(0, -1)) parent = (parent as Record<string, unknown>)[String(key)];
    const target = (parent as Record<string, { value: string | null; uncertain: boolean }>)[String(path.at(-1))];
    target.value = value || null;
    target.uncertain = false;
    setEditedDocument({ id, document: updated });
    if (path[0] === "accounts" && path[1] === 0 && path[2] === "iban" && updated.accounts.length === 1 && fields) setEdited({ id, fields: { ...fields, iban: value || null } });
  }
  function changeDocumentType(value: UniversalDocument["document_type"]) {
    if (!activeDocument) return;
    setEditedDocument({ id, document: { ...activeDocument, document_type: value } });
  }
  function confirmSingleInvoice(confirmed: boolean) {
    if (!activeDocument) return;
    setSingleConfirmed({ id, value: confirmed });
    setEditedDocument({ id, document: { ...activeDocument, multiple_invoices: !confirmed } });
  }
  function changePayableAmount(value: string) {
    if (!activeDocument) return;
    const updated = structuredClone(activeDocument);
    const target = updated.financial.outstanding_balance.value ? updated.financial.outstanding_balance : updated.financial.gross_total;
    target.value = value || null;
    target.uncertain = false;
    setEditedDocument({ id, document: updated });
  }
  function changeCollection(name: "line_items" | "accounts" | "vat_breakdown", action: "add" | "remove", index = 0) {
    if (!activeDocument) return;
    const updated = structuredClone(activeDocument);
    const collection = updated[name] as unknown[];
    if (action === "remove") collection.splice(index, 1);
    else {
      const keys = name === "line_items" ? ["description", "code", "quantity", "unit", "unit_price", "discount", "net_amount", "vat_rate", "vat_amount", "total_amount"] : name === "accounts" ? ["iban", "account_number", "bank_name", "bic", "beneficiary_name", "instructions"] : ["rate", "net_amount", "vat_amount"];
      collection.push(Object.fromEntries(keys.map((key) => [key, { value: null, source_value: null, supporting_text: null, page: null, uncertain: true }])));
    }
    setEditedDocument({ id, document: updated });
  }
  const match = suppliers.data?.find(s => s.name.toLowerCase() === fields?.supplier_name?.toLowerCase());
  const supplierId = selectedSupplier?.id === id ? selectedSupplier.value :
    intake?.create_new_supplier ? "new" : intake?.supplier_id || match?.id || "";

  async function retry() {
    setBusy(true); setError(""); setMessage("");
    try { const updated = await api.retryIntake(id); setEdited(null); setEditedDocument(null); setOverrideReason(null); setSingleConfirmed(null); draft.setData(updated); setMessage("Extraction retried. Review the proposed fields."); }
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

  async function showOriginal() {
    setError("");
    try { setPreview(URL.createObjectURL(await api.intakeDocument(id))); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Document preview failed"); }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!fields || busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const updated = await api.reviewIntake(id, fields, supplierId === "new" ? null : supplierId, supplierId === "new", activeDocument, reason || null, confirmedSingle);
      setEdited(null);
      setEditedDocument(null);
      setOverrideReason(null);
      setSingleConfirmed(null);
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
  const extraction = extractionPresentation(intake);
  const original = intake.original_fields;
  const documentEvidence = activeDocument;
  const evidenceByField = documentEvidence ? {
    supplier_name: documentEvidence.supplier.legal_name,
    registration_number: documentEvidence.supplier.registration_number,
    vat_number: documentEvidence.supplier.vat_number,
    invoice_number: documentEvidence.document.invoice_number,
    invoice_date: documentEvidence.document.invoice_date,
    due_date: documentEvidence.document.due_date,
    total_amount: documentEvidence.financial.outstanding_balance.value ? documentEvidence.financial.outstanding_balance : documentEvidence.financial.gross_total,
    currency: documentEvidence.financial.currency,
    iban: documentEvidence.accounts.length === 1 ? documentEvidence.accounts[0].iban : null,
    payment_reference: documentEvidence.document.payment_reference,
  } : null;
  return <>
    <Link className="back-link" href="/app/payments/new"><ArrowLeft size={17}/> New assessment</Link>
    <PageHeading title="Review extracted invoice" description="Confirm every field before the server risk engine evaluates this invoice."/>
    <div className="intake-review-grid"><Panel className="intake-review-panel">
      <div className="section-head"><div><span className="overline">EXTRACTION / {extraction.method}</span><h2>Proposed invoice fields</h2><p>{extraction.outcome}. Highlighted fields need your attention. An extraction is never an approval.</p></div><FileCheck2 size={25} aria-hidden="true"/></div>
      {extraction.warning && <div className="notice danger" role="alert">{extraction.warning}</div>}
      {missing.length > 0 && <div className="notice danger" role="alert">Critical fields need review: {missing.map((field) => labels.find((item) => item.name === field)?.label ?? field).join(", ")}.</div>}
      {documentEvidence && <div className="intake-evidence-summary"><p><strong>Document type:</strong> {documentEvidence.document_type.replaceAll("_", " ")} · {intake.page_count ?? 1} page(s) · {documentEvidence.languages.join(", ") || "Language unknown"}</p>{intake.document?.multiple_invoices && <div className="notice danger">Multiple invoices were detected. If there is more than one, split the document and <Link href="/app/payments/new">upload each invoice separately</Link>. If this is one invoice, inspect every page and record an explicit correction below.</div>}</div>}
      {!fields.iban && <div className="notice danger">No payment IBAN is confirmed. You can save the review, but risk analysis requires a verified destination IBAN.</div>}
      {intake.usage && <p className="field-evidence">AI usage: {intake.usage.input_tokens} input tokens, {intake.usage.output_tokens} output tokens{intake.estimated_cost_usd !== null && intake.estimated_cost_usd !== undefined ? ` · estimated $${intake.estimated_cost_usd.toFixed(4)}` : ""}</p>}
      {(intake.findings?.length || documentEvidence?.warnings.length) ? <section className="intake-evidence-section" aria-label="Extraction warnings"><h3>Checks and warnings</h3><ul>{intake.findings?.map((finding, index) => <li key={`${finding.code}-${index}`}>{finding.severity === "blocking" ? "Review required: " : "Check: "}{finding.detail}</li>)}{documentEvidence?.warnings.map((warning, index) => <li key={`document-${index}`}>{warning}</li>)}</ul></section> : null}
      {intake.status === "analyzed" && intake.invoice_id && <div className="notice success">Assessment saved. <Link href={`/app/payments/${encodeURIComponent(intake.invoice_id)}`}>Open the risk result</Link>.</div>}
      <form className="assessment-form" onSubmit={save}><div className="intake-fields">
        {labels.map(({ name, label, type }) => <label key={name} className={intake.uncertain_fields.includes(name) || missing.includes(name) ? "field-uncertain" : ""}>
          {label}{intake.uncertain_fields.includes(name) && <small>Check extracted value</small>}
          <input name={name} type={type || "text"} aria-label={label} value={fields[name] ?? ""}
            required={(["supplier_name", "invoice_number", "invoice_date", "total_amount", "currency"] as string[]).includes(name)}
            disabled={busy || intake.status === "analyzed"}
            onChange={event => { setEdited({ id, fields: { ...fields, [name]: event.target.value || null } }); if (name === "total_amount") changePayableAmount(event.target.value); }}/>
          {evidenceByField?.[name]?.supporting_text && <small className="field-evidence">Source page {evidenceByField[name]?.page ?? "?"}: {evidenceByField[name]?.supporting_text}</small>}
          {original?.[name] && original[name] !== fields[name] && <small className="field-evidence">Originally extracted: {original[name]}</small>}
        </label>)}
      </div><label>Supplier match<select value={supplierId} required disabled={busy || intake.status === "analyzed"} onChange={event => setSelectedSupplier({ id, value: event.target.value })}>
        <option value="">Choose a supplier</option>
        {suppliers.data?.map(s => <option value={s.id} key={s.id}>{s.name} · {s.payment_count} payments</option>)}
        <option value="new">Confirm as new supplier · no payment history</option>
      </select><small>Confirm the supplier independently. A new supplier is flagged for review.</small></label>
      {activeDocument && <>
        <section className="intake-evidence-section"><h3>Document classification</h3><label>Document type<select value={activeDocument.document_type} disabled={busy || intake.status === "analyzed"} onChange={(event) => changeDocumentType(event.target.value as UniversalDocument["document_type"])}>{["invoice", "credit_note", "proforma_invoice", "commercial_invoice", "electronic_invoice", "receipt", "purchase_order", "delivery_note", "payment_confirmation", "account_statement", "unknown"].map((kind) => <option key={kind} value={kind}>{kind.replaceAll("_", " ")}</option>)}</select></label></section>
        {intake.document?.multiple_invoices && <label className="intake-resolution"><input type="checkbox" checked={confirmedSingle} disabled={busy || intake.status === "analyzed"} onChange={(event) => confirmSingleInvoice(event.target.checked)}/> I inspected every page and confirm this document contains exactly one invoice.</label>}
        {(intake.document && (intake.document.document_type !== activeDocument.document_type || intake.document.multiple_invoices && !activeDocument.multiple_invoices)) && <label>Reason for classification correction<textarea value={reason} minLength={20} maxLength={500} required disabled={busy || intake.status === "analyzed"} onChange={(event) => setOverrideReason({ id, value: event.target.value })}/><small>This reason is encrypted with the intake. The audit records that you made a classification override.</small></label>}
        <EvidenceEditor title="Document references" entries={Object.entries(activeDocument.document).filter(([key]) => !["invoice_number", "invoice_date", "due_date", "payment_reference"].includes(key))} path={["document"]} disabled={busy || intake.status === "analyzed"} onChange={changeEvidence}/>
        <EvidenceEditor title="Supplier details" entries={Object.entries(activeDocument.supplier).filter(([key]) => !["legal_name", "registration_number", "vat_number"].includes(key))} path={["supplier"]} disabled={busy || intake.status === "analyzed"} onChange={changeEvidence}/>
        <EvidenceEditor title="Customer details" entries={Object.entries(activeDocument.customer)} path={["customer"]} disabled={busy || intake.status === "analyzed"} onChange={changeEvidence}/>
        <EvidenceEditor title="Financial details" entries={Object.entries(activeDocument.financial).filter(([key]) => key !== "currency")} path={["financial"]} disabled={busy || intake.status === "analyzed"} onChange={changeEvidence}/>
        {activeDocument.accounts.map((account, index) => <div key={`account-${index}`}><EvidenceEditor title={`Bank account ${index + 1}`} entries={Object.entries(account)} path={["accounts", index]} disabled={busy || intake.status === "analyzed"} onChange={changeEvidence}/><button className="button quiet" type="button" disabled={busy || intake.status === "analyzed"} onClick={() => changeCollection("accounts", "remove", index)}>Remove account</button></div>)}
        <button className="button quiet" type="button" disabled={busy || intake.status === "analyzed" || activeDocument.accounts.length >= 20} onClick={() => changeCollection("accounts", "add")}>Add account</button>
        {activeDocument.vat_breakdown.map((vat, index) => <div key={`vat-${index}`}><EvidenceEditor title={`VAT rate ${index + 1}`} entries={Object.entries(vat)} path={["vat_breakdown", index]} disabled={busy || intake.status === "analyzed"} onChange={changeEvidence}/><button className="button quiet" type="button" disabled={busy || intake.status === "analyzed"} onClick={() => changeCollection("vat_breakdown", "remove", index)}>Remove VAT rate</button></div>)}
        <button className="button quiet" type="button" disabled={busy || intake.status === "analyzed" || activeDocument.vat_breakdown.length >= 30} onClick={() => changeCollection("vat_breakdown", "add")}>Add VAT rate</button>
        {activeDocument.line_items.map((line, index) => <div key={`line-${index}`}><EvidenceEditor title={`Line item ${index + 1}`} entries={Object.entries(line)} path={["line_items", index]} disabled={busy || intake.status === "analyzed"} onChange={changeEvidence}/><button className="button quiet" type="button" disabled={busy || intake.status === "analyzed"} onClick={() => changeCollection("line_items", "remove", index)}>Remove line item</button></div>)}
        <button className="button quiet" type="button" disabled={busy || intake.status === "analyzed" || activeDocument.line_items.length >= 300} onClick={() => changeCollection("line_items", "add")}>Add line item</button>
      </>}
      {error && <div className="notice danger" role="alert">{error}</div>}
      {message && <div className="notice success" role="status">{message}</div>}
      <div className="intake-actions"><button className="button secondary" type="submit" disabled={busy || intake.status === "analyzed" || missing.length > 0 || !supplierId}>Save corrections</button>
        <button className="button primary" type="button" disabled={busy || intake.status !== "reviewed" || !fields.iban} onClick={() => void analyze()}>{busy ? "Working…" : "Analyze risk"}</button></div>
      </form>
      {documentEvidence && !documentEvidence.line_items.length && <section className="intake-evidence-section" aria-label="Line items"><h3>Line items</h3><p>No line items were identified. Check the original document.</p></section>}
    </Panel><aside className="intake-review-side"><Panel><h2>Original evidence</h2><p>Private file · {(intake.size_bytes / 1024).toFixed(0)} KB</p><button className="button quiet full" type="button" onClick={() => void showOriginal()}>View original</button><button className="button quiet full" type="button" onClick={() => void download()}>Download original</button>{preview && (intake.content_type === "application/pdf" ? <iframe className="intake-preview" title="Original invoice" src={preview}/> : <Image className="intake-preview" src={preview} alt="Original invoice" width={800} height={1100} unoptimized/>)}<button className="button quiet full" type="button" disabled={busy || !intake.retry_available} onClick={() => void retry()}><RotateCcw size={16}/> Retry extraction</button>{!intake.retry_available && intake.status === "needs_review" && intake.method === "local_pdf_text" && intake.extraction_attempts < 3 && <p className="field-evidence">Retry is available when external AI extraction is enabled for this development environment.</p>}</Panel>
      <Panel><h2>What happens next?</h2><p>TrustPay checks the confirmed IBAN, duplicate invoice number, and amount against this organization’s supplier history.</p><p>Scores are review priorities, not fraud probabilities. Approval remains server controlled.</p></Panel>
    </aside></div>
  </>;
}
