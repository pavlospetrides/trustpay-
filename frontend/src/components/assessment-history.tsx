"use client";

import { useI18n } from "@/lib/i18n/provider";
import { useCallback } from "react";
import { api } from "@/lib/api";
import { authConfigured } from "@/lib/supabase";
import { useApi } from "@/hooks/use-api";
import { ErrorState, Loading, Panel } from "./ui/primitives";

export function AssessmentHistoryPanel({ invoiceId }: { invoiceId: string }) {
  const { t, date, p, levelLabel, riskText } = useI18n();

  const load = useCallback(() => api.assessments(invoiceId), [invoiceId]);
  const feed = useApi(load);
  if (!authConfigured) return null;
  return <Panel className="assessment-history"><h2>{t("assessment-history")}</h2><p className="muted">{t("immutable-policy-snapshots-scores-are-review-priorities-not")}</p>
    {feed.loading ? <Loading/> : feed.error ? <ErrorState message={feed.error} retry={feed.refresh}/> :
      feed.data?.length ? <ol>{feed.data.map(item => <li key={item.id}>
        <strong><bdi>{item.score}/100</bdi> · {levelLabel(item.severity)}</strong><span>{date(item.assessed_at)} · {item.engine_version}</span>
        <p>{riskText(item.explanation)}</p><small>{p("used-paid-record-count", item.evidence.historical_payment_count ?? 0)}</small>
      </li>)}</ol> : <p className="muted">{t("no-assessment-snapshots-found")}</p>}
  </Panel>;
}
