"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback } from "react";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { api, euro } from "@/lib/api";
import { initials, supplierAssessmentSummary } from "@/lib/crystal";
import { useApi } from "@/hooks/use-api";
import { Empty, ErrorState, InvoiceTable, Loading, PageHeading, Panel } from "@/components/ui/primitives";

export default function SupplierProfile() {
  const { id } = useParams<{ id: string }>();
  const load = useCallback(async () => {
    const [suppliers, invoices] = await Promise.all([api.suppliers(), api.invoices()]);
    return { supplier: suppliers.find(item => item.id === id), invoices };
  }, [id]);
  const feed = useApi(load);
  if (feed.loading && !feed.data) return <Loading/>;
  if (feed.error) return <ErrorState message={feed.error} retry={feed.refresh}/>;
  const supplier = feed.data?.supplier;
  if (!supplier) return <ErrorState message="Supplier not found in this local demo." retry={feed.refresh}/>;
  const invoices = feed.data?.invoices.filter(item => item.supplier_id === id) || [];
  const summary = supplierAssessmentSummary(id, feed.data?.invoices || []);
  return <>
    <Link className="back-link" href="/app/suppliers"><ArrowLeft size={17}/> All suppliers</Link>
    <PageHeading title={supplier.name} description={`Supplier history from FastAPI · ${supplier.id}`}/>
    <div className="supplier-profile-head panel"><span className="avatar large">{initials(supplier.name)}</span><div><span className="overline">SUPPLIER HISTORY PROFILE</span><h2>{supplier.payment_count} historical paid records</h2><p>Account identifiers are masked. This history does not prove legal identity or bank ownership.</p></div></div>
    <div className="metric-grid profile-metrics">
      <Panel><span className="metric-label">Historical median</span><strong>{supplier.historical_median_eur === null ? "—" : euro(Math.round(supplier.historical_median_eur * 100))}</strong><small>Based on paid records</small></Panel>
      <Panel><span className="metric-label">Common destination</span><strong>{supplier.last4}</strong><small>Masked identifier</small></Panel>
      <Panel><span className="metric-label">Assessments</span><strong>{summary.total}</strong><small>Current local records</small></Panel>
      <Panel><span className="metric-label">Flagged / blocked</span><strong>{summary.flagged}</strong><small>Current local records</small></Panel>
    </div>
    <Panel className="table-panel"><div className="section-head"><div><h2>Assessment history</h2><p>Each decision is controlled by the Python service.</p></div><Link href={`/app/payments?supplier=${encodeURIComponent(id)}`}>Open filtered list <ArrowUpRight size={16}/></Link></div>{invoices.length ? <InvoiceTable invoices={invoices}/> : <Empty message="No assessed invoices for this supplier."/>}</Panel>
  </>;
}
