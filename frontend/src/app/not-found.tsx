"use client";

import Link from "next/link";
import { LanguageSelector } from "@/components/language-selector";
import { useI18n } from "@/lib/i18n/provider";

export default function NotFound() {
  const { t } = useI18n();
  return <main className="auth-screen">
    <section className="panel language-page">
      <LanguageSelector/>
      <h1>{t("page-not-found")}</h1>
      <Link className="button primary" href="/app/overview">{t("return-to-overview")}</Link>
    </section>
  </main>;
}
