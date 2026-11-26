"use client";
import { sourceText } from "@/lib/i18n/core";
import { useI18n } from "@/lib/i18n/provider";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import { authConfigured } from "@/lib/supabase";
import { useApi } from "@/hooks/use-api";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Empty, ErrorState, Loading, PageHeading, Panel } from "@/components/ui/primitives";

export default function Audit() {
  const { t, date, time, auditTitle, auditDetail, auditAction, message: localizeMessage } = useI18n();

  const feed = useApi(api.audit);
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("all");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const rows = (feed.data || []).filter(event =>
    (action === "all" || event.action === action) &&
    `${event.title} ${event.detail} ${auditTitle(event)} ${auditDetail(event.detail)} ${auditAction(event.action)} ${event.actor} ${event.invoice_id}`.toLowerCase().includes(search.toLowerCase()),
  );
  async function reset() {
    if (busy) return;
    setBusy(true); setError("");
    try { await api.reset(); setConfirm(false); await feed.refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : sourceText("reset-failed")); }
    finally { setBusy(false); }
  }
  return <>
    <PageHeading title={t("audit-trail")} description={authConfigured ? t("organization-scoped-actions-recorded-by-the-server") : t("persistent-local-events-from-the-server-demo-actor")} action={authConfigured ? undefined : <button className="button secondary" onClick={() => setConfirm(true)}>{t("reset-local-demo")}</button>}/>
    <Panel className="filters audit-filters">
      <label>{t("search-events")}<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder={t("actor-invoice-or-action")}/></label>
      <label>{t("action")}<select value={action} onChange={event => setAction(event.target.value)}><option value="all">{t("all-actions")}</option>{[...new Set((feed.data || []).map(event => event.action))].map(value => <option key={value} value={value}>{auditAction(value)}</option>)}</select></label>
    </Panel>
    {feed.loading ? <Loading/> : feed.error ? <ErrorState message={feed.error} retry={feed.refresh}/> : rows.length ? <Panel className="audit-list">
      {rows.map(event => <article key={event.id} className="audit-event"><span className="activity-dot"/><div><div className="audit-title"><strong>{auditTitle(event)}</strong><span>{date(event.created_at)} · <bdi>{time(event.created_at)} UTC</bdi></span></div><p dir="auto">{auditDetail(event.detail)}</p><small><bdi>{event.actor}</bdi> · {auditAction(event.action)}{event.invoice_id ? <> · <Link href={`/app/payments/${event.invoice_id}`}><bdi>{event.invoice_id}</bdi></Link></> : null}</small></div></article>)}
    </Panel> : <Empty message={t("no-audit-events-match-this-search")}/>}
    <ConfirmationDialog open={confirm} onOpenChange={setConfirm} title={t("reset-synthetic-demo")} confirmLabel={t("reset-demo-data")} onConfirm={reset} busy={busy}>
      <p>{t("this-deletes-local-assessments-and-audit-changes-then")}</p>
      {error ? <p className="notice danger" role="alert">{localizeMessage(error)}</p> : null}
    </ConfirmationDialog>
  </>;
}
