import { describe, expect, it } from "vitest";
import { initials, resolveTheme, riskLevelCounts, supplierAssessmentSummary } from "./crystal";
import type { Invoice } from "./types";

const invoice = (supplier_id: string, status: Invoice["status"]): Invoice => ({
  id: `${supplier_id}-${status}`, supplier_id, status, supplier: supplier_id,
  short: supplier_id, invoice: "DEMO-01", amount_cents: 10000, amount: 100,
  iban: "•••• 9077", previous: "•••• 1842", history: 14, date: "2026-11-19",
  risk: 75, level: "high", kind: "account_change", reason: "Changed account",
  signals: [], notes: [], verified: false, verified_by: null, approved_by: null,
  reference: "Jinius synthetic demo", source: "jinius_demo_adapter",
});

describe("crystal view model", () => {
  it("honors saved theme and otherwise honors system preference", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme(null, true)).toBe("dark");
    expect(resolveTheme(null, false)).toBe("light");
    expect(resolveTheme("invalid", false)).toBe("light");
  });

  it("summarizes only the selected supplier's assessments", () => {
    expect(supplierAssessmentSummary("SUP-001", [
      invoice("SUP-001", "needs_review"), invoice("SUP-002", "blocked"), invoice("SUP-001", "approved"),
    ])).toEqual({ total: 2, flagged: 1, approved: 1 });
  });
  it("keeps long supplier names compact in the avatar", () => {
    expect(initials("Meridian Office Ltd")).toBe("MO");
    expect(initials("Aegean Supplies Ltd")).toBe("AS");
  });
  it("counts risk levels returned by the API without recalculating risk", () => {
    const rows = [invoice("SUP-001", "needs_review"), invoice("SUP-002", "blocked")];
    rows[1].level = "critical";
    expect(riskLevelCounts(rows)).toEqual([{ level: "high", count: 1 }, { level: "critical", count: 1 }]);
  });
});
