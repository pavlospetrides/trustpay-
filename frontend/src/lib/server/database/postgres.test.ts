import { types } from "pg";
import { describe, expect, it } from "vitest";
import { poolConfig, transaction } from "./postgres";

describe("PostgreSQL decision transaction boundary", () => {
  it("requires a CA for a hosted Supabase pooler and keeps certificate verification enabled", () => {
    const url = "postgresql://user:password@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?sslmode=require";
    expect(() => poolConfig(url, undefined)).toThrow("CA certificate");
    const config = poolConfig(url, "-----BEGIN CERTIFICATE-----\nsynthetic\n-----END CERTIFICATE-----");
    expect(config.connectionString).not.toContain("sslmode=require");
    expect(config.ssl).toMatchObject({ rejectUnauthorized: true });
  });
  it("commits all writes only after the work succeeds", async () => {
    const calls: string[] = [];
    const client = { query: async (sql: string) => { calls.push(sql); return { rows: [] }; }, release: () => { calls.push("release"); } };
    const result = await transaction({ connect: async () => client }, async (connection) => { await connection.query("insert decision"); await connection.query("insert audit"); return 42; });
    expect(result).toBe(42);
    expect(calls).toEqual(["BEGIN", "insert decision", "insert audit", "COMMIT", "release"]);
  });
  it("rolls back before releasing a failed decision", async () => {
    const calls: string[] = [];
    const client = { query: async (sql: string) => { calls.push(sql); if (sql === "insert audit") throw new Error("audit write failed"); return { rows: [] }; }, release: () => { calls.push("release"); } };
    await expect(transaction({ connect: async () => client }, async (connection) => { await connection.query("insert decision"); await connection.query("insert audit"); })).rejects.toThrow("audit write failed");
    expect(calls).toEqual(["BEGIN", "insert decision", "insert audit", "ROLLBACK", "release"]);
  });
});

describe("PostgreSQL DATE values", () => {
  it("stay the same calendar day when the server runs east of UTC", () => {
    const zone = process.env.TZ;
    process.env.TZ = "Asia/Nicosia";
    try { expect(types.getTypeParser(types.builtins.DATE)("2026-11-25")).toBe("2026-11-25"); }
    finally { if (zone === undefined) delete process.env.TZ; else process.env.TZ = zone; }
  });
});
