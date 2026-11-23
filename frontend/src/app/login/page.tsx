"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ShieldCheck } from "lucide-react";
import { authConfigured, supabaseBrowser } from "@/lib/supabase";

export default function Login() {
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
    } catch { setError("Sign-in service unavailable. Try again."); }
    finally { setBusy(false); }
  }
  return <main className="auth-screen"><div className="panel auth-card">
    <Link href="/" className="brand"><span className="brand-mark"><ShieldCheck size={21}/></span><span>TrustPay <em>AI</em></span></Link>
    <h1>Sign in to TrustPay</h1><p>Use your organization account to review invoices and payment risk.</p>
    {!authConfigured ? <div className="notice danger" role="alert">Supabase Auth is not configured. This local demo remains available at <Link href="/app/overview">the workspace</Link>.</div> :
      <form onSubmit={submit} className="assessment-form">
        <label>Email<input type="email" name="email" required autoComplete="username"/></label>
        <label>Password<input type="password" name="password" required autoComplete="current-password"/></label>
        {error && <div className="notice danger" role="alert">{error}</div>}
        <button type="submit" className="button primary" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>}
    <p className="muted">Internal review only. TrustPay cannot initiate a bank payment.</p>
  </div></main>;
}
