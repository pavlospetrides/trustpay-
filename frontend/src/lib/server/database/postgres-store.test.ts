import { describe, expect, it } from "vitest";
import { PgStore } from "./postgres-store";
import { AccountProtector } from "../security/account";

const org = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const userId = "33333333-3333-4333-8333-333333333333";

describe("PostgreSQL approval gate", () => {
  it("locks the tenant invoice and rolls back an early approval without writing a decision", async () => {
    const calls: { sql: string; values?: unknown[] }[] = [];
    const connection = {
      query: async (sql: string, values?: unknown[]) => {
        calls.push({ sql, values });
        if (sql.includes("for update of i")) return { rows: [{ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", public_id: "INV-2409", organization_id: org, status: "needs_review", score: 75, verified_by: null, created_by: null }] };
        return { rows: [] };
      },
      release: () => {},
    };
    const store = new PgStore({ connect: async () => connection }, new AccountProtector(Buffer.alloc(32, "a"), Buffer.alloc(32, "b")));
    await expect(store.transition("INV-2409", "approve", "", { userId, organizationId: org, role: "approver" })).rejects.toThrow("not ready");
    expect(calls.find((call) => call.sql.includes("for update of i"))?.values?.[0]).toBe(org);
    expect(calls.map((call) => call.sql)).toContain("ROLLBACK");
    expect(calls.some((call) => /insert into public\.payment_approvals|update public\.invoices/.test(call.sql))).toBe(false);
  });
});
