import { isAbsolute, resolve } from "node:path";
import { DemoStore } from "../database/demo-store";
import { PgStore } from "../database/postgres-store";
import { databasePool } from "../database/postgres";
import { AccountProtector } from "../security/account";
import { privateInvoiceStorage } from "../invoices/private-storage";
import { optionalInvoiceProvider } from "../ai/provider";
import { IntakeStore } from "../invoices/intake-store";
import { JiniusSync } from "../jinius/sync";
import { supabaseAuthClient, verifiedUserId } from "../auth/supabase";
import type { ApiContext } from "./handler";

export function resolveMode(env: { TRUSTPAY_BACKEND?: string; TRUSTPAY_DATABASE_URL?: string }): "sqlite" | "postgres" {
  const mode = env.TRUSTPAY_BACKEND || "sqlite";
  if (mode !== "sqlite" && mode !== "postgres") throw new Error("TRUSTPAY_BACKEND must be sqlite or postgres");
  if (mode === "sqlite" && env.TRUSTPAY_DATABASE_URL) throw new Error("Set TRUSTPAY_BACKEND=postgres to use TRUSTPAY_DATABASE_URL");
  if (mode === "postgres" && !env.TRUSTPAY_DATABASE_URL) throw new Error("TRUSTPAY_DATABASE_URL is required in PostgreSQL mode");
  return mode;
}

declare global { var trustpayContext: ApiContext | undefined }
export function apiContext(): ApiContext {
  if (globalThis.trustpayContext) return globalThis.trustpayContext;
  const mode = resolveMode({ TRUSTPAY_BACKEND: process.env.TRUSTPAY_BACKEND, TRUSTPAY_DATABASE_URL: process.env.TRUSTPAY_DATABASE_URL });
  if (mode === "sqlite") {
    const configured = process.env.TRUSTPAY_DB_PATH;
    const path = configured ? isAbsolute(configured) ? configured : resolve(process.cwd(), "..", configured) : resolve(process.cwd(), "..", "data", "trustpay.sqlite3");
    return globalThis.trustpayContext = { mode, demo: new DemoStore(path) };
  }
  const pool = databasePool();
  const pg = new PgStore(pool, AccountProtector.fromEnvironment());
  const provider = optionalInvoiceProvider();
  const storage = privateInvoiceStorage();
  return globalThis.trustpayContext = { mode, pg, intake: new IntakeStore(pool, pg, storage, provider), storage, jinius: new JiniusSync(pool, pg), verifyToken: (token) => verifiedUserId(token, supabaseAuthClient()), aiEnabled: Boolean(provider) };
}
