"use client";

import { sourceText } from "@/lib/i18n/core";
import { useI18n } from "@/lib/i18n/provider";
import { LanguageSelector } from "@/components/language-selector";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { authConfigured, organizationStorageKey, supabaseBrowser } from "@/lib/supabase";

export function AuthGate({ children }: { children: ReactNode }) {
  const { t, message: localizeMessage } = useI18n();

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
        if (!memberships.length) { setError(sourceText("this-account-has-no-trustpay-organization-membership")); return; }
        const stored = localStorage.getItem(organizationStorageKey);
        if (!memberships.some(item => item.id === stored)) localStorage.setItem(organizationStorageKey, memberships[0].id);
        setReady(true);
      } catch (cause) {
        if (alive) setError(cause instanceof Error ? cause.message : sourceText("unable-to-load-your-organizations"));
      }
    };
    queueMicrotask(() => void check());
    const { data: subscription } = client.auth.onAuthStateChange((_event, session) => {
      if (!session) { setReady(false); router.replace("/login"); }
    });
    return () => { alive = false; subscription.subscription.unsubscribe(); };
  }, [router]);
  if (error) return <div className="auth-screen"><div className="panel"><LanguageSelector/><h1>{t("workspace-unavailable")}</h1><p>{localizeMessage(error)}</p><Link href="/login" className="button primary">{t("sign-in-again")}</Link></div></div>;
  if (!ready) return <div className="auth-screen" role="status">{t("checking-your-workspace")}</div>;
  return <>{children}</>;
}
