import type { Invoice } from "./types";

export type Theme = "light" | "dark";

export function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase() || "").join("");
}

export function resolveTheme(saved: string | null, systemDark: boolean): Theme {
  if (saved === "light" || saved === "dark") return saved;
  return systemDark ? "dark" : "light";
}

export function supplierAssessmentSummary(id: string, invoices: Invoice[]) {
  const own = invoices.filter((invoice) => invoice.supplier_id === id);
  return {
    total: own.length,
    flagged: own.filter((invoice) => ["needs_review", "hold", "blocked"].includes(invoice.status)).length,
    approved: own.filter((invoice) => invoice.status === "approved").length,
  };
}

export function riskLevelCounts(invoices: Invoice[]) {
  const counts = new Map<string, number>();
  invoices.forEach(invoice => counts.set(invoice.level, (counts.get(invoice.level) || 0) + 1));
  return [...counts].map(([level, count]) => ({ level, count }));
}
