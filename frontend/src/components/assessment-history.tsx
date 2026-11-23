"use client";

import { useCallback } from "react";
import { api, date } from "@/lib/api";
import { authConfigured } from "@/lib/supabase";
import { useApi } from "@/hooks/use-api";
import { ErrorState, Loading, Panel } from "./ui/primitives";

export function AssessmentHistoryPanel({ invoiceId }: { invoiceId: string }) {
  const load = useCallback(() => api.assessments(invoiceId), [invoiceId]);
  const feed = useApi(load);
  if (!authConfigured) return null;
  return <Panel className="assessment-history"><h2>Assessment history</h2><p className="muted">Immutable policy snapshots. Scores are review priorities, not fraud probabilities.</p>
    {feed.loading ? <Loading/> : feed.error ? <ErrorState message={feed.error} retry={feed.refresh}/> :
      feed.data?.length ? <ol>{feed.data.map(item => <li key={item.id}>
        <strong>{item.score}/100 · {item.severity}</strong><span>{date(item.assessed_at)} · {item.engine_version}</span>
        <p>{item.explanation}</p><small>{item.evidence.historical_payment_count ?? 0} paid supplier records used</small>
      </li>)}</ol> : <p className="muted">No assessment snapshots found.</p>}
  </Panel>;
}
