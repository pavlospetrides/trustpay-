import type { Metadata } from "next";
import Script from "next/script";
import "@fontsource-variable/manrope";
import "./globals.css";
import "./crystal.css";
import "./i18n.css";
import { direction } from "@/lib/i18n/core";
import { requestLanguage } from "@/lib/i18n/server";
import { I18nProvider } from "@/lib/i18n/provider";

export async function generateMetadata(): Promise<Metadata> {
  const { translation } = await requestLanguage();
  return { title: translation.t("meta.title"), description: translation.t("meta.description") };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale, catalog } = await requestLanguage();
  return <html lang={locale} dir={direction(locale)} suppressHydrationWarning>
    <body suppressHydrationWarning>
      <Script src="/theme-init.js" strategy="beforeInteractive"/>
      <I18nProvider initialLocale={locale} initialCatalog={catalog}>{children}</I18nProvider>
    </body>
  </html>;
}
