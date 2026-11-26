"use client";

import Link from "next/link";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, FileCheck2, RotateCcw } from "lucide-react";
import { api } from "@/lib/api";
import { sourceText, type MessageKey } from "@/lib/i18n/core";
import { intakeDocumentTypes, intakeEvidenceLabels } from "@/lib/i18n/intake-labels";
import { useI18n } from "@/lib/i18n/provider";
import type { InvoiceDraftFields } from "@/lib/intake";
import type { UniversalDocument } from "@/lib/server/invoices/universal";
import { extractionPresentation, missingReviewFields } from "@/lib/intake";
import { useApi } from "@/hooks/use-api";
import { ErrorState, Loading, PageHeading, Panel } from "@/components/ui/primitives";

const labels: { name: keyof InvoiceDraftFields; label: MessageKey; type?: string }[] = [
  { name: "supplier_name", label: "supplier-name" },
  { name: "registration_number", label: "registration-number" },
  { name: "vat_number", label: "vat-number" },
  { name: "invoice_number", label: "invoice-number" },
  { name: "invoice_date", label: "invoice-date", type: "date" },
  { name: "due_date", label: "due-date", type: "date" },
  { name: "total_amount", label: "total-amount", type: "text" },
  { name: "currency", label: "currency" },
  { name: "iban", label: "destination-iban" },
  { name: "payment_reference", label: "payment-reference" },
];
type EvidenceValue = UniversalDocument["supplier"]["legal_name"];
function EvidenceEditor({ title, entries, path, disabled, onChange }: { title: string; entries: [string, EvidenceValue][]; path: (string | number)[]; disabled: boolean; onChange: (path: (string | number)[], value: string) => void }) {
  const { t, number } = useI18n();
  if (!entries.length) return null;
  return <section className="intake-evidence-section"><h3>{title}</h3><div className="intake-fields">
    {entries.map(([key, evidence]) => {
      const label = intakeEvidenceLabels[key] ? t(intakeEvidenceLabels[key]) : key.replaceAll("_", " ");
      return <label key={key}>{label}<input type="text" dir={["iban", "account_number", "bic", "email", "telephone"].includes(key) ? "ltr" : "auto"}
        aria-label={t("intake.evidence-field-label", { p0: title, p1: label })} value={evidence.value ?? ""} disabled={disabled} onChange={(event) => onChange([...path, key], event.target.value)}/>
        {evidence.supporting_text && <small className="field-evidence">{t("intake.evidence-page", { p0: evidence.page ? number(evidence.page) : "?", p1: evidence.supporting_text })}</small>}
      </label>;
    })}
  </div></section>;
}

