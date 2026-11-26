import { expect, test, type Page } from "@playwright/test";

const pages = ["/", "/login", "/app/overview", "/app/payments", "/app/payments/INV-2409", "/app/payments/INV-2410",
  "/app/payments/new", "/app/approvals", "/app/suppliers", "/app/suppliers/SUP-001", "/app/insights",
  "/app/audit", "/app/integrations", "/app/settings", "/missing-page"];

async function noPageOverflow(page: Page) {
  const widths = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth }));
  expect(widths.document, page.url() + " at " + widths.viewport + " px").toBeLessThanOrEqual(widths.viewport + 1);
}

const languageNames = ["English", "Ελληνικά", "Русский", "עברית"];

async function chooseLanguage(page: Page, from: string, to: string) {
  await page.getByRole("button", { name: from, exact: true }).click();
  await page.getByRole("menuitemradio", { name: to, exact: true }).click();
  await expect(page.getByRole("menu")).toHaveCount(0);
}

for (const [locale, languageName, label, dashboard] of [
  ["en", "English", "Language", "Payment clarity, in one view."],
  ["el", "Ελληνικά", "Γλώσσα", "Σαφής εικόνα των πληρωμών σας."],
  ["ru", "Русский", "Язык", "Общая картина платежей."],
  ["he", "עברית", "שפה", "תמונת מצב ברורה של התשלומים."],
] as const) {
  test(`${locale}: language stays consistent across pages and screen sizes`, async ({ page, context }, testInfo) => {
    await context.addCookies([{ name: "trustpay-language", value: locale, url: "http://127.0.0.1:32190" }]);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const hydrationErrors: string[] = [];
    page.on("console", event => {
      if (event.type() === "error" && /hydrat/i.test(event.text())) hydrationErrors.push(event.text());
    });
    await page.setViewportSize({ width: 1440, height: 1040 });
    for (const path of pages) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(path === "/missing-page" ? 404 : 200);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.locator("html")).toHaveAttribute("dir", locale === "he" ? "rtl" : "ltr");
      await expect(page.getByRole("button", { name: `${label} ${languageName}`, exact: true }).first()).toHaveAttribute("aria-expanded", "false");
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
      await noPageOverflow(page);
      if (path === "/app/overview") {
        await expect(page.getByRole("heading", { name: dashboard })).toBeVisible();
        if (process.env.TRUSTPAY_LOCALE_SCREENSHOTS) await page.screenshot({ path: testInfo.outputPath("dashboard.png"), fullPage: true });
      }
    }
    for (const width of [768, 320]) {
      await page.setViewportSize({ width, height: 900 });
      for (const path of pages) {
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
        await noPageOverflow(page);
        if (locale === "he" && width === 320 && path === "/app/payments/INV-2409" && process.env.TRUSTPAY_LOCALE_SCREENSHOTS) {
          await page.screenshot({ path: testInfo.outputPath("invoice-rtl-mobile.png"), fullPage: true });
        }
      }
    }
    expect(hydrationErrors).toEqual([]);
  });

  test(`${locale}: the open language menu fits on public and workspace pages`, async ({ page, context }, testInfo) => {
    const rtl = locale === "he";
    await context.addCookies([{ name: "trustpay-language", value: locale, url: "http://127.0.0.1:32190" }]);
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const width of [1440, 768, 320]) {
      await page.setViewportSize({ width, height: 800 });
      for (const path of ["/", "/login", "/app/overview", "/app/settings"]) {
        await page.goto(path);
        const trigger = page.getByRole("button", { name: `${label} ${languageName}`, exact: true }).last();
        const heading = page.getByRole("heading", { level: 1 }).first();
        await expect(heading).toBeVisible();
        await page.evaluate(async () => { await document.fonts.ready; });
        const anchor = (await trigger.boundingBox())!;
        await trigger.click();
        await expect(trigger).toHaveAttribute("aria-expanded", "true");
        const menu = page.getByRole("menu", { name: `${label} ${languageName}`, exact: true });
        await expect(menu.getByRole("menuitemradio")).toHaveText(languageNames);
        const selected = menu.getByRole("menuitemradio", { checked: true });
        await expect(selected).toHaveText(languageName);
        await expect(selected.locator(".language-check")).toBeVisible();
        await expect(menu).toHaveCSS("direction", rtl ? "rtl" : "ltr");
        const box = (await menu.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(11);
        expect(box.x + box.width).toBeLessThanOrEqual(width - 11);
        expect(box.y).toBeGreaterThanOrEqual(11);
        expect(box.y + box.height).toBeLessThanOrEqual(789);
        if (path === "/") {
          expect(Math.abs(rtl ? box.x - anchor.x : box.x + box.width - anchor.x - anchor.width)).toBeLessThanOrEqual(1);
        }
        expect(await trigger.boundingBox()).toEqual(anchor);
        await noPageOverflow(page);
        if (path === "/app/overview" && process.env.TRUSTPAY_LOCALE_SCREENSHOTS) {
          await page.screenshot({ path: testInfo.outputPath(`language-menu-${width}.png`), clip: { x: 0, y: 0, width, height: 325 } });
        }
        await page.keyboard.press("Escape");
        await expect(menu).toHaveCount(0);
        await expect(trigger).toBeFocused();
      }
    }
  });
}

