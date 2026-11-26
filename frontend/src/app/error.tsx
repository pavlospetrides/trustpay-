"use client";

import { LanguageSelector } from "@/components/language-selector";
import { useI18n } from "@/lib/i18n/provider";

export default function PageError({ reset }: { reset: () => void }) {
  const { t } = useI18n();
  return <main className="auth-screen">
    <section className="panel language-page">
      <LanguageSelector/>
      <h1>{t("unable-to-display-this-page")}</h1>
      <button className="button primary" onClick={reset}>{t("retry")}</button>
    </section>
  </main>;
}
