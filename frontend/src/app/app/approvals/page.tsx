"use client";

import { useI18n } from "@/lib/i18n/provider";
import Link from "next/link";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/use-api";
import { ErrorState, Loading, PageHeading, Panel } from "@/components/ui/primitives";

export default function Approvals() {
  const { t, euro, p, statusLabel } = useI18n();

  const feed = useApi(api.invoices);
  const invoices = feed.data || [];
  const pending = invoices.filter(item => item.status === "ready" || item.status === "needs_review" || item.status === "hold");
  return <>
    <PageHeading title={t("approval-queue")} description={t("server-controlled-review-decisions-for-this-organization-no")}/>
    {feed.loading ? <Loading/> : feed.error ? <ErrorState message={feed.error} retry={feed.refresh}/> :
      <Panel><div className="section-head"><div><h2>{t("awaiting-a-decision")}</h2><p>{p("awaiting-invoices", pending.length)}</p></div></div>
        {pending.length ? <div className="approval-list">{pending.map(item => <Link key={item.id} href={`/app/payments/${encodeURIComponent(item.id)}`}>
          <span><strong><bdi>{item.supplier}</bdi></strong><small>{item.invoice} · {statusLabel(item.status)}</small></span>
          <span className="numeric">{euro(item.amount_cents)} · {item.risk}/100</span>
        </Link>)}</div> : <p className="muted">{t("no-invoices-are-awaiting-a-decision")}</p>}
      </Panel>}
  </>;
}
