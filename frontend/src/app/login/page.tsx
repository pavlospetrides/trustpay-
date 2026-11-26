"use client";

import { sourceText } from "@/lib/i18n/core";
import { useI18n } from "@/lib/i18n/provider";
import { LanguageSelector } from "@/components/language-selector";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ShieldCheck } from "lucide-react";
import { authConfigured, supabaseBrowser } from "@/lib/supabase";

export default function Login() {
  const { t, message: localizeMessage } = useI18n();

  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try {
      const { error: loginError } = await supabaseBrowser().auth.signInWithPassword({
        email: String(form.get("email") || ""), password: String(form.get("password") || ""),
      });
      if (loginError) { setError(loginError.message); return; }
      router.replace("/app/overview");
    } catch { setError(sourceText("sign-in-service-unavailable-try-again")); }
    finally { setBusy(false); }
  }
  return <main className="auth-screen"><div className="panel auth-card"><div className="auth-top-actions">
    <Link href="/" className="brand"><span className="brand-mark"><ShieldCheck size={21}/></span><span>TrustPay <em>AI</em></span></Link><LanguageSelector/></div>
    <h1>{t("sign-in-to-trustpay")}</h1><p>{t("use-your-organization-account-to-review-invoices-and")}</p>
    {!authConfigured ? <div className="notice danger" role="alert">{t("supabase-auth-is-not-configured-this-local-demo")} <Link href="/app/overview">{t("the-workspace")}</Link>.</div> :
      <form onSubmit={submit} className="assessment-form">
        <label>{t("email")}<input type="email" dir="ltr" name="email" required autoComplete="username"/></label>
        <label>{t("password")}<input type="password" name="password" required autoComplete="current-password"/></label>
        {error && <div className="notice danger" role="alert">{localizeMessage(error)}</div>}
        <button type="submit" className="button primary" disabled={busy}>{busy ? t("signing-in") : t("sign-in")}</button>
      </form>}
    <p className="muted">{t("internal-review-only-trustpay-cannot-initiate-a-bank")}</p>
  </div></main>;
}