export default function InvoiceIntakeReview() {
  const { t, p, text, list, number, message: localizeMessage } = useI18n();
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
    try { const updated = await api.retryIntake(id); setEdited(null); setEditedDocument(null); setOverrideReason(null); setSingleConfirmed(null); draft.setData(updated); setMessage(sourceText("extraction-retried-review-the-proposed-fields")); }
    catch (cause) { setError(cause instanceof Error ? cause.message : sourceText("extraction-retry-failed")); }
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
    } catch (cause) { setError(cause instanceof Error ? cause.message : sourceText("document-download-failed")); }
  }

  async function showOriginal() {
    setError("");
    try { setPreview(URL.createObjectURL(await api.intakeDocument(id))); }
    catch (cause) { setError(cause instanceof Error ? cause.message : sourceText("intake.preview-failed")); }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!fields || busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const amount = fields.total_amount?.replace(/^(\d+),(\d{1,2})$/, "$1.$2") ?? null;
      const updated = await api.reviewIntake(id, { ...fields, total_amount: amount }, supplierId === "new" ? null : supplierId, supplierId === "new", activeDocument, reason || null, confirmedSingle);
      setEdited(null);
      setEditedDocument(null);
      setOverrideReason(null);
      setSingleConfirmed(null);
      draft.setData(updated);
      setMessage(sourceText("reviewed-fields-saved-run-fraud-analysis-when-ready"));
    } catch (cause) { setError(cause instanceof Error ? cause.message : sourceText("could-not-save-corrections")); }
    finally { setBusy(false); }
  }

  async function analyze() {
    setBusy(true); setError(""); setMessage("");
    try { const invoice = await api.analyzeIntake(id); router.push(`/app/payments/${encodeURIComponent(invoice.id)}`); }
    catch (cause) { setError(cause instanceof Error ? cause.message : sourceText("risk-analysis-failed")); setBusy(false); }
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
  const documentType = documentEvidence ? t(intakeDocumentTypes[documentEvidence.document_type]) : "";
  const criticalFields = missing.map(field => {
    const label = labels.find(item => item.name === field)?.label;
    return label ? t(label) : field;
  });
  const cost = intake.estimated_cost_usd;
  return <>
    <Link className="back-link" href="/app/payments/new"><ArrowLeft size={17}/> {t("new-assessment")}</Link>
    <PageHeading title={t("review-extracted-invoice")} description={t("confirm-every-field-before-the-server-risk-engine")}/>
    <div className="intake-review-grid"><Panel className="intake-review-panel">
      <div className="section-head">
        <div><span className="overline">{t("extraction")} {text(extraction.method)}</span><h2>{t("proposed-invoice-fields")}</h2>
          <p>{t("intake.extraction-outcome", { p0: text(extraction.outcome) })} {t("highlighted-fields-need-your-attention-an-extraction-is")}</p>
        </div><FileCheck2 size={25} aria-hidden="true"/>
      </div>
      {extraction.warning && <div className="notice danger" role="alert">{localizeMessage(extraction.warning)}</div>}
      {missing.length > 0 && <div className="notice danger" role="alert">{t("intake.critical-fields", { p0: list(criticalFields) })}</div>}
      {documentEvidence && <div className="intake-evidence-summary">
        <p><strong>{t("intake.document-type-label")}</strong> {documentType} · {p("intake.page-count", intake.page_count ?? 1)} · {documentEvidence.languages.length ? <bdi>{list(documentEvidence.languages)}</bdi> : t("intake.unknown-language")}</p>
        {intake.document?.multiple_invoices && <div className="notice danger">
          {t("intake.multiple-invoices-help")} <Link href="/app/payments/new">{t("intake.separate-invoice-uploads")}</Link> {t("intake.single-invoice-help")}
        </div>}
      </div>}
      {!fields.iban && <div className="notice danger">{t("intake.unconfirmed-iban")}</div>}
      {intake.usage && <p className="field-evidence">
        {t("intake.ai-usage", { p0: number(intake.usage.input_tokens), p1: number(intake.usage.output_tokens) })}
        {cost != null && <> · {t("intake.estimated-cost", { p0: number(cost, { style: "currency", currency: "USD", minimumFractionDigits: 4, maximumFractionDigits: 4 }) })}</>}
      </p>}
      {(intake.findings?.length || documentEvidence?.warnings.length) ? <section className="intake-evidence-section" aria-label={t("intake.extraction-warnings")}>
        <h3>{t("intake.checks-warnings")}</h3>
        <ul>{intake.findings?.map((finding, index) => <li key={`${finding.code}-${index}`}>
          {t(finding.severity === "blocking" ? "intake.blocking-finding" : "intake.check-finding", { p0: localizeMessage(finding.detail) })}
        </li>)}{documentEvidence?.warnings.map((warning, index) => <li dir="auto" key={`document-${index}`}>{localizeMessage(warning)}</li>)}</ul>
      </section> : null}
      {intake.status === "analyzed" && intake.invoice_id && <div className="notice success">{t("assessment-saved")} <Link href={`/app/payments/${encodeURIComponent(intake.invoice_id)}`}>{t("open-the-risk-result")}</Link>.</div>}
      <form className="assessment-form" onSubmit={save}><div className="intake-fields">
        {labels.map(({ name, label, type }) => <label key={name} className={intake.uncertain_fields.includes(name) || missing.includes(name) ? "field-uncertain" : ""}>
          {t(label)}{intake.uncertain_fields.includes(name) && <small>{t("check-extracted-value")}</small>}
          <input name={name} type={type || "text"} aria-label={t(label)} value={fields[name] ?? ""}
            dir={["iban", "currency", "total_amount", "invoice_date", "due_date"].includes(name) ? "ltr" : "auto"}
            inputMode={name === "total_amount" ? "decimal" : undefined}
            required={(["supplier_name", "invoice_number", "invoice_date", "total_amount", "currency"] as string[]).includes(name)}
            disabled={busy || intake.status === "analyzed"}
            onChange={event => { setEdited({ id, fields: { ...fields, [name]: event.target.value || null } }); if (name === "total_amount") changePayableAmount(event.target.value); }}/>
          {evidenceByField?.[name]?.supporting_text && <small className="field-evidence">{t("intake.source-page", {
            p0: evidenceByField[name]?.page ? number(evidenceByField[name].page) : "?", p1: evidenceByField[name]?.supporting_text,
          })}</small>}
          {original?.[name] && original[name] !== fields[name] && <small className="field-evidence">{t("intake.originally-extracted", { p0: original[name] })}</small>}
        </label>)}
      </div><label>{t("supplier-match")}<select value={supplierId} required disabled={busy || intake.status === "analyzed"} onChange={event => setSelectedSupplier({ id, value: event.target.value })}>
        <option value="">{t("choose-a-supplier-2")}</option>
        {suppliers.data?.map(s => <option value={s.id} key={s.id}>{s.name} · {p("supplier-payment-count", s.payment_count)}</option>)}
        <option value="new">{t("confirm-as-new-supplier-no-payment-history")}</option>
      </select><small>{t("confirm-the-supplier-independently-a-new-supplier-is")}</small></label>
      {activeDocument && <>
        <section className="intake-evidence-section"><h3>{t("intake.document-classification")}</h3>
          <label>{t("intake.document-type")}<select value={activeDocument.document_type} disabled={busy || intake.status === "analyzed"} onChange={(event) => changeDocumentType(event.target.value as UniversalDocument["document_type"])}>
            {Object.entries(intakeDocumentTypes).map(([kind, label]) => <option key={kind} value={kind}>{t(label)}</option>)}
          </select></label>
        </section>
        {intake.document?.multiple_invoices && <label className="intake-resolution"><input type="checkbox" checked={confirmedSingle} disabled={busy || intake.status === "analyzed"} onChange={(event) => confirmSingleInvoice(event.target.checked)}/> {t("intake.inspected-one-invoice")}</label>}
        {(intake.document && (intake.document.document_type !== activeDocument.document_type || intake.document.multiple_invoices && !activeDocument.multiple_invoices)) && <label>
          {t("intake.classification-reason")}<textarea value={reason} dir="auto" minLength={20} maxLength={500} required disabled={busy || intake.status === "analyzed"} onChange={(event) => setOverrideReason({ id, value: event.target.value })}/>
          <small>{t("intake.classification-audit")}</small>
        </label>}
        <EvidenceEditor title={t("intake.document-references")} entries={Object.entries(activeDocument.document).filter(([key]) => !["invoice_number", "invoice_date", "due_date", "payment_reference"].includes(key))} path={["document"]} disabled={busy || intake.status === "analyzed"} onChange={changeEvidence}/>
        <EvidenceEditor title={t("intake.supplier-details")} entries={Object.entries(activeDocument.supplier).filter(([key]) => !["legal_name", "registration_number", "vat_number"].includes(key))} path={["supplier"]} disabled={busy || intake.status === "analyzed"} onChange={changeEvidence}/>
        <EvidenceEditor title={t("intake.customer-details")} entries={Object.entries(activeDocument.customer)} path={["customer"]} disabled={busy || intake.status === "analyzed"} onChange={changeEvidence}/>
        <EvidenceEditor title={t("intake.financial-details")} entries={Object.entries(activeDocument.financial).filter(([key]) => key !== "currency")} path={["financial"]} disabled={busy || intake.status === "analyzed"} onChange={changeEvidence}/>
        {activeDocument.accounts.map((account, index) => <div key={`account-${index}`}>
          <EvidenceEditor title={t("intake.numbered-account", { p0: number(index + 1) })} entries={Object.entries(account)} path={["accounts", index]} disabled={busy || intake.status === "analyzed"} onChange={changeEvidence}/>
          <button className="button quiet" type="button" disabled={busy || intake.status === "analyzed"} onClick={() => changeCollection("accounts", "remove", index)}>{t("intake.remove-account")}</button>
        </div>)}
        <button className="button quiet" type="button" disabled={busy || intake.status === "analyzed" || activeDocument.accounts.length >= 20} onClick={() => changeCollection("accounts", "add")}>{t("intake.add-account")}</button>
        {activeDocument.vat_breakdown.map((vat, index) => <div key={`vat-${index}`}>
          <EvidenceEditor title={t("intake.numbered-vat-rate", { p0: number(index + 1) })} entries={Object.entries(vat)} path={["vat_breakdown", index]} disabled={busy || intake.status === "analyzed"} onChange={changeEvidence}/>
          <button className="button quiet" type="button" disabled={busy || intake.status === "analyzed"} onClick={() => changeCollection("vat_breakdown", "remove", index)}>{t("intake.remove-vat-rate")}</button>
        </div>)}
        <button className="button quiet" type="button" disabled={busy || intake.status === "analyzed" || activeDocument.vat_breakdown.length >= 30} onClick={() => changeCollection("vat_breakdown", "add")}>{t("intake.add-vat-rate")}</button>
        {activeDocument.line_items.map((line, index) => <div key={`line-${index}`}>
          <EvidenceEditor title={t("intake.numbered-line-item", { p0: number(index + 1) })} entries={Object.entries(line)} path={["line_items", index]} disabled={busy || intake.status === "analyzed"} onChange={changeEvidence}/>
          <button className="button quiet" type="button" disabled={busy || intake.status === "analyzed"} onClick={() => changeCollection("line_items", "remove", index)}>{t("intake.remove-line-item")}</button>
        </div>)}
        <button className="button quiet" type="button" disabled={busy || intake.status === "analyzed" || activeDocument.line_items.length >= 300} onClick={() => changeCollection("line_items", "add")}>{t("intake.add-line-item")}</button>
      </>}
      {error && <div className="notice danger" role="alert">{localizeMessage(error)}</div>}
      {message && <div className="notice success" role="status">{localizeMessage(message)}</div>}
      <div className="intake-actions"><button className="button secondary" type="submit" disabled={busy || intake.status === "analyzed" || missing.length > 0 || !supplierId}>{t("save-corrections")}</button>
        <button className="button primary" type="button" disabled={busy || intake.status !== "reviewed" || !fields.iban} onClick={() => void analyze()}>{busy ? t("working") : t("analyze-risk")}</button></div>
      </form>
      {documentEvidence && !documentEvidence.line_items.length && <section className="intake-evidence-section" aria-label={t("intake.line-items")}><h3>{t("intake.line-items")}</h3><p>{t("intake.no-line-items")}</p></section>}
    </Panel><aside className="intake-review-side"><Panel>
      <h2>{t("original-evidence")}</h2><p>{t("private-file")} {number(Math.round(intake.size_bytes / 1024))} {t("kb")}</p>
      <button className="button quiet full" type="button" onClick={() => void showOriginal()}>{t("intake.view-original")}</button>
      <button className="button quiet full" type="button" onClick={() => void download()}>{t("download-original")}</button>
      {preview && (intake.content_type === "application/pdf"
        ? <iframe className="intake-preview" title={t("intake.original-invoice")} src={preview}/>
        : <Image className="intake-preview" src={preview} alt={t("intake.original-invoice")} width={800} height={1100} unoptimized/>)}
      <button className="button quiet full" type="button" disabled={busy || !intake.retry_available} onClick={() => void retry()}><RotateCcw size={16}/> {t("retry-extraction")}</button>
      {!intake.retry_available && intake.status === "needs_review" && intake.method === "local_pdf_text" && intake.extraction_attempts < 3 && <p className="field-evidence">{t("intake.retry-external-required")}</p>}
    </Panel>
      <Panel><h2>{t("what-happens-next")}</h2><p>{t("trustpay-checks-the-confirmed-iban-duplicate-invoice-number")}</p><p>{t("scores-are-review-priorities-not-fraud-probabilities-approval")}</p></Panel>
    </aside></div>
  </>;
}
