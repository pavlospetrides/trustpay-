"use client";
import { useCallback, useState } from "react";
import type { ImportReview } from "@/lib/types";
import { ArrowRight, Database, PlugZap, RefreshCw, ShieldOff } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/use-api";
import { ErrorState, Loading, PageHeading, Panel } from "@/components/ui/primitives";

const when = (value: string) => new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

export default function Integrations() {
  const feed = useApi(api.integrations);
  const jinius = feed.data?.jinius, payment = feed.data?.bank_payment;
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("");
  async function sync() {
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const run = await api.syncJinius();
      setMessage(run.status === "success"
        ? `Sync finished: ${run.records_created} assessed, ${run.records_needs_review} sent to human review, ${run.records_skipped} already imported.`
        : run.safe_error || "Sync failed.");
    } catch (e) { setError(e instanceof Error ? e.message : "Sync failed"); }
    finally { setBusy(false); await feed.refresh(); }
  }
  const run = jinius?.last_run;
  return <>
    <PageHeading title="Integrations" description="Connection state reported by the FastAPI service. No browser secrets or connection controls are exposed."/>
    {feed.loading && !feed.data ? <Loading/> : feed.error && !feed.data ? <ErrorState message={feed.error} retry={feed.refresh}/> : <>
      <div className="integration-grid">
        <Panel className="integration-card"><div className="integration-icon"><PlugZap size={24}/></div><span className={`badge ${jinius?.live_connected ? "badge-ready" : "badge-hold"}`}>{jinius?.status === "mock" ? "Mock / disconnected" : jinius?.status || "Unknown"}</span><h2>Jinius</h2><p>Adapter: {jinius?.adapter}. Live connected: {jinius?.live_connected ? "Yes" : "No"}.</p>
          <div className="integration-detail"><strong>Data available</strong><span>{jinius?.source_label}: synthetic invoice records through the demo adapter. This is not the Jinius API.</span></div>
          {jinius?.sync_available ? <>
            <div className="integration-detail"><strong>Last sync</strong><span>{run ? `${run.status === "success" ? "Succeeded" : run.status === "failed" ? "Failed" : "Running"} · ${when(run.started_at)} · ${run.records_seen} seen, ${run.records_created} assessed, ${run.records_needs_review} need review, ${run.records_skipped} already imported` : "Never run"}{jinius.last_success_at ? `. Last success ${when(jinius.last_success_at)}.` : ""}</span></div>
            {run?.safe_error ? <div className="notice danger">{run.safe_error}</div> : null}
            <div className="integration-detail"><strong>Imported</strong><span>{jinius.imported_count ?? 0} invoices assessed and queued for maker-checker review; {jinius.needs_review_count ?? 0} records need human review.</span></div>
            {jinius.needs_review?.length ? <ul className="muted">{jinius.needs_review.map(r => <ReviewRow key={`${r.external_id}@${r.revision}`} item={r} onResolved={feed.refresh}/>)}</ul> : null}
            <button className="button primary" type="button" onClick={sync} disabled={busy}><RefreshCw size={17} aria-hidden="true"/> {busy ? "Syncing…" : "Run sync"}</button>
            <small className="muted">Owners and admins only. Each invoice is assessed once by the policy rules and never approved or paid automatically.</small>
            {error ? <div className="notice danger" role="alert">{error}</div> : null}
            {message ? <div className="notice success" role="status">{message}</div> : null}
          </> : null}
          <div className="integration-detail"><strong>Next step</strong><span>{jinius?.next_step}</span></div></Panel>
        <Panel className="integration-card"><div className="integration-icon"><ShieldOff size={24}/></div><span className={`badge ${payment?.payment_initiation ? "badge-ready" : "badge-blocked"}`}>{payment?.status}</span><h2>Bank payment</h2><p>Payment initiation: {payment?.payment_initiation ? "Enabled" : "Disabled"}. This demo has no transfer endpoint.</p><div className="integration-detail"><strong>Current state</strong><span>Internal decisions only; no bank confirmation.</span></div></Panel>
      </div>
      <Panel className="flow-panel"><h2>Data flow</h2><div className="integration-flow"><span><Database size={19}/> {jinius?.source_label ?? "Synthetic records"}</span><ArrowRight size={18}/><span><PlugZap size={19}/> FastAPI risk rules</span><ArrowRight size={18}/><span>Human maker-checker review</span><ArrowRight size={18}/><span>No payment sent</span></div></Panel>
    </>}
  </>;
}

function ReviewRow({ item, onResolved }: { item: ImportReview; onResolved: () => Promise<void> }) {
  const loadSuppliers = useCallback(() => item.resolvable ? api.suppliers() : Promise.resolve([]), [item.resolvable]);
  const suppliers = useApi(loadSuppliers);
  const [supplier, setSupplier] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function resolve() {
    if (!supplier || busy) return;
    setBusy(true); setError("");
    try { await api.resolveImport(item.external_id, item.revision, supplier); await onResolved(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not resolve this import"); }
    finally { setBusy(false); }
  }
  const label = `${item.external_id} (rev ${item.revision})`;
  return <li>{label}{item.supplier_reference ? ` · provider supplier ${item.supplier_reference}` : ""}: {item.reason}
    {item.resolvable ? <div className="form-row">
      <label>Assign supplier<select value={supplier} onChange={e => setSupplier(e.target.value)} disabled={busy} aria-label={`Supplier for ${label}`}>
        <option value="">Choose a supplier…</option>
        {suppliers.data?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select></label>
      <button className="button secondary" type="button" onClick={resolve} disabled={!supplier || busy}>{busy ? "Assessing…" : "Assess with this supplier"}</button>
    </div> : null}
    {error ? <div className="notice danger" role="alert">{error}</div> : null}
  </li>;
}
