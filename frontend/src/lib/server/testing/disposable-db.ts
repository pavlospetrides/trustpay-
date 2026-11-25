// Shared setup for tests that need a real, migrated, DISPOSABLE Supabase database (the local CI stack).
// They are skipped unless TRUSTPAY_TEST_DATABASE_URL is set and TRUSTPAY_TEST_CONFIRM=disposable.
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { handleApiRequest, type ApiContext } from "../api/handler";
import { PgStore } from "../database/postgres-store";
import { IntakeStore } from "../invoices/intake-store";
import { PrivateInvoiceStorage } from "../invoices/private-storage";
import { JiniusSync, type InvoiceSource } from "../jinius/sync";
import { syntheticIban } from "../jinius/demo";
import { AccountProtector } from "../security/account";

export const disposableUrl = process.env.TRUSTPAY_TEST_CONFIRM === "disposable" ? process.env.TRUSTPAY_TEST_DATABASE_URL : undefined;
export const pool = disposableUrl ? new Pool({ connectionString: disposableUrl, max: 6 }) : (null as unknown as Pool);
export const protector = new AccountProtector(Buffer.alloc(32, "a"), Buffer.alloc(32, "b"));
export const uuid = () => randomUUID();

export async function sql(text: string, values: unknown[] = []): Promise<Record<string, unknown>[]> {
  return (await pool.query(text, values)).rows;
}

/** Inserts Auth users, organizations and memberships; returns nothing, ids come from the caller. */
export async function seedMembers(members: [org: string, user: string, role: string][], orgs: [id: string, name: string][]): Promise<void> {
  for (const user of new Set(members.map(([, user]) => user))) await sql("insert into auth.users(id,email) values ($1,$2)", [user, `${user}@example.invalid`]);
  for (const [id, name] of orgs) await sql("insert into public.organizations(id,name,country) values ($1,$2,'CY')", [id, name]);
  for (const [org, user, role] of members) await sql("insert into public.organization_memberships(organization_id,user_id,role) values ($1,$2,$3)", [org, user, role]);
}

/** A supplier with a verified account (synthetic IBAN 1) and `count` paid invoices of €8,420.00. */
export async function seedSupplierHistory(org: string, publicId: string, name: string, count: number, prefix = "HIST"): Promise<string> {
  const supplier = uuid(), account = uuid();
  const protectedAccount = protector.protect(syntheticIban(1));
  await sql("insert into public.suppliers(id,organization_id,public_id,name) values ($1,$2,$3,$4)", [supplier, org, publicId, name]);
  await sql(`insert into public.supplier_bank_accounts (id,organization_id,supplier_id,encrypted_iban,iban_fingerprint,iban_last4,verification_status,last_verified_at)
    values ($1,$2,$3,$4,$5,$6,'verified',now())`, [account, org, supplier, protectedAccount.encrypted, protectedAccount.fingerprint, protectedAccount.last4]);
  for (let i = 0; i < count; i++) {
    await sql(`insert into public.payment_records (organization_id,supplier_id,bank_account_id,historical_invoice_number,amount,currency,status,paid_at,source)
      values ($1,$2,$3,$4,'8420.00','EUR','paid',now(),'synthetic_test')`, [org, supplier, account, `${prefix}-${i}`]);
  }
  return supplier;
}

/** The real route handler with real stores; only token verification and the Storage bucket are stand-ins. */
export function apiClient(tokens: Record<string, { user: string; org: string }>, source?: InvoiceSource) {
  const objects = new Map<string, Buffer>();
  const bucket = {
    upload: async (path: string, data: Buffer) => { objects.set(path, data); return { error: null }; },
    download: async (path: string) => objects.has(path) ? { data: new Blob([new Uint8Array(objects.get(path)!)]), error: null } : { data: null, error: "missing" },
    remove: async (paths: string[]) => { paths.forEach((path) => objects.delete(path)); return { error: null }; },
  };
  const pg = new PgStore(pool, protector);
  const storage = new PrivateInvoiceStorage({ storage: { from: () => bucket } });
  const jinius = new JiniusSync(pool, pg, source);
  const context: ApiContext = {
    mode: "postgres", pg, storage, jinius, intake: new IntakeStore(pool, pg, storage, null), aiEnabled: false,
    verifyToken: async (token) => { if (!tokens[token]) throw new Error("Invalid or expired access token"); return tokens[token].user; },
  };
  async function call(method: string, path: string, token: string, body?: unknown, headers: Record<string, string> = {}) {
    const init: RequestInit = { method, headers: { Authorization: `Bearer ${token}`, "X-Organization-Id": tokens[token]?.org ?? uuid(), ...headers } };
    if (body instanceof FormData) init.body = body;
    else if (body !== undefined) { init.body = JSON.stringify(body); (init.headers as Record<string, string>)["Content-Type"] = "application/json"; }
    const response = await handleApiRequest(new Request(`http://localhost${path}`, init), path.replace(/^\/api\//, "").split("/").map(decodeURIComponent), context);
    const text = await response.text();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { status: response.status, body: (text ? JSON.parse(text) : null) as any };
  }
  return { call, pg, jinius, objects };
}

/** Run statements as a signed-in browser client, so RLS and grants apply instead of the service connection. */
export async function asMember<T>(user: string, work: (query: (text: string, values?: unknown[]) => Promise<Record<string, unknown>[]>) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local role authenticated");
    await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: user, role: "authenticated" })]);
    return await work(async (text, values) => (await client.query(text, values)).rows);
  } finally {
    await client.query("rollback").catch(() => {});
    client.release();
  }
}
