"use client";
import { useI18n } from "@/lib/i18n/provider";
import Link from "next/link";
import type { ReactNode } from "react";
import type { Invoice } from "@/lib/types";


export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`panel ${className}`}>{children}</section>;
}
export function Badge({ status }: { status: string }) {
  const { statusLabel } = useI18n();
  return <span className={`badge badge-${status}`}>{statusLabel(status)}</span>;
}
export function Risk({ invoice }: { invoice: Invoice }) {
  const { t } = useI18n();

  return <span className={`risk risk-${invoice.status}`}><strong>{invoice.risk}</strong><small>{t("100-review-priority")}</small></span>;
}
export function PageHeading({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="page-heading"><div><h1>{title}</h1><p>{description}</p></div>{action}</div>;
}
export function Loading() {
  const { t } = useI18n();
   return <div className="state panel" role="status">{t("loading-local-demo-data")}</div>; }
export function ErrorState({ message, retry }: { message: string; retry: () => void }) {
  const { t, message: localizeMessage } = useI18n();

  return <div className="state panel" role="alert"><h2>{t("could-not-load-this-view")}</h2><p>{localizeMessage(message)}</p><button className="button secondary" onClick={retry}>{t("retry-connection")}</button></div>;
}
export function Empty({ message }: { message?: string }) {
  const { t } = useI18n();
  return <div className="state panel">{message ?? t("no-records-match-these-filters")}</div>;
}
export function InvoiceTable({ invoices }: { invoices: Invoice[] }) {
  const { t, euro, date, riskText } = useI18n();

  return <div className="table-wrap"><table><thead><tr><th scope="col">{t("invoice-supplier")}</th><th scope="col">{t("amount")}</th><th scope="col">{t("submitted")}</th><th scope="col">{t("review-priority")}</th><th scope="col">{t("status")}</th><th scope="col">{t("source")}</th></tr></thead><tbody>
    {invoices.map(invoice => <tr key={invoice.id}>
      <td><Link className="row-link" href={`/app/payments/${encodeURIComponent(invoice.id)}`}><strong><bdi>{invoice.invoice}</bdi></strong><span>{invoice.supplier} · {invoice.id}</span></Link></td>
      <td className="numeric">{euro(invoice.amount_cents)}</td>
      <td className="numeric">{date(invoice.date)}</td>
      <td><strong><bdi>{invoice.risk}/100</bdi></strong><span className="cell-sub">{riskText(invoice.reason)}</span></td>
      <td><Badge status={invoice.status}/></td>
      <td className="muted">{invoice.source === "jinius_demo_adapter" ? t("synthetic-jinius-demo") : invoice.source === "uploaded" ? t("uploaded-invoice") : invoice.source === "synthetic_seed" ? t("synthetic-seed") : t("manual-demo")}</td>
    </tr>)}
  </tbody></table></div>;
}
