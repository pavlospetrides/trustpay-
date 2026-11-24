import { describe, expect, it } from "vitest";
import { JiniusSync } from "./sync";
import { PgStore } from "../database/postgres-store";
import { AccountProtector } from "../security/account";

describe("Jinius synthetic sync authority", () => {
  it("refuses a viewer before any database write", async () => {
    let connections = 0;
    const pool = { connect: async () => { connections++; throw new Error("unexpected DB access"); } };
    const sync = new JiniusSync(pool, new PgStore(pool, new AccountProtector(Buffer.alloc(32, "a"), Buffer.alloc(32, "b"))));
    await expect(sync.run({ userId: "11111111-1111-4111-8111-111111111111", organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", role: "viewer" })).rejects.toThrow("Only organization owners and admins");
    expect(connections).toBe(0);
  });
});
