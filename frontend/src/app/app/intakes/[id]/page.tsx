"use client";

import { sourceText, type MessageKey } from "@/lib/i18n/core";
import { useI18n } from "@/lib/i18n/provider";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useState, type FormEvent } from "react";
import { ArrowLeft, FileCheck2, RotateCcw } from "lucide-react";
import { api } from "@/lib/api";
import type { InvoiceDraftFields } from "@/lib/intake";
import { missingReviewFields } from "@/lib/intake";
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

export default function InvoiceIntakeReview() {
  const { t, p, number, message: localizeMessage } = useI18n();

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
    try { const updated = await api.retryIntake(id); setEdited(null); draft.setData(updated); setMessage(sourceText("extraction-retried-review-the-proposed-fields")); }
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

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!fields || busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const updated = await api.reviewIntake(id, { ...fields, total_amount: fields.total_amount?.replace(",", ".") ?? null }, supplierId === "new" ? null : supplierId, supplierId === "new");
      setEdited(null);
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
  return <>
    <Link className="back-link" href="/app/payments/new"><ArrowLeft size={17}/> {t("new-assessment")}</Link>
    <PageHeading title={t("review-extracted-invoice")} description={t("confirm-every-field-before-the-server-risk-engine")}/>
    <div className="intake-review-grid"><Panel className="intake-review-panel">
      <div className="section-head"><div><span className="overline">{t("extraction")} {intake.method === "openai_vision" ? t("vision-model") : t("local-pdf-text")}</span><h2>{t("proposed-invoice-fields")}</h2><p>{t("highlighted-fields-need-your-attention-an-extraction-is")}</p></div><FileCheck2 size={25} aria-hidden="true"/></div>
      {intake.status === "provider_unavailable" && <div className="notice danger">{t("visual-extraction-is-unavailable-enter-the-fields-manually")}</div>}
      {intake.status === "analyzed" && intake.invoice_id && <div className="notice success">{t("assessment-saved")} <Link href={`/app/payments/${encodeURIComponent(intake.invoice_id)}`}>{t("open-the-risk-result")}</Link>.</div>}
      <form className="assessment-form" onSubmit={save}><div className="intake-fields">
        {labels.map(({ name, label, type }) => <label key={name} className={intake.uncertain_fields.includes(name) || missing.includes(name) ? "field-uncertain" : ""}>
          {t(label)}{intake.uncertain_fields.includes(name) && <small>{t("check-extracted-value")}</small>}
          <input name={name} type={type || "text"} dir={["iban", "currency", "total_amount", "invoice_date", "due_date"].includes(name) ? "ltr" : "auto"} inputMode={name === "total_amount" ? "decimal" : undefined} value={fields[name] ?? ""}
            required={(["supplier_name", "invoice_number", "invoice_date", "total_amount", "currency", "iban"] as string[]).includes(name)}
            disabled={busy || intake.status === "analyzed"}
            onChange={event => setEdited({ id, fields: { ...fields, [name]: event.target.value || null } })}/>
        </label>)}
      </div><label>{t("supplier-match")}<select value={supplierId} required disabled={busy || intake.status === "analyzed"} onChange={event => setSelectedSupplier({ id, value: event.target.value })}>
        <option value="">{t("choose-a-supplier-2")}</option>
        {suppliers.data?.map(s => <option value={s.id} key={s.id}>{s.name} · {p("supplier-payment-count", s.payment_count)}</option>)}
        <option value="new">{t("confirm-as-new-supplier-no-payment-history")}</option>
      </select><small>{t("confirm-the-supplier-independently-a-new-supplier-is")}</small></label>
      {error && <div className="notice danger" role="alert">{localizeMessage(error)}</div>}
      {message && <div className="notice success" role="status">{localizeMessage(message)}</div>}
      <div className="intake-actions"><button className="button secondary" type="submit" disabled={busy || intake.status === "analyzed" || missing.length > 0 || !supplierId}>{t("save-corrections")}</button>
        <button className="button primary" type="button" disabled={busy || intake.status !== "reviewed"} onClick={() => void analyze()}>{busy ? t("working") : t("analyze-risk")}</button></div>
      </form>
    </Panel><aside className="intake-review-side"><Panel><h2>{t("original-evidence")}</h2><p>{t("private-file")} {number(Math.round(intake.size_bytes / 1024))} {t("kb")}</p><button className="button quiet full" type="button" onClick={() => void download()}>{t("download-original")}</button><button className="button quiet full" type="button" disabled={busy || intake.status === "analyzed" || intake.status === "reviewed" || intake.extraction_attempts >= 3} onClick={() => void retry()}><RotateCcw size={16}/> {t("retry-extraction")}</button></Panel>
      <Panel><h2>{t("what-happens-next")}</h2><p>{t("trustpay-checks-the-confirmed-iban-duplicate-invoice-number")}</p><p>{t("scores-are-review-priorities-not-fraud-probabilities-approval")}</p></Panel>
    </aside></div>
  </>;
}
