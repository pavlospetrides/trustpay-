"use client";
import { useI18n } from "@/lib/i18n/provider";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback } from "react";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { api } from "@/lib/api";
import { initials, supplierAssessmentSummary } from "@/lib/crystal";
import { useApi } from "@/hooks/use-api";
import { Empty, ErrorState, InvoiceTable, Loading, PageHeading, Panel } from "@/components/ui/primitives";

export default function SupplierProfile() {
  const { t, euro, p, number } = useI18n();

  const { id } = useParams<{ id: string }>();
  const load = useCallback(async () => {
    const [suppliers, invoices] = await Promise.all([api.suppliers(), api.invoices()]);
    return { supplier: suppliers.find(item => item.id === id), invoices };
  }, [id]);
  const feed = useApi(load);
  if (feed.loading && !feed.data) return <Loading/>;
  if (feed.error) return <ErrorState message={feed.error} retry={feed.refresh}/>;
  const supplier = feed.data?.supplier;
  if (!supplier) return <ErrorState message={t("supplier-not-found-in-this-local-demo")} retry={feed.refresh}/>;
  const invoices = feed.data?.invoices.filter(item => item.supplier_id === id) || [];
  const summary = supplierAssessmentSummary(id, feed.data?.invoices || []);
  return <>
    <Link className="back-link" href="/app/suppliers"><ArrowLeft size={17}/> {t("all-suppliers")}</Link>
    <PageHeading title={supplier.name} description={t("supplier-history-from-the-server", { p0: supplier.id })}/>
    <div className="supplier-profile-head panel"><span className="avatar large">{initials(supplier.name)}</span><div><span className="overline">{t("supplier-history-profile")}</span><h2>{p("historical-paid-count", supplier.payment_count)}</h2><p>{t("account-identifiers-are-masked-this-history-does-not")}</p></div></div>
    <div className="metric-grid profile-metrics">
      <Panel><span className="metric-label">{t("historical-median")}</span><strong>{supplier.historical_median_eur === null ? "—" : euro(Math.round(supplier.historical_median_eur * 100))}</strong><small>{t("based-on-paid-records")}</small></Panel>
      <Panel><span className="metric-label">{t("common-destination")}</span><strong><bdi>{supplier.last4}</bdi></strong><small>{t("masked-identifier")}</small></Panel>
      <Panel><span className="metric-label">{t("assessments")}</span><strong>{number(summary.total)}</strong><small>{t("current-local-records")}</small></Panel>
      <Panel><span className="metric-label">{t("flagged-blocked")}</span><strong>{number(summary.flagged)}</strong><small>{t("current-local-records")}</small></Panel>
    </div>
    <Panel className="table-panel"><div className="section-head"><div><h2>{t("assessment-history")}</h2><p>{t("each-decision-is-controlled-by-the-typescript-server")}</p></div><Link href={`/app/payments?supplier=${encodeURIComponent(id)}`}>{t("open-filtered-list")} <ArrowUpRight size={16}/></Link></div>{invoices.length ? <InvoiceTable invoices={invoices}/> : <Empty message={t("no-assessed-invoices-for-this-supplier")}/>}</Panel>
  </>;
}
