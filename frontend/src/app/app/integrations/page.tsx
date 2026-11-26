"use client";
import { sourceText } from "@/lib/i18n/core";
import { useI18n } from "@/lib/i18n/provider";
import { useCallback, useState } from "react";
import type { ImportReview } from "@/lib/types";
import { ArrowRight, Database, PlugZap, RefreshCw, ShieldOff } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/use-api";
import { ErrorState, Loading, PageHeading, Panel } from "@/components/ui/primitives";


export default function Integrations() {
  const { t, text, dateTime, connectionLabel, number, message: localizeMessage } = useI18n();

  const feed = useApi(api.integrations);
  const jinius = feed.data?.jinius, payment = feed.data?.bank_payment;
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("");
  async function sync() {
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const run = await api.syncJinius();
      // A failed run comes back as HTTP 200; its safe error shows once, in red, from the refreshed last run.
      if (run.status === "success") setMessage(sourceText("sync-finished-assessed-sent-to-human-review-already", { p0: run.records_created, p1: run.records_needs_review, p2: number(run.records_skipped) }));
    } catch (e) { setError(e instanceof Error ? e.message : sourceText("sync-failed")); }
    finally { setBusy(false); await feed.refresh(); }
  }
  const run = jinius?.last_run;
  return <>
    <PageHeading title={t("integrations")} description={t("connection-state-reported-by-the-server-no-browser")}/>
    {feed.loading && !feed.data ? <Loading/> : feed.error && !feed.data ? <ErrorState message={feed.error} retry={feed.refresh}/> : <>
      {feed.error ? <div className="notice danger" role="alert">{t("could-not-refresh-integrations")} {localizeMessage(feed.error)} <button className="button secondary" type="button" onClick={feed.refresh}>{t("retry")}</button></div> : null}
      <div className="integration-grid">
        <Panel className="integration-card"><div className="integration-icon"><PlugZap size={24}/></div><span className={`badge ${jinius?.live_connected ? "badge-ready" : "badge-hold"}`}>{jinius?.status === "mock" ? t("mock-disconnected") : jinius?.status ? connectionLabel(jinius.status) : t("unknown")}</span><h2>Jinius</h2><p>{t("adapter")} {jinius?.adapter}{t("integration.live-connected")} {jinius?.live_connected ? t("yes") : t("no")}.</p>
          <div className="integration-detail"><strong>{t("data-available")}</strong><span>{text(jinius?.source_label)}{t("integration.demo-source")}</span></div>
          {jinius?.sync_available ? <>
            <div className="integration-detail"><strong>{t("last-sync")}</strong><span>{run ? t("seen-assessed-need-review-already-imported", { p0: run.status === "success" ? t("succeeded") : run.status === "failed" ? t("failed") : t("running"), p1: dateTime(run.started_at), p2: number(run.records_seen), p3: number(run.records_created), p4: number(run.records_needs_review), p5: number(run.records_skipped) }) : t("never-run")}{jinius.last_success_at ? t("integration.last-success", { p0: dateTime(jinius.last_success_at) }) : ""}</span></div>
            {run?.safe_error ? <div className="notice danger">{text(run.safe_error)}</div> : null}
            <div className="integration-detail"><strong>{t("imported")}</strong><span>{t("invoices-assessed-and-queued-for-maker-checker-review", { p0: number(jinius.imported_count ?? 0), p1: number(jinius.needs_review_count ?? 0) })}</span></div>
            {jinius.needs_review?.length ? <ul className="muted">{jinius.needs_review.map(r => <ReviewRow key={`${r.external_id}@${r.revision}`} item={r} onResolved={feed.refresh}/>)}</ul> : null}
            <button className="button primary" type="button" onClick={sync} disabled={busy}><RefreshCw size={17} aria-hidden="true"/> {busy ? t("syncing") : t("run-sync")}</button>
            <small className="muted">{t("owners-and-admins-only-each-invoice-is-assessed")}</small>
            {error ? <div className="notice danger" role="alert">{localizeMessage(error)}</div> : null}
            {message ? <div className="notice success" role="status">{localizeMessage(message)}</div> : null}
          </> : null}
          <div className="integration-detail"><strong>{t("next-step")}</strong><span>{text(jinius?.next_step)}</span></div></Panel>
        <Panel className="integration-card"><div className="integration-icon"><ShieldOff size={24}/></div><span className={`badge ${payment?.payment_initiation ? "badge-ready" : "badge-blocked"}`}>{payment?.status && connectionLabel(payment.status)}</span><h2>{t("bank-payment")}</h2><p>{t("payment-initiation")} {payment?.payment_initiation ? t("enabled") : t("disabled")}{t("this-demo-has-no-transfer-endpoint")}</p><div className="integration-detail"><strong>{t("current-state")}</strong><span>{t("internal-decisions-only-no-bank-confirmation")}</span></div></Panel>
      </div>
      <Panel className="flow-panel"><h2>{t("data-flow")}</h2><div className="integration-flow"><span><Database size={19}/> {jinius?.source_label ? text(jinius.source_label) : t("synthetic-records")}</span><ArrowRight size={18}/><span><PlugZap size={19}/> {t("the-server-risk-rules")}</span><ArrowRight size={18}/><span>{t("human-maker-checker-review")}</span><ArrowRight size={18}/><span>{t("no-payment-sent")}</span></div></Panel>
    </>}
  </>;
}

function ReviewRow({ item, onResolved }: { item: ImportReview; onResolved: () => Promise<void> }) {
  const { t, text, message: localizeMessage } = useI18n();

  const loadSuppliers = useCallback(() => item.resolvable ? api.suppliers() : Promise.resolve([]), [item.resolvable]);
  const suppliers = useApi(loadSuppliers);
  const [supplier, setSupplier] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function resolve() {
    if (!supplier || busy) return;
    setBusy(true); setError("");
    try { await api.resolveImport(item.external_id, item.revision, supplier); }
    catch (e) { setError(e instanceof Error ? e.message : sourceText("could-not-resolve-this-import")); }
    // Refresh either way: a request that failed in transit may still have resolved the row.
    finally { setBusy(false); await onResolved(); }
  }
  const label = t("integration.revision", { p0: item.external_id, p1: item.revision });
  return <li>{label}{item.supplier_reference ? t("provider-supplier", { p0: item.supplier_reference }) : ""}: {text(item.reason)}
    {item.resolvable ? <div className="form-row">
      <label>{t("assign-supplier")}<select value={supplier} onChange={e => setSupplier(e.target.value)} disabled={busy} aria-label={t("supplier-for", { p0: label })}>
        <option value="">{t("choose-a-supplier")}</option>
        {suppliers.data?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select></label>
      <button className="button secondary" type="button" onClick={resolve} disabled={!supplier || busy}>{busy ? t("assessing") : t("assess-with-this-supplier")}</button>
    </div> : null}
    {item.resolvable && suppliers.error ? <div className="notice danger" role="alert">{t("suppliers-could-not-load")} {localizeMessage(suppliers.error)} <button className="button secondary" type="button" onClick={suppliers.refresh}>{t("retry")}</button></div> : null}
    {error ? <div className="notice danger" role="alert">{localizeMessage(error)}</div> : null}
  </li>;
}
