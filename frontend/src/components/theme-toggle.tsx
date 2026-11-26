"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import { useI18n } from "@/lib/i18n/provider";

export function ThemeToggle() {
  const { t } = useI18n();
  const { theme, setTheme } = useTheme();
  const nextTheme = theme === "light" ? "dark" : "light";
  const label = t(nextTheme === "dark" ? "switch-to-dark-theme" : "switch-to-light-theme");
  const Icon = nextTheme === "dark" ? Moon : Sun;

  return (
    <button type="button" className="theme-toggle" aria-label={label} title={label} onClick={() => setTheme(nextTheme)}>
      <Icon size={18} aria-hidden="true"/>
    </button>
  );
}
