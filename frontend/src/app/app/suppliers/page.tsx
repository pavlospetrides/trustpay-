"use client";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { api, euro } from "@/lib/api";
import { useApi } from "@/hooks/use-api";
import { initials } from "@/lib/crystal";
import { ErrorState, Loading, PageHeading, Panel } from "@/components/ui/primitives";

export default function Suppliers() {
  const feed = useApi(api.suppliers);
  return <>
    <PageHeading title="Supplier history" description="Paid-history summaries from the local service. Accounts are masked; ownership is not verified."/>
    {feed.loading ? <Loading/> : feed.error ? <ErrorState message={feed.error} retry={feed.refresh}/> : <div className="supplier-grid">
      {feed.data?.map(supplier => <Panel key={supplier.id} className="supplier-card">
        <div className="supplier-top"><span className="avatar large">{initials(supplier.name)}</span><span className="muted">{supplier.id}</span></div>
        <h2>{supplier.name}</h2>
        <div className="supplier-stats">
          <div><span>Paid records</span><strong>{supplier.payment_count}</strong></div>
          <div><span>Historical median</span><strong>{supplier.historical_median_eur === null ? "No history" : euro(Math.round(supplier.historical_median_eur * 100))}</strong></div>
          <div><span>Common destination</span><strong>{supplier.last4}</strong></div>
        </div>
        <Link href={`/app/suppliers/${encodeURIComponent(supplier.id)}`} className="text-link">Open trust profile <ArrowUpRight size={17}/></Link>
      </Panel>)}
    </div>}
  </>;
}
