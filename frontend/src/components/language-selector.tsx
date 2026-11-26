"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown, Globe2 } from "lucide-react";
import { useState } from "react";
import { direction, isLocale, languages, locales } from "@/lib/i18n/core";
import { useI18n } from "@/lib/i18n/provider";

export function LanguageSelector() {
  const { locale, selectLanguage, t } = useI18n();
  const [error, setError] = useState(false);

  function changeLanguage(next: string) {
    if (!isLocale(next)) return;
    setError(false);
    void selectLanguage(next).catch(() => setError(true));
  }

  return <div className="language-control">
    <DropdownMenu.Root dir={direction(locale)} modal={false}>
      <DropdownMenu.Trigger className="language-selector">
        <Globe2 className="language-globe" size={16} aria-hidden="true"/>
        <span className="sr-only">{t("language")}</span>
        <bdi lang={locale}>{languages[locale]}</bdi>
        <ChevronDown className="language-chevron" size={14} aria-hidden="true"/>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="language-menu" align="end" sideOffset={8} collisionPadding={12} loop>
          <DropdownMenu.RadioGroup value={locale} onValueChange={changeLanguage}>
            {locales.map(value => <DropdownMenu.RadioItem
              className="language-option" key={value} value={value} textValue={languages[value]}
            >
              <bdi lang={value}>{languages[value]}</bdi>
              <DropdownMenu.ItemIndicator className="language-check">
                <Check size={16} aria-hidden="true"/>
              </DropdownMenu.ItemIndicator>
            </DropdownMenu.RadioItem>)}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
    {error && <span className="language-error" role="alert">{t("please-try-again")}</span>}
  </div>;
}
