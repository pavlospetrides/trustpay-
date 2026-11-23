"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUpRight, ChartNoAxesCombined, LayoutDashboard, ListChecks, Moon, Plus, ScrollText, Settings2, ShieldCheck, Sun, UsersRound, PlugZap } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import { useApi } from "@/hooks/use-api";
import { api } from "@/lib/api";
import { authConfigured, organizationStorageKey, supabaseBrowser } from "@/lib/supabase";

const links = [
  { href: "/app/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/app/payments", label: "Payments", icon: ListChecks },
  { href: "/app/approvals", label: "Approvals", icon: ShieldCheck },
  { href: "/app/suppliers", label: "Suppliers", icon: UsersRound },
  { href: "/app/insights", label: "Insights", icon: ChartNoAxesCombined },
  { href: "/app/audit", label: "Audit trail", icon: ScrollText },
  { href: "/app/integrations", label: "Integrations", icon: PlugZap },
  { href: "/app/settings", label: "Settings", icon: Settings2 },
];
function active(path: string, href: string) { return path === href || path.startsWith(`${href}/`); }
function CrystalNav({ path, mobile = false }: { path: string; mobile?: boolean }) {
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
  }, [path, mobile]);
  const shown = mobile ? links.slice(0, 4) : links;
  return <nav ref={nav} className={mobile ? "crystal-dock mobile-dock" : "crystal-dock rail-dock"} aria-label={mobile ? "Mobile navigation" : "Main navigation"}>
    <span className="dock-indicator" ref={marker} aria-hidden="true"/>
    {shown.map(({ href, label, icon: Icon }) => <Link key={href} href={href} aria-current={active(path, href) ? "page" : undefined}><Icon size={19} aria-hidden="true"/><span>{label}</span></Link>)}
    {mobile && <Link href="/app/settings" aria-current={links.slice(4).some(link => active(path, link.href)) ? "page" : undefined}><Settings2 size={19} aria-hidden="true"/><span>More</span></Link>}
  </nav>;
}
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return <button type="button" className="theme-toggle" aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`} onClick={() => setTheme(theme === "light" ? "dark" : "light")}>{theme === "light" ? <Moon size={18} aria-hidden="true"/> : <Sun size={18} aria-hidden="true"/>}</button>;
}
function ConnectionStatus() {
  const feed = useApi(api.integrations);
  const label = feed.error ? "API offline" : feed.data ? `Jinius ${feed.data.jinius.status}` : "Checking API";
  return <Link href="/app/integrations" className="connection-pill">{label} <ArrowUpRight size={14}/></Link>;
}
function OrganizationSwitch() {
  const memberships = useApi(api.organizations);
  const [selected, setSelected] = useState("");
  useEffect(() => { queueMicrotask(() => setSelected(localStorage.getItem(organizationStorageKey) || "")); }, []);
  if (memberships.loading || memberships.error || !memberships.data?.length) return null;
  return <label className="organization-switch"><span className="sr-only">Organization</span><select aria-label="Organization" value={selected} onChange={event => { localStorage.setItem(organizationStorageKey, event.target.value); setSelected(event.target.value); window.location.reload(); }}>
    {memberships.data.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
  </select></label>;
}
function LogoutButton() {
  const router = useRouter();
  const [error, setError] = useState("");
  return <><button type="button" className="theme-toggle" aria-label="Sign out" title="Sign out" onClick={async () => {
    try {
      const result = await supabaseBrowser().auth.signOut();
      if (result.error) { setError("Sign out failed. Try again."); return; }
      localStorage.removeItem(organizationStorageKey); router.replace("/login");
    } catch { setError("Sign out failed. Try again."); }
  }}>Sign out</button>{error && <span role="alert">{error}</span>}</>;
}
export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const section = links.find(link => active(path, link.href))?.label || "Workspace";
  return <div className="shell crystal-shell">
    <aside className="sidebar crystal-sidebar">
      <Link href="/app/overview" className="brand"><span className="brand-mark"><ShieldCheck size={21}/></span><span>TrustPay <em>AI</em></span></Link>
      <div className="rail-label">WORKSPACE <span>·</span> {authConfigured ? "SECURE REVIEW" : "LOCAL DEMO"}</div>
      <CrystalNav path={path}/>
      <div className="rail-bottom"><Link href="/app/payments/new" className="button primary"><Plus size={17}/> New assessment</Link><p>No bank payment capability</p></div>
    </aside>
    <div className="main-column">
      <header className="topbar crystal-topbar"><div className="breadcrumb"><span className="live-dot"/> TrustPay <span>/</span> {section}</div><div className="top-actions">{authConfigured ? <OrganizationSwitch/> : <span className="demo-pill">Demo / Sample Data</span>}<ConnectionStatus/><ThemeToggle/>{authConfigured && <LogoutButton/>}</div></header>
      <main>{children}</main>
      <footer className="footer">{authConfigured ? "Internal review only · No bank payment initiation or live Jinius connection." : "Synthetic local demo · No bank ownership verification, real AI model, or payment initiation."}</footer>
    </div>
    <CrystalNav path={path} mobile/>
  </div>;
}
