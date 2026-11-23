"use client";
import { ArrowRight, Database, PlugZap, ShieldOff } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/use-api";
import { ErrorState, Loading, PageHeading, Panel } from "@/components/ui/primitives";

export default function Integrations() {
  const feed = useApi(api.integrations);
  const jinius = feed.data?.jinius, payment = feed.data?.bank_payment;
  return <>
    <PageHeading title="Integrations" description="Connection state reported by the local FastAPI service. No browser secrets or connection controls are exposed."/>
    {feed.loading ? <Loading/> : feed.error ? <ErrorState message={feed.error} retry={feed.refresh}/> : <>
      <div className="integration-grid">
        <Panel className="integration-card"><div className="integration-icon"><PlugZap size={24}/></div><span className={`badge ${jinius?.live_connected ? "badge-ready" : "badge-hold"}`}>{jinius?.status === "mock" ? "Mock / disconnected" : jinius?.status || "Unknown"}</span><h2>Jinius</h2><p>Adapter: {jinius?.adapter}. Live connected: {jinius?.live_connected ? "Yes" : "No"}.</p><div className="integration-detail"><strong>Data available</strong><span>Synthetic invoice records through the demo adapter. No live Jinius sync is configured.</span></div><div className="integration-detail"><strong>Next step</strong><span>{jinius?.next_step}</span></div></Panel>
        <Panel className="integration-card"><div className="integration-icon"><ShieldOff size={24}/></div><span className={`badge ${payment?.payment_initiation ? "badge-ready" : "badge-blocked"}`}>{payment?.status}</span><h2>Bank payment</h2><p>Payment initiation: {payment?.payment_initiation ? "Enabled" : "Disabled"}. This demo has no transfer endpoint.</p><div className="integration-detail"><strong>Current state</strong><span>Internal decisions only; no bank confirmation.</span></div></Panel>
      </div>
      <Panel className="flow-panel"><h2>Local data flow</h2><div className="integration-flow"><span><Database size={19}/> Synthetic records</span><ArrowRight size={18}/><span><PlugZap size={19}/> FastAPI risk rules</span><ArrowRight size={18}/><span>Human demo review</span><ArrowRight size={18}/><span>No payment sent</span></div></Panel>
    </>}
  </>;
}