test("the language menu supports keyboard selection and dismisses without stealing outside focus", async ({ page }) => {
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "Language English", exact: true });
  const menu = page.getByRole("menu");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(menu.getByRole("menuitemradio", { name: "English" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("menuitemradio", { name: "Ελληνικά" })).toBeFocused();
  await page.keyboard.press("End");
  await expect(menu.getByRole("menuitemradio", { name: "עברית" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");

  await page.keyboard.press("Space");
  await expect(menu.getByRole("menuitemradio", { name: "English" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("menuitemradio", { name: "Ελληνικά" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(menu).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute("lang", "el");
  const greekTrigger = page.getByRole("button", { name: "Γλώσσα Ελληνικά", exact: true });
  await expect(greekTrigger).toBeFocused();
  await greekTrigger.click();
  await expect(menu).toBeVisible();
  await page.getByRole("heading", { level: 1 }).click();
  await expect(menu).toHaveCount(0);
  await expect(greekTrigger).not.toBeFocused();
});

test("the mobile language menu uses touch targets and switches out of Hebrew", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, hasTouch: true, isMobile: true, viewport: { width: 320, height: 640 } });
  try {
    await context.addCookies([{ name: "trustpay-language", value: "he", url: baseURL! }]);
    const page = await context.newPage();
    await page.goto("/app/overview");
    const trigger = page.getByRole("button", { name: "שפה עברית", exact: true });
    expect((await trigger.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await trigger.tap();
    const option = page.getByRole("menuitemradio", { name: "Русский", exact: true });
    await expect.poll(async () => (await option.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await option.tap();
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(page.locator("html")).toHaveAttribute("lang", "ru");
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  } finally { await context.close(); }
});

test("English starts first, switching updates the page immediately, and Hebrew survives reload and navigation", async ({ browser }) => {
  const context = await browser.newContext({ locale: "ru-RU" });
  const page = await context.newPage();
  try {
    await page.goto("http://127.0.0.1:32190/app/overview");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await chooseLanguage(page, "Language English", "עברית");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { name: "תמונת מצב ברורה של התשלומים." })).toBeVisible();
    await expect(page).toHaveTitle(/דעו למי אתם משלמים/);
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "he");
    await page.getByRole("navigation", { name: "ניווט ראשי" }).getByRole("link", { name: "תשלומים", exact: true }).click();
    await expect(page).toHaveURL(/\/app\/payments$/);
    await page.getByRole("link", { name: /AS-2026-114/ }).click();
    await expect(page.getByRole("heading", { name: "Aegean Supplies Ltd" })).toBeVisible();
    await expect(page.getByText("0001", { exact: false }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "אישור פנימי", exact: true })).toBeDisabled();

    await chooseLanguage(page, "שפה עברית", "Ελληνικά");
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await expect(page.getByRole("heading", { name: "Γιατί επισημάνθηκε;" })).toBeVisible();
    await page.goto("http://127.0.0.1:32190/login");
    await expect(page.getByRole("heading", { name: "Σύνδεση στο TrustPay" })).toBeVisible();
  } finally { await context.close(); }
});

test("invalid preferences fall back to English and the reset confirmation is mirrored in Hebrew", async ({ page, context }) => {
  await context.addCookies([{ name: "trustpay-language", value: "invalid", url: "http://127.0.0.1:32190" }]);
  await page.goto("/app/audit");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await chooseLanguage(page, "Language English", "עברית");
  await page.getByRole("button", { name: "איפוס ההדגמה המקומית" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("לאפס את נתוני ההדגמה?");
  expect(await dialog.evaluate(element => getComputedStyle(element).direction)).toBe("rtl");
  await dialog.getByRole("button", { name: "ביטול" }).click();
  await expect(dialog).toHaveCount(0);
});

test("Greek form validation, decimal entry and API errors stay readable", async ({ page, context }) => {
  await context.addCookies([{ name: "trustpay-language", value: "el", url: "http://127.0.0.1:32190" }]);
  await page.route("**/api/v1/invoices/assess", async route => {
    expect(route.request().postDataJSON()).toMatchObject({ amount_cents: 842001 });
    await route.fulfill({ status: 409, json: { detail: "An assessment with this ID already exists" } });
  });
  await page.goto("/app/payments/new");
  const submit = page.getByRole("button", { name: "Έλεγχος τιμολογίου" });
  await expect(submit).toBeVisible();
  await submit.click();
  const id = page.locator('input[name="id"]');
  expect(await id.evaluate(input => (input as HTMLInputElement).validationMessage)).toBe("Συμπληρώστε αυτό το πεδίο.");
  await id.fill("DEMO-GREEK");
  await page.locator('input[name="invoice_number"]').fill("GR-001");
  await page.locator('input[name="amount"]').fill("8420,01");
  await page.locator('input[name="creditor_account"]').fill("SYNTHETIC-CY-9998");
  await page.locator('input[name="invoice_date"]').fill("2026-11-23");
  await submit.click();
  await expect(page.getByRole("alert").filter({ hasText: "Υπάρχει ήδη αξιολόγηση με αυτό το αναγνωριστικό" })).toBeVisible();
});

test("a verification message switches language and the synthetic approval is retained", async ({ page, context }) => {
  await context.addCookies([{ name: "trustpay-language", value: "he", url: "http://127.0.0.1:32190" }]);
  await page.goto("/app/payments/INV-2409");
  await page.getByLabel("אסמכתה לאימות עצמאי").fill("Synthetic supplier verification note");
  await page.getByRole("button", { name: "תיעוד האימות", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "האימות העצמאי תועד." })).toBeVisible();
  await chooseLanguage(page, "שפה עברית", "Русский");
  await expect(page.getByRole("status").filter({ hasText: "Независимая проверка записана." })).toBeVisible();
  await page.getByRole("button", { name: "Согласовать внутри компании", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Внутреннее согласование записано." })).toBeVisible();
  await page.goto("/app/audit");
  await expect(page.getByText("Synthetic supplier verification note", { exact: false })).toBeVisible();
});

test("review of an extracted invoice preserves the API data in Greek and Hebrew", async ({ page, context }) => {
  const id = "11111111-1111-4111-8111-111111111111";
  const fields = {
    supplier_name: "Aegean Supplies Ltd", registration_number: null, vat_number: null, invoice_number: "DEMO-EXTRACTED",
    invoice_date: "2026-11-23", due_date: null, total_amount: "8420.00", currency: "EUR", iban: "GB43TRST00000000000099",
    payment_reference: null,
  };
  const intake = {
    id, status: "needs_review", fields, supplier_id: "SUP-001", create_new_supplier: false, uncertain_fields: [],
    extraction_attempts: 1, method: "local_pdf_text", content_type: "application/pdf", size_bytes: 712,
  };
  await context.addCookies([{ name: "trustpay-language", value: "el", url: "http://127.0.0.1:32190" }]);
  await page.route("**/api/v1/invoice-intakes/" + id, async route => {
    if (route.request().method() === "PATCH") {
      const received = route.request().postDataJSON();
      expect(received.fields).toEqual({ ...fields, total_amount: "8420.01" });
      await route.fulfill({ json: { ...intake, status: "reviewed", fields: received.fields } });
    } else {
      await route.fulfill({ json: intake });
    }
  });
  await page.goto("/app/intakes/" + id);
  await page.getByLabel("Συνολικό ποσό", { exact: true }).fill("8420,01");
  await page.getByRole("button", { name: "Αποθήκευση διορθώσεων" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Τα επιβεβαιωμένα στοιχεία αποθηκεύτηκαν." })).toBeVisible();
  await chooseLanguage(page, "Γλώσσα Ελληνικά", "עברית");
  await expect(page.getByRole("heading", { name: "בדיקת פרטי החשבונית שחולצו" })).toBeVisible();
  const iban = page.getByLabel("IBAN של חשבון היעד", { exact: true });
  await expect(iban).toHaveValue(fields.iban);
  await expect(iban).toHaveAttribute("dir", "ltr");
  await expect(page.getByRole("button", { name: "הערכת סיכון" })).toBeEnabled();
});
