import { expect, test } from "@playwright/test";
import dotenv from "dotenv";
import { corpus, renderCorpusCase } from "../src/lib/server/invoices/fixtures/universal-corpus";

dotenv.config({ path: ".env.local", quiet: true });
test.use({ baseURL: process.env.TRUSTPAY_E2E_BASE_URL ?? "http://127.0.0.1:3000" });

test("a previously unseen layout has evidence, line items and a private preview", async ({ page }) => {
  test.skip(process.env.TRUSTPAY_LIVE_E2E !== "1" || !process.env.TRUSTPAY_E2E_MAKER_EMAIL, "Live synthetic extraction is opt-in");
  test.setTimeout(120_000);
  const sample = corpus[25];
  const { data, contentType } = await renderCorpusCase(sample);
  await page.goto("/login");
  await page.getByLabel("Email").fill(process.env.TRUSTPAY_E2E_MAKER_EMAIL!);
  await page.getByLabel("Password").fill(process.env.TRUSTPAY_E2E_MAKER_PASSWORD!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/app\/overview/, { timeout: 20_000 });
  await page.goto("/app/payments/new");
  await page.getByLabel("Choose invoice file").setInputFiles({ name: `${sample.id}.pdf`, mimeType: contentType, buffer: data });
  await page.getByRole("button", { name: "Upload invoice" }).click();
  await expect(page).toHaveURL(/\/app\/intakes\//, { timeout: 80_000 });
  await expect(page.getByLabel("Supplier name")).toHaveValue(sample.supplier);
  await expect(page.getByLabel("Invoice number")).toHaveValue(sample.invoiceNumber);
  await expect(page.getByText("Document type:")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Line item 1" })).toBeVisible();
  await page.getByRole("button", { name: "View original" }).click();
  await expect(page.getByTitle("Original invoice")).toBeVisible();
  await page.getByLabel("Total amount", { exact: true }).fill("1026.00");
  await page.getByLabel("Supplier match").selectOption("new");
  await page.getByRole("button", { name: "Save corrections" }).click();
  await expect(page.getByRole("status")).toContainText("Reviewed fields saved");
  await expect(page.getByText("Originally extracted: 1025.00")).toBeVisible();
});
