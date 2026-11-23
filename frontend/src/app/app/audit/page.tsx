"use client";
import Link from "next/link";
import { useState } from "react";
import { api, date } from "@/lib/api";
import { authConfigured } from "@/lib/supabase";
import { useApi } from "@/hooks/use-api";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Empty, ErrorState, Loading, PageHeading, Panel } from "@/components/ui/primitives";

export default function Audit() {
  const feed = useApi(api.audit);
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("all");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const rows = (feed.data || []).filter(event =>
    (action === "all" || event.action === action) &&
    `${event.title} ${event.detail} ${event.actor} ${event.invoice_id}`.toLowerCase().includes(search.toLowerCase()),
  );
  async function reset() {
    if (busy) return;
    setBusy(true); setError("");
    try { await api.reset(); setConfirm(false); await feed.refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Reset failed"); }
    finally { setBusy(false); }
  }
  return <>
    <PageHeading title="Audit trail" description={authConfigured ? "Organization-scoped actions recorded by FastAPI." : "Persistent local events from FastAPI. Demo actor labels are not authenticated identities."} action={authConfigured ? undefined : <button className="button secondary" onClick={() => setConfirm(true)}>Reset local demo</button>}/>
    <Panel className="filters audit-filters">
      <label>Search events<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Actor, invoice, or action"/></label>
      <label>Action<select value={action} onChange={event => setAction(event.target.value)}><option value="all">All actions</option>{[...new Set((feed.data || []).map(event => event.action))].map(value => <option key={value}>{value}</option>)}</select></label>
    </Panel>
    {feed.loading ? <Loading/> : feed.error ? <ErrorState message={feed.error} retry={feed.refresh}/> : rows.length ? <Panel className="audit-list">
      {rows.map(event => <article key={event.id} className="audit-event"><span className="activity-dot"/><div><div className="audit-title"><strong>{event.title}</strong><span>{date(event.created_at)} · {event.created_at.slice(11, 16)} UTC</span></div><p>{event.detail}</p><small>{event.actor} · {event.action}{event.invoice_id ? <> · <Link href={`/app/payments/${event.invoice_id}`}>{event.invoice_id}</Link></> : null}</small></div></article>)}
    </Panel> : <Empty message="No audit events match this search."/>}
    <ConfirmationDialog open={confirm} onOpenChange={setConfirm} title="Reset synthetic demo?" confirmLabel="Reset demo data" onConfirm={reset} busy={busy}>
      <p>This deletes local assessments and audit changes, then reseeds the original four invoices. This cannot be undone.</p>
      {error ? <p className="notice danger" role="alert">{error}</p> : null}
    </ConfirmationDialog>
  </>;
}
