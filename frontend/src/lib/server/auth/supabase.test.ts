import { describe, expect, it } from "vitest";
import { verifiedUserId } from "./supabase";

describe("Supabase identity verification", () => {
  it("returns only an identity confirmed by getUser", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const user = await verifiedUserId("synthetic-token", { auth: { getUser: async (token: string) => { expect(token).toBe("synthetic-token"); return { data: { user: { id } }, error: null }; } } });
    expect(user).toBe(id);
  });
  it("rejects missing or malformed identities", async () => {
    await expect(verifiedUserId("bad", { auth: { getUser: async () => ({ data: { user: null }, error: { message: "Invalid JWT" } }) } })).rejects.toThrow("Invalid or expired access token");
    await expect(verifiedUserId("bad", { auth: { getUser: async () => ({ data: { user: { id: "not-a-uuid" } }, error: null }) } })).rejects.toThrow("invalid identity");
  });
});
