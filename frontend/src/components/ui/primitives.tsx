import Link from "next/link";
import type { ReactNode } from "react";
import type { Invoice } from "@/lib/types";
import { date, euro, statusLabel } from "@/lib/api";

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`panel ${className}`}>{children}</section>;
}
export function Badge({ status }: { status: string }) {
  return <span className={`badge badge-${status}`}>{statusLabel(status)}</span>;
}
export function Risk({ invoice }: { invoice: Invoice }) {
  return <span className={`risk risk-${invoice.status}`}><strong>{invoice.risk}</strong><small>/ 100 · review priority</small></span>;
}
export function PageHeading({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="page-heading"><div><h1>{title}</h1><p>{description}</p></div>{action}</div>;
}
export function Loading() { return <div className="state panel" role="status">Loading local demo data…</div>; }
export function ErrorState({ message, retry }: { message: string; retry: () => void }) {
  return <div className="state panel" role="alert"><h2>Could not load this view</h2><p>{message}</p><button className="button secondary" onClick={retry}>Retry connection</button></div>;
}
export function Empty({ message = "No records match these filters." }: { message?: string }) {
  return <div className="state panel">{message}</div>;
}
export function InvoiceTable({ invoices }: { invoices: Invoice[] }) {
  return <div className="table-wrap"><table><thead><tr><th scope="col">Invoice / supplier</th><th scope="col">Amount</th><th scope="col">Submitted</th><th scope="col">Review priority</th><th scope="col">Status</th><th scope="col">Source</th></tr></thead><tbody>
    {invoices.map(invoice => <tr key={invoice.id}>
      <td><Link className="row-link" href={`/app/payments/${encodeURIComponent(invoice.id)}`}><strong>{invoice.invoice}</strong><span>{invoice.supplier} · {invoice.id}</span></Link></td>
      <td className="numeric">{euro(invoice.amount_cents)}</td>
      <td className="numeric">{date(invoice.date)}</td>
      <td><strong>{invoice.risk}/100</strong><span className="cell-sub">{invoice.reason}</span></td>
      <td><Badge status={invoice.status}/></td>
      <td className="muted">{invoice.source === "jinius_demo_adapter" ? "Synthetic Jinius demo" : invoice.source === "uploaded" ? "Uploaded invoice" : invoice.source === "synthetic_seed" ? "Synthetic seed" : "Manual demo"}</td>
    </tr>)}
  </tbody></table></div>;
}
