"use client";
import { useI18n } from "@/lib/i18n/provider";
import { LanguageSelector } from "@/components/language-selector";
import Link from "next/link";
import { Moon, Sun, Monitor, ArrowUpRight } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/use-api";
import { useTheme } from "@/hooks/use-theme";
import { ErrorState, Loading, PageHeading, Panel } from "@/components/ui/primitives";
import type { Theme } from "@/lib/crystal";

const options = [
  { id: "light", label: "light", icon: Sun, description: "ice-white-crystal-surfaces" },
  { id: "dark", label: "dark", icon: Moon, description: "midnight-glass-surfaces" },
  { id: "system", label: "system", icon: Monitor, description: "follow-this-device" },
] as const;

export default function Settings() {
  const { t, modeLabel, connectionLabel } = useI18n();

  const { theme, preference, setTheme } = useTheme();
  const health = useApi(api.health);
  return <>
    <PageHeading title={t("workspace-settings")} description={t("local-display-preferences-and-the-real-service-state")} action={<LanguageSelector/>}/>
    <div className="two-column settings-grid">
      <Panel><div className="section-head"><div><h2>{t("appearance")}</h2><p>{t("choose-a-theme-for-this-browser")}</p></div></div>
        <div className="theme-options" role="group" aria-label={t("color-theme")}>
          {options.map(({ id, label, icon: Icon, description }) => <button key={id} type="button" className="theme-option" aria-pressed={preference === id} onClick={() => setTheme(id as Theme | "system")}>
            <Icon size={21} aria-hidden="true"/><span><strong>{t(label)}</strong><small>{t(description)}</small></span>
          </button>)}
        </div>
        <p className="settings-note">{t("current-appearance")} <strong>{t(theme)}</strong>{t("the-choice-is-stored-only-in-this-browser")}</p>
      </Panel>
      <Panel><div className="section-head"><div><h2>{t("demo-environment")}</h2><p>{t("reported-by-the-server-health-endpoint")}</p></div></div>
        {health.loading ? <Loading/> : health.error ? <ErrorState message={health.error} retry={health.refresh}/> : <dl className="settings-facts">
          <div><dt>{t("mode")}</dt><dd>{health.data && modeLabel(health.data.mode)}</dd></div>
          <div><dt>{t("risk-engine")}</dt><dd>{health.data && modeLabel(health.data.risk_model)}</dd></div>
          <div><dt>Jinius</dt><dd>{health.data && connectionLabel(health.data.jinius_connection)}</dd></div>
          <div><dt>{t("payment-initiation-2")}</dt><dd>{health.data?.payment_initiation ? t("enabled") : t("disabled")}</dd></div>
        </dl>}
        <Link className="text-link" href="/app/integrations">{t("inspect-integrations")} <ArrowUpRight size={16}/></Link>
      </Panel>
    </div>
    <Panel className="settings-links"><h2>{t("more-workspace-views")}</h2><div><Link href="/app/audit">{t("audit-trail")} <ArrowUpRight size={16}/></Link><Link href="/app/integrations">{t("integrations")} <ArrowUpRight size={16}/></Link><Link href="/app/payments/new">{t("new-assessment")} <ArrowUpRight size={16}/></Link></div></Panel>
  </>;
}
