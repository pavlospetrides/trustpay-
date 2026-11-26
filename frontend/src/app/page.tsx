"use client";
import { useI18n } from "@/lib/i18n/provider";
import { LanguageSelector } from "@/components/language-selector";
import { ThemeToggle } from "@/components/theme-toggle";
import Link from "next/link";
import { ArrowUpRight, ShieldCheck } from "lucide-react";
import { LandingFragment } from "@/components/landing-fragment";
export default function Home(){
  const { t } = useI18n();
  return <div className="landing">
    <header className="landing-header">
      <Link href="/" className="brand"><span className="brand-mark"><ShieldCheck size={21}/></span><span>TrustPay <em>AI</em></span></Link>
      <div className="public-top-actions">
        <span>{t("local-product-demo")}</span>
        <ThemeToggle/>
        <LanguageSelector/>
      </div>
    </header>
    <main>
      <section className="landing-hero">
        <div className="landing-copy">
          <h1>{t("know-who-you-re-paying")}<br/><span>{t("before-you-pay")}</span></h1>
          <p>{t("supplier-history-invoice-signals-and-a-clear-human")}</p>
          <Link className="button primary big" href="/app/overview">
            {t("open-trustpay-demo")} <ArrowUpRight size={20} aria-hidden="true"/>
          </Link>
          <small>{t("synthetic-local-records-no-transfer-capability")}</small>
        </div>
        <LandingFragment/>
      </section>
      <section className="landing-band">
        <p>{t("every-decision-has-a-reason")}</p>
        <div><span>{t("compare-against-supplier-history")}</span><span>{t("see-the-exact-signals")}</span><span>{t("record-a-simulated-decision")}</span></div>
      </section>
    </main>
    <footer className="landing-footer">TrustPay AI <span>{t("jinius-sandbox-pending-bank-payment-disabled-synthetic-invoices")}</span></footer>
  </div>;
}
