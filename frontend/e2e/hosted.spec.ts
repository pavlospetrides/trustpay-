import { expect, test } from "@playwright/test";
import dotenv from "dotenv";
import { join } from "node:path";

dotenv.config({ path: ".env.local", quiet: true });
test.use({ baseURL: process.env.TRUSTPAY_E2E_BASE_URL ?? "http://127.0.0.1:3000" });

test("a signed-in owner can open the live assessment workspace", async ({ page }) => {
  test.skip(!process.env.TRUSTPAY_E2E_MAKER_EMAIL || !process.env.TRUSTPAY_E2E_MAKER_PASSWORD, "Hosted test credentials are not configured");
  await page.goto("/login");
  await page.getByLabel("Email").fill(process.env.TRUSTPAY_E2E_MAKER_EMAIL!);
  await page.getByLabel("Password").fill(process.env.TRUSTPAY_E2E_MAKER_PASSWORD!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/app\/overview/, { timeout: 20_000 });
  await expect(page.getByText("Aegean Supplies Synthetic Ltd").first()).toBeVisible({ timeout: 20_000 });
  await page.goto("/app/payments?status=approved&q=UPL-");
  await page.locator('a[href^="/app/payments/UPL-"]').first().click();
  await expect(page.getByRole("heading", { name: "Aegean Supplies Synthetic Ltd" })).toBeVisible();
  await expect(page.getByText("Internal approval recorded", { exact: false }).first()).toBeVisible();
});

test("synthetic invoice follows review, independent verification, approval and audit", async ({ browser }) => {
  test.skip(!process.env.TRUSTPAY_E2E_MAKER_EMAIL || !process.env.TRUSTPAY_E2E_VERIFIER_EMAIL || !process.env.TRUSTPAY_E2E_APPROVER_EMAIL, "Hosted test credentials are not configured");
  test.setTimeout(120_000);
  const baseURL = process.env.TRUSTPAY_E2E_BASE_URL ?? "http://127.0.0.1:3000";
  async function signedIn(role: "MAKER" | "VERIFIER" | "APPROVER") {
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    await page.goto("/login");
    await page.getByLabel("Email").fill(process.env[`TRUSTPAY_E2E_${role}_EMAIL`]!);
    await page.getByLabel("Password").fill(process.env[`TRUSTPAY_E2E_${role}_PASSWORD`]!);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/app\/overview/, { timeout: 20_000 });
    return { context, page };
  }
  const maker = await signedIn("MAKER");
  await maker.page.goto("/app/payments/new");
  await maker.page.getByLabel("Choose invoice file").setInputFiles(join(process.cwd(), "src/lib/server/invoices/fixtures/synthetic-invoice.pdf"));
  await maker.page.getByRole("button", { name: "Upload invoice" }).click();
  await expect(maker.page).toHaveURL(/\/app\/intakes\//, { timeout: 30_000 });
  await maker.page.getByLabel("Supplier name").fill("Aegean Supplies Synthetic Ltd");
  await maker.page.getByLabel("Invoice number").fill(`BROWSER-${Date.now()}`);
  await maker.page.getByLabel("Invoice date").fill("2026-11-23");
  await maker.page.getByLabel("Total amount").fill("8420.00");
  await maker.page.getByLabel("Currency").fill("EUR");
  await maker.page.getByLabel("Destination IBAN").fill("GB43TRST00000000000099");
  const supplierValue = await maker.page.getByLabel("Supplier match").locator("option", { hasText: "Aegean Supplies Synthetic Ltd" }).getAttribute("value");
  await maker.page.getByLabel("Supplier match").selectOption(supplierValue!);
  await maker.page.getByRole("button", { name: "Save corrections" }).click();
  await expect(maker.page.getByRole("status")).toContainText("Reviewed fields saved");
  await maker.page.getByRole("button", { name: "Analyze risk" }).click();
  await expect(maker.page).toHaveURL(/\/app\/payments\/UPL-/, { timeout: 30_000 });
  const detailPath = new URL(maker.page.url()).pathname;
  await expect(maker.page.getByText("75/100").first()).toBeVisible();
  await expect(maker.page.getByRole("button", { name: "Approve internally" })).toBeDisabled();
  await maker.page.getByLabel("Independent verification evidence").fill("Synthetic trusted contact callback evidence");
  await maker.page.getByRole("button", { name: "Record verification" }).click();
  await expect(maker.page.locator(".actions-panel .notice.danger")).toContainText("cannot independently verify");
  await maker.context.close();

  const verifier = await signedIn("VERIFIER");
  await verifier.page.goto(detailPath);
  await verifier.page.getByLabel("Independent verification evidence").fill("Synthetic independent trusted contact callback");
  await verifier.page.getByRole("button", { name: "Record verification" }).click();
  await expect(verifier.page.getByText("Independent verification recorded.")).toBeVisible();
  await verifier.context.close();

  const approver = await signedIn("APPROVER");
  await approver.page.goto(detailPath);
  await approver.page.getByRole("button", { name: "Approve internally" }).click();
  await expect(approver.page.getByText("Internal approval recorded", { exact: false }).first()).toBeVisible();
  await approver.page.goto("/app/audit");
  await expect(approver.page.locator(".audit-event").filter({ hasText: "APPROVE" }).first()).toBeVisible();
  await approver.context.close();
});
