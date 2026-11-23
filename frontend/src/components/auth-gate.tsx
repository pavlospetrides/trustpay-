"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { authConfigured, organizationStorageKey, supabaseBrowser } from "@/lib/supabase";

export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(!authConfigured);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!authConfigured) return;
    let alive = true;
    const client = supabaseBrowser();
    const check = async () => {
      try {
        const { data, error: authError } = await client.auth.getUser();
        if (!alive) return;
        if (authError || !data.user) { router.replace("/login"); return; }
        const memberships = await api.organizations();
        if (!alive) return;
        if (!memberships.length) { setError("This account has no TrustPay organization membership."); return; }
        const stored = localStorage.getItem(organizationStorageKey);
        if (!memberships.some(item => item.id === stored)) localStorage.setItem(organizationStorageKey, memberships[0].id);
        setReady(true);
      } catch (cause) {
        if (alive) setError(cause instanceof Error ? cause.message : "Unable to load your organizations");
      }
    };
    queueMicrotask(() => void check());
    const { data: subscription } = client.auth.onAuthStateChange((_event, session) => {
      if (!session) { setReady(false); router.replace("/login"); }
    });
    return () => { alive = false; subscription.subscription.unsubscribe(); };
  }, [router]);
  if (error) return <div className="auth-screen"><div className="panel"><h1>Workspace unavailable</h1><p>{error}</p><Link href="/login" className="button primary">Sign in again</Link></div></div>;
  if (!ready) return <div className="auth-screen" role="status">Checking your workspace…</div>;
  return <>{children}</>;
}
