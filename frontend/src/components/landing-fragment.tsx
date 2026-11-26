"use client";
import { useI18n } from "@/lib/i18n/provider";
import Link from "next/link";
import { useCallback } from "react";
import { Fingerprint, ScanSearch } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/use-api";
import { authConfigured } from "@/lib/supabase";

const sample = { id: "INV-2409", supplier: "Aegean Supplies Ltd", risk: 75 };

export function LandingFragment(){
  const { t, message: localizeMessage, riskText, number } = useI18n();
  const load = useCallback(() => authConfigured ? Promise.resolve(null) : api.invoice(sample.id), []);
  const feed = useApi(load);
  const invoice = feed.data;

  return <div className="landing-fragment" data-ui>
    <div className="fragment-header">
      <ScanSearch size={20} aria-hidden="true"/>
      <span>{authConfigured ? t("sample-workflow-preview") : t("live-workflow-preview")}</span>
    </div>
    {feed.error ? <div className="fragment-score">
      <span>{t("local-api-unavailable")}</span>
      <p>{localizeMessage(feed.error)}</p>
      <button className="button secondary" onClick={feed.refresh}>{t("retry-connection")}</button>
    </div> : <div className="fragment-score">
      <span>{authConfigured ? sample.supplier : invoice?.supplier || t("loading-assessment")}</span>
      <strong><bdi>{authConfigured ? sample.risk : invoice?.risk ?? "—"} <small>/ 100</small></bdi></strong>
      <p>{authConfigured ? t("risk.account-changed", { p0: number(14), p1: number(14) }) : invoice ? riskText(invoice.reason) : t("reading-the-server-assessment")}</p>
    </div>}
    <div className="fragment-steps"><span>{t("01-assess")}</span><span>{t("02-verify")}</span><span>{t("03-approve-internally")}</span></div>
    <div className="fragment-foot">
      <Fingerprint size={18} aria-hidden="true"/>
      {authConfigured ? t("synthetic-seed") : invoice
        ? <Link href={`/app/payments/${invoice.id}`}>{t("inspect-in-the-workspace", { p0: invoice.invoice })}</Link>
        : t("scores-come-from-the-local-typescript-server")}
    </div>
  </div>;
}
