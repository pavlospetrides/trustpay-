"use client";
import { useI18n } from "@/lib/i18n/provider";
import Link from "next/link";
import { useCallback } from "react";
import { Fingerprint, ScanSearch } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/use-api";
export function LandingFragment(){
  const { t, message: localizeMessage, riskText } = useI18n();
  const load=useCallback(()=>api.invoice("INV-2409"),[]);const feed=useApi(load);const x=feed.data;return <div className="landing-fragment" data-ui><div className="fragment-header"><ScanSearch size={20}/><span>{t("live-workflow-preview")}</span><span className="fragment-dot"/></div>{feed.error?<div className="fragment-score"><span>{t("local-api-unavailable")}</span><p>{localizeMessage(feed.error)}</p><button className="button secondary" onClick={feed.refresh}>{t("retry-connection")}</button></div>:<div className="fragment-score"><span>{x?.supplier||t("loading-assessment")}</span><strong>{x?.risk??"—"} <small>/ 100</small></strong><p>{x ? riskText(x.reason) : t("reading-the-server-assessment")}</p></div>}<div className="fragment-steps"><span>{t("01-assess")}</span><span>{t("02-verify")}</span><span>{t("03-approve-internally")}</span></div><div className="fragment-foot"><Fingerprint size={18}/>{x?<Link href={`/app/payments/${x.id}`}>{t("inspect-in-the-workspace", { p0: x.invoice })}</Link>:t("scores-come-from-the-local-typescript-server")}</div></div>}
