import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "@playwright/test";

const port = 32190;
const url = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "localization.spec.ts",
  workers: 1,
  timeout: 90_000,
  use: { baseURL: url, channel: process.env.TRUSTPAY_PLAYWRIGHT_CHANNEL || undefined },
  webServer: {
    command: `npm run start -- --port ${port}`,
    url: `${url}/api/health`,
    env: {
      TRUSTPAY_BACKEND: "sqlite",
      TRUSTPAY_DATABASE_URL: "",
      TRUSTPAY_DB_PATH: join(tmpdir(), `trustpay-i18n-${randomUUID()}.sqlite3`),
    },
    reuseExistingServer: false,
  },
});
