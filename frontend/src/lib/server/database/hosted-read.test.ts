import { describe, expect, it } from "vitest";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { AccountProtector } from "../security/account";
import { databasePool } from "./postgres";
import { PgStore } from "./postgres-store";

config({ path: ".env.local", quiet: true });
const enabled = process.env.RUN_HOSTED_READ_TEST === "1";

describe.skipIf(!enabled)("designated synthetic development database, read only", () => {
  it("reads an owner invoice and denies an outsider's tenant lookup", async () => {
    if (process.env.TRUSTPAY_ENVIRONMENT !== "development") throw new Error("Hosted read test requires development environment");
    const url = process.env.SUPABASE_URL!;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
    const auth = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const owner = await auth.auth.signInWithPassword({ email: process.env.TRUSTPAY_E2E_MAKER_EMAIL!, password: process.env.TRUSTPAY_E2E_MAKER_PASSWORD! });
    expect(owner.error).toBeNull();
    const store = new PgStore(databasePool(), AccountProtector.fromEnvironment());
    const ownerOrg = (await store.membershipRows(owner.data.user!.id))[0];
    const outsiderOrg = process.env.TRUSTPAY_E2E_OUTSIDER_ORG!;
    expect(ownerOrg.organizationId).not.toBe(outsiderOrg);
    const invoice = (await store.invoices({ userId: owner.data.user!.id, organizationId: ownerOrg.organizationId, role: ownerOrg.role }))[0];
    expect(invoice).toMatchObject({ risk: expect.any(Number), history: expect.any(Number) });
    await expect(store.invoice(invoice.id, { userId: owner.data.user!.id, organizationId: outsiderOrg, role: "viewer" })).rejects.toThrow("Invoice not found");
  }, 30_000);
});
