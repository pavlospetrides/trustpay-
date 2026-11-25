import { describe, expect, it } from "vitest";
import { authenticateRequest } from "./request";

const userId = "11111111-1111-4111-8111-111111111111";
const org = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("request authentication", () => {
  it("requires a bearer token before consulting membership", async () => {
    let checks = 0;
    await expect(authenticateRequest(new Request("http://localhost/api", { headers: { "X-Organization-Id": org } }), {
      verifyToken: async () => { checks++; return userId; },
      memberships: async () => [{ organizationId: org, role: "owner" }],
    })).rejects.toThrow("Authentication required");
    expect(checks).toBe(0);
  });
  it("uses verified identity and membership instead of browser claims", async () => {
    const req = new Request("http://localhost/api", { headers: { Authorization: "Bearer synthetic-token", "X-Organization-Id": org, "X-Role": "owner", "X-User-Id": "spoofed" } });
    const result = await authenticateRequest(req, {
      verifyToken: async (token) => { expect(token).toBe("synthetic-token"); return userId; },
      memberships: async (id) => { expect(id).toBe(userId); return [{ organizationId: org, role: "analyst" }]; },
    });
    expect(result).toEqual({ userId, organizationId: org, role: "analyst" });
  });
});
