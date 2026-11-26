"use client";
import { useI18n } from "@/lib/i18n/provider";
import type { Invoice } from "@/lib/types";
import { riskLevelCounts } from "@/lib/crystal";
import { Panel } from "./ui/primitives";

export function RiskLevelChart({ invoices }: { invoices: Invoice[] }) {
  const { t, locale, list, levelLabel, number } = useI18n();

  const levels = riskLevelCounts(invoices);
  return <Panel className="risk-level-panel"><div className="section-head"><div><h2>{t("review-priority-levels")}</h2><p>{t("distribution-of-levels-returned-by-the-typescript-server")}</p></div></div>
    {levels.length ? <div className="risk-level-bars" role="img" aria-label={list(levels.map(item => t("chart.level-count", { p0: locale === "en" ? item.level : levelLabel(item.level), p1: number(item.count) })))}>
      {levels.map(item => <div key={item.level} className="risk-level-row"><span>{locale === "en" ? item.level : levelLabel(item.level)}</span><div className="bar-track"><i className={`bar-fill level-${item.level}`} style={{ width: `${item.count / invoices.length * 100}%` }}/></div><strong>{number(item.count)}</strong></div>)}
    </div> : <p className="muted">{t("no-assessed-invoices-are-available")}</p>}
    <p className="chart-note">{t("these-are-current-sample-records-not-a-historical")}</p>
  </Panel>;
}
