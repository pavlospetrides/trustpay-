"use client";
import { useI18n } from "@/lib/i18n/provider";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/use-api";
import { initials } from "@/lib/crystal";
import { ErrorState, Loading, PageHeading, Panel } from "@/components/ui/primitives";

export default function Suppliers() {
  const { t, euro, number } = useI18n();

  const feed = useApi(api.suppliers);
  return <>
    <PageHeading title={t("supplier-history")} description={t("paid-history-summaries-from-the-local-service-accounts")}/>
    {feed.loading ? <Loading/> : feed.error ? <ErrorState message={feed.error} retry={feed.refresh}/> : <div className="supplier-grid">
      {feed.data?.map(supplier => <Panel key={supplier.id} className="supplier-card">
        <div className="supplier-top"><span className="avatar large">{initials(supplier.name)}</span><span className="muted"><bdi>{supplier.id}</bdi></span></div>
        <h2><bdi>{supplier.name}</bdi></h2>
        <div className="supplier-stats">
          <div><span>{t("paid-records")}</span><strong>{number(supplier.payment_count)}</strong></div>
          <div><span>{t("historical-median")}</span><strong>{supplier.historical_median_eur === null ? t("no-history") : euro(Math.round(supplier.historical_median_eur * 100))}</strong></div>
          <div><span>{t("common-destination")}</span><strong><bdi>{supplier.last4}</bdi></strong></div>
        </div>
        <Link href={`/app/suppliers/${encodeURIComponent(supplier.id)}`} className="text-link">{t("open-trust-profile")} <ArrowUpRight size={17}/></Link>
      </Panel>)}
    </div>}
  </>;
}
