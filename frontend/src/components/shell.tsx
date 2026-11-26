"use client";
import { sourceText } from "@/lib/i18n/core";
import { useI18n } from "@/lib/i18n/provider";
import { LanguageSelector } from "@/components/language-selector";
import { ThemeToggle } from "@/components/theme-toggle";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUpRight, ChartNoAxesCombined, LayoutDashboard, ListChecks, Plus, ScrollText, Settings2, ShieldCheck, UsersRound, PlugZap } from "lucide-react";
import { useApi } from "@/hooks/use-api";
import { api } from "@/lib/api";
import { authConfigured, organizationStorageKey, supabaseBrowser } from "@/lib/supabase";

const links = [
  { href: "/app/overview", label: "overview", icon: LayoutDashboard },
  { href: "/app/payments", label: "payments", icon: ListChecks },
  { href: "/app/approvals", label: "approvals", icon: ShieldCheck },
  { href: "/app/suppliers", label: "suppliers", icon: UsersRound },
  { href: "/app/insights", label: "insights", icon: ChartNoAxesCombined },
  { href: "/app/audit", label: "audit-trail", icon: ScrollText },
  { href: "/app/integrations", label: "integrations", icon: PlugZap },
  { href: "/app/settings", label: "settings", icon: Settings2 },
] as const;
function active(path: string, href: string) { return path === href || path.startsWith(`${href}/`); }
function CrystalNav({ path, mobile = false }: { path: string; mobile?: boolean }) {
  const { t, locale } = useI18n();

  const nav = useRef<HTMLElement>(null);
  const marker = useRef<HTMLSpanElement>(null);
  // Adapted from the supplied 21.dev dock: the measured marker follows real Next routes.
  useEffect(() => {
    const container = nav.current, indicator = marker.current;
    if (!container || !indicator) return;
    const adjust = () => {
      const current = container.querySelector<HTMLElement>('[aria-current="page"]');
      if (!current) return;
      indicator.style.width = `${current.offsetWidth}px`;
      indicator.style.height = `${current.offsetHeight}px`;
      indicator.style.transform = `translate(${current.offsetLeft}px, ${current.offsetTop}px)`;
      indicator.dataset.ready = "true";
    };
    const observer = new ResizeObserver(adjust);
    observer.observe(container);
    container.querySelectorAll("a").forEach(link => observer.observe(link));
    adjust();
    return () => observer.disconnect();
  }, [path, mobile, locale]);
  const shown = mobile ? links.slice(0, 4) : links;
  return <nav ref={nav} className={mobile ? "crystal-dock mobile-dock" : "crystal-dock rail-dock"} aria-label={mobile ? t("mobile-navigation") : t("main-navigation")}>
    <span className="dock-indicator" ref={marker} aria-hidden="true"/>
    {shown.map(({ href, label, icon: Icon }) => <Link key={href} href={href} aria-current={active(path, href) ? "page" : undefined}><Icon size={19} aria-hidden="true"/><span>{t(label)}</span></Link>)}
    {mobile && <Link href="/app/settings" aria-current={links.slice(4).some(link => active(path, link.href)) ? "page" : undefined}><Settings2 size={19} aria-hidden="true"/><span>{t("more")}</span></Link>}
  </nav>;
}
function ConnectionStatus() {
  const { t, connectionLabel } = useI18n();

  const feed = useApi(api.integrations);
  const label = feed.error ? t("api-offline") : feed.data ? t("jinius", { p0: connectionLabel(feed.data.jinius.status) }) : t("checking-api");
  return <Link href="/app/integrations" className="connection-pill">{label} <ArrowUpRight size={14}/></Link>;
}
function OrganizationSwitch() {
  const { t } = useI18n();

  const memberships = useApi(api.organizations);
  const [selected, setSelected] = useState("");
  useEffect(() => { queueMicrotask(() => setSelected(localStorage.getItem(organizationStorageKey) || "")); }, []);
  if (memberships.loading || memberships.error || !memberships.data?.length) return null;
  return <label className="organization-switch"><span className="sr-only">{t("organization")}</span><select aria-label={t("organization")} value={selected} onChange={event => { localStorage.setItem(organizationStorageKey, event.target.value); setSelected(event.target.value); window.location.reload(); }}>
    {memberships.data.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
  </select></label>;
}
function LogoutButton() {
  const { t, message: localizeMessage } = useI18n();

  const router = useRouter();
  const [error, setError] = useState("");
  return <><button type="button" className="theme-toggle logout-button" aria-label={t("sign-out")} title={t("sign-out")} onClick={async () => {
    try {
      const result = await supabaseBrowser().auth.signOut();
      if (result.error) { setError(sourceText("sign-out-failed-try-again")); return; }
      localStorage.removeItem(organizationStorageKey); router.replace("/login");
    } catch { setError(sourceText("sign-out-failed-try-again")); }
  }}>{t("sign-out")}</button>{error && <span role="alert">{localizeMessage(error)}</span>}</>;
}
export function Shell({ children }: { children: ReactNode }) {
  const { t } = useI18n();

  const path = usePathname();
  const section = links.find(link => active(path, link.href))?.label ?? "workspace";
  return <div className="shell crystal-shell">
    <aside className="sidebar crystal-sidebar">
      <Link href="/app/overview" className="brand"><span className="brand-mark"><ShieldCheck size={21}/></span><span>TrustPay <em>AI</em></span></Link>
      <div className="rail-label">{t("workspace.heading")} <span>·</span> {authConfigured ? t("secure-review") : t("local-demo.heading")}</div>
      <CrystalNav path={path}/>
      <div className="rail-bottom"><Link href="/app/payments/new" className="button primary"><Plus size={17}/> {t("new-assessment")}</Link><p>{t("no-bank-payment-capability")}</p></div>
    </aside>
    <div className="main-column">
      <header className="topbar crystal-topbar"><div className="breadcrumb"><span className="live-dot"/> TrustPay <span>/</span> {t(section)}</div><div className="top-actions">{authConfigured ? <OrganizationSwitch/> : <span className="demo-pill">{t("demo-sample-data")}</span>}<ConnectionStatus/><LanguageSelector/><ThemeToggle/>{authConfigured && <LogoutButton/>}</div></header>
      <main>{children}</main>
      <footer className="footer">{authConfigured ? t("internal-review-only-no-bank-payment-initiation-or") : t("synthetic-local-demo-no-bank-ownership-verification-real")}</footer>
    </div>
    <CrystalNav path={path} mobile/>
  </div>;
}
