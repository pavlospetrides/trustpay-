import { describe, expect, it } from "vitest";
import { createLocalizer, direction, loadCatalog, resolveLocale, sourceText } from "./core";
import { presentation } from "./presentation";

describe("TrustPay localization", () => {
  it("defaults to English for absent, unsupported or non-canonical preferences", () => {
    for (const value of [undefined, null, "en-US", "he-IL", "DE", "__proto__"]) expect(resolveLocale(value)).toBe("en");
    expect(resolveLocale("he")).toBe("he");
    expect(direction("he")).toBe("rtl");
    expect(direction("el")).toBe("ltr");
  });

  it("loads locale resources and applies Russian plural rules", async () => {
    const ru = createLocalizer("ru", await loadCatalog("ru"));
    expect([1, 2, 5, 21].map(count => ru.p("assessment-count", count))).toEqual([
      "1 проверка", "2 проверки", "5 проверок", "21 проверка",
    ]);
    expect(ru.euro(842001)).toBe(new Intl.NumberFormat("ru-RU", { style: "currency", currency: "EUR" }).format(8420.01));
  });

  it("falls back to readable English and preserves canonical API copy", () => {
    const incomplete = createLocalizer("he", {});
    expect(incomplete.t("language")).toBe("Language");
    expect(sourceText("request-failed", { p0: 403 })).toBe("Request failed (403)");
    const original = sourceText("risk.large-amount", { p0: "3.0", p1: 12, p2: "4,960.00" });
    expect(presentation(incomplete).riskText(original)).toBe(original);
  });

  it("localizes existing risk, audit and API text without translating evidence", async () => {
    const greek = createLocalizer("el", await loadCatalog("el"));
    const he = createLocalizer("he", await loadCatalog("he"));
    const localized = presentation(greek);
    const detail = sourceText("risk.large-amount", { p0: "3.0", p1: 12, p2: "4,960.00" });
    expect(localized.riskText(detail)).toContain(greek.euro(496000));
    expect(localized.message("Invoice not found")).toBe("Το τιμολόγιο δεν βρέθηκε");
    const mixed = presentation(he).auditDetail("INV-2409 · analyst supplied evidence: Callback by Alex");
    expect(mixed).toContain("\u2068INV-2409\u2069");
    expect(mixed).toContain("\u2068Callback by Alex\u2069");
  });

  it("formats a saved calendar day without changing it across time zones", async () => {
    const locale = createLocalizer("el", await loadCatalog("el"));
    expect(locale.date("2026-11-23")).toBe(locale.date("2026-11-23T22:30:00Z"));
    expect(locale.date("2026-11-23")).not.toBe(locale.date("2026-11-24"));
  });
});
