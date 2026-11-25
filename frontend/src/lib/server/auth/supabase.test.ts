import { describe, expect, it } from "vitest";
import { verifiedUserId } from "./supabase";

describe("Supabase identity verification", () => {
  it("returns only an identity confirmed by getUser", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const user = await verifiedUserId("synthetic-token", { auth: { getUser: async (token: string) => { expect(token).toBe("synthetic-token"); return { data: { user: { id } }, error: null }; } } });
    expect(user).toBe(id);
  });
  it("rejects missing or malformed identities", async () => {
    await expect(verifiedUserId("bad", { auth: { getUser: async () => ({ data: { user: null }, error: { message: "Invalid JWT", status: 401 } }) } })).rejects.toThrow("Invalid or expired access token");
    await expect(verifiedUserId("bad", { auth: { getUser: async () => ({ data: { user: null }, error: { message: "Forbidden", status: 403 } }) } })).rejects.toThrow("Invalid or expired access token");
    await expect(verifiedUserId("bad", { auth: { getUser: async () => ({ data: { user: { id: "not-a-uuid" } }, error: null }) } })).rejects.toThrow("invalid identity");
  });
  it("reports a Supabase outage as unavailable, not as a bad token, after one retry", async () => {
    for (const failure of [{ message: "Service Unavailable", status: 503 }, { message: "fetch failed", status: 0 }, { message: "Bad Request", status: 400 }]) {
      let calls = 0;
      await expect(verifiedUserId("ok", { auth: { getUser: async () => { calls++; return { data: { user: null }, error: failure }; } } })).rejects.toThrow("Authentication service unavailable");
      expect(calls).toBe(failure.status === 400 ? 1 : 2);
    }
    let calls = 0;
    await expect(verifiedUserId("ok", { auth: { getUser: async () => { calls++; throw new TypeError("network"); } } })).rejects.toThrow("Authentication service unavailable");
    expect(calls).toBe(2);
  });
  it("succeeds when the retry after a 5xx works", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    let calls = 0;
    const user = await verifiedUserId("ok", { auth: { getUser: async () => ++calls === 1 ? { data: { user: null }, error: { message: "Bad Gateway", status: 502 } } : { data: { user: { id } }, error: null } } });
    expect([user, calls]).toEqual([id, 2]);
  });
});
