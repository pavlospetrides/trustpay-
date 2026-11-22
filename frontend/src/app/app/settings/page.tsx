"use client";
import Link from "next/link";
import { Moon, Sun, Monitor, ArrowUpRight } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/use-api";
import { useTheme } from "@/hooks/use-theme";
import { ErrorState, Loading, PageHeading, Panel } from "@/components/ui/primitives";
import type { Theme } from "@/lib/crystal";

const options = [
  { id: "light", label: "Light", icon: Sun, description: "Ice-white crystal surfaces" },
  { id: "dark", label: "Dark", icon: Moon, description: "Midnight glass surfaces" },
  { id: "system", label: "System", icon: Monitor, description: "Follow this device" },
] as const;

export default function Settings() {
  const { theme, preference, setTheme } = useTheme();
  const health = useApi(api.health);
  return <>
    <PageHeading title="Workspace settings" description="Local display preferences and the real service state for this demo."/>
    <div className="two-column settings-grid">
      <Panel><div className="section-head"><div><h2>Appearance</h2><p>Choose a theme for this browser.</p></div></div>
        <div className="theme-options" role="group" aria-label="Color theme">
          {options.map(({ id, label, icon: Icon, description }) => <button key={id} type="button" className="theme-option" aria-pressed={preference === id} onClick={() => setTheme(id as Theme | "system")}>
            <Icon size={21} aria-hidden="true"/><span><strong>{label}</strong><small>{description}</small></span>
          </button>)}
        </div>
        <p className="settings-note">Current appearance: <strong>{theme}</strong>. The choice is stored only in this browser.</p>
      </Panel>
      <Panel><div className="section-head"><div><h2>Demo environment</h2><p>Reported by the FastAPI health endpoint.</p></div></div>
        {health.loading ? <Loading/> : health.error ? <ErrorState message={health.error} retry={health.refresh}/> : <dl className="settings-facts">
          <div><dt>Mode</dt><dd>{health.data?.mode}</dd></div>
          <div><dt>Risk engine</dt><dd>{health.data?.risk_model}</dd></div>
          <div><dt>Jinius</dt><dd>{health.data?.jinius_connection}</dd></div>
          <div><dt>Payment initiation</dt><dd>{health.data?.payment_initiation ? "Enabled" : "Disabled"}</dd></div>
        </dl>}
        <Link className="text-link" href="/app/integrations">Inspect integrations <ArrowUpRight size={16}/></Link>
      </Panel>
    </div>
    <Panel className="settings-links"><h2>More workspace views</h2><div><Link href="/app/audit">Audit trail <ArrowUpRight size={16}/></Link><Link href="/app/integrations">Integrations <ArrowUpRight size={16}/></Link><Link href="/app/payments/new">New assessment <ArrowUpRight size={16}/></Link></div></Panel>
  </>;
}
