"use client";
import { useSyncExternalStore } from "react";
import type { Theme } from "@/lib/crystal";
import { resolveTheme } from "@/lib/crystal";
const eventName = "trustpay-theme-change";
function currentTheme(): Theme { return document.documentElement.dataset.theme === "dark" ? "dark" : "light"; }
function currentPreference(): Theme | "system" { const saved = localStorage.getItem("trustpay-theme"); return saved === "light" || saved === "dark" ? saved : "system"; }
function subscribe(update: () => void) {
  const preference = matchMedia("(prefers-color-scheme: dark)");
  const syncPreference = () => { if (localStorage.getItem("trustpay-theme") === null) { document.documentElement.dataset.theme = resolveTheme(null, preference.matches); update(); } };
  const syncStorage = () => { document.documentElement.dataset.theme = resolveTheme(localStorage.getItem("trustpay-theme"), preference.matches); update(); };
  addEventListener(eventName, update); addEventListener("storage", syncStorage); preference.addEventListener("change", syncPreference);
  return () => { removeEventListener(eventName, update); removeEventListener("storage", syncStorage); preference.removeEventListener("change", syncPreference); };
}
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, currentTheme, () => "light" as Theme);
  const preference = useSyncExternalStore(subscribe, currentPreference, () => "system" as const);
  const setTheme = (next: Theme | "system") => {
    if (next === "system") localStorage.removeItem("trustpay-theme"); else localStorage.setItem("trustpay-theme", next);
    document.documentElement.dataset.theme = resolveTheme(next === "system" ? null : next, matchMedia("(prefers-color-scheme: dark)").matches);
    dispatchEvent(new Event(eventName));
  };
  return { theme, preference, setTheme };
}
