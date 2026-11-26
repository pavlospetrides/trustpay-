"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createLocalizer, direction, isLocale, loadCatalog, localeCookie, type Catalog, type Locale } from "./core";
import { presentation } from "./presentation";

function usePresentation(locale: Locale, catalog: Catalog) {
  return useMemo(() => {
    const localizer = createLocalizer(locale, catalog);
    return { ...localizer, ...presentation(localizer) };
  }, [locale, catalog]);
}

const I18nContext = createContext<(ReturnType<typeof usePresentation> & { selectLanguage: (locale: Locale) => Promise<void> }) | null>(null);
const channelKey = "trustpay-language-change";

export function I18nProvider({ initialLocale, initialCatalog, children }: { initialLocale: Locale; initialCatalog: Catalog; children: ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const [selection, setSelection] = useState({ locale: initialLocale, catalog: initialCatalog });
  const request = useRef(0);
  const catalogCache = useRef(new Map([[initialLocale, initialCatalog]]));
  const translation = usePresentation(selection.locale, selection.catalog);

  const applyLanguage = useCallback(async (locale: Locale, persist: boolean) => {
    if (!isLocale(locale)) return;
    const current = ++request.current;
    const catalog = catalogCache.current.get(locale) ?? await loadCatalog(locale);
    if (current !== request.current) return;
    catalogCache.current.set(locale, catalog);
    document.documentElement.lang = locale;
    document.documentElement.dir = direction(locale);
    if (persist) {
      const secure = location.protocol === "https:" ? "; Secure" : "";
      document.cookie = `${localeCookie}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
      try { localStorage.setItem(channelKey, locale); } catch { /* Cookie remains authoritative. */ }
    }
    setSelection({ locale, catalog });
    router.refresh();
  }, [router]);

  useEffect(() => {
    const synchronize = (event: StorageEvent) => {
      if (event.key === channelKey && isLocale(event.newValue)) void applyLanguage(event.newValue, false).catch(() => {});
    };
    window.addEventListener("storage", synchronize);
    return () => window.removeEventListener("storage", synchronize);
  }, [applyLanguage]);

  useEffect(() => {
    document.title = translation.t("meta.title");
    document.querySelector('meta[name="description"]')?.setAttribute("content", translation.t("meta.description"));
  }, [path, translation]);

  useEffect(() => {
    const marked = new Set<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>();
    const localize = (event: Event) => {
      const field = event.target;
      if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement)) return;
      const validity = field.validity;
      if (validity.valid || (validity.customError && !marked.has(field))) return;
      const { t } = translation;
      const message = validity.valueMissing ? t("complete-this-field")
        : validity.typeMismatch && field.type === "email" ? t("please-enter-a-valid-email-address")
        : validity.patternMismatch || validity.badInput ? t("check-the-format-of-this-field")
        : validity.tooShort && "minLength" in field ? t("use-at-least-characters", { p0: field.minLength })
        : t("check-the-value-in-this-field");
      marked.add(field);
      field.setCustomValidity(message);
    };
    const clear = (event: Event) => {
      const field = event.target as HTMLInputElement;
      if (marked.delete(field)) field.setCustomValidity("");
    };
    document.addEventListener("invalid", localize, true);
    document.addEventListener("input", clear);
    document.addEventListener("change", clear);
    return () => {
      document.removeEventListener("invalid", localize, true);
      document.removeEventListener("input", clear);
      document.removeEventListener("change", clear);
      for (const field of marked) field.setCustomValidity("");
    };
  }, [translation]);

  return <I18nContext.Provider value={{ ...translation, selectLanguage: (locale) => applyLanguage(locale, true) }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error("I18nProvider is required");
  return context;
}
