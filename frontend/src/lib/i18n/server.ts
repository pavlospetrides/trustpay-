import { cookies } from "next/headers";
import { cache } from "react";
import { createLocalizer, loadCatalog, localeCookie, resolveLocale } from "./core";

export const requestLanguage = cache(async () => {
  const locale = resolveLocale((await cookies()).get(localeCookie)?.value);
  const catalog = await loadCatalog(locale);
  return { locale, catalog, translation: createLocalizer(locale, catalog) };
});
