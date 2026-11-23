"use client";

import Link from "next/link";
import { api, euro, statusLabel } from "@/lib/api";
import { useApi } from "@/hooks/use-api";
import { ErrorState, Loading, PageHeading, Panel } from "@/components/ui/primitives";

export default function Approvals() {
  const feed = useApi(api.invoices);
  const invoices = feed.data || [];
  const pending = invoices.filter(item => item.status === "ready" || item.status === "needs_review" || item.status === "hold");
  return <>
    <PageHeading title="Approval queue" description="Server-controlled review decisions for this organization. No bank payment is initiated here."/>
    {feed.loading ? <Loading/> : feed.error ? <ErrorState message={feed.error} retry={feed.refresh}/> :
      <Panel><div className="section-head"><div><h2>Awaiting a decision</h2><p>{pending.length} invoices need review or approval.</p></div></div>
        {pending.length ? <div className="approval-list">{pending.map(item => <Link key={item.id} href={`/app/payments/${encodeURIComponent(item.id)}`}>
          <span><strong>{item.supplier}</strong><small>{item.invoice} · {statusLabel(item.status)}</small></span>
          <span className="numeric">{euro(item.amount_cents)} · {item.risk}/100</span>
        </Link>)}</div> : <p className="muted">No invoices are awaiting a decision.</p>}
      </Panel>}
  </>;
}
