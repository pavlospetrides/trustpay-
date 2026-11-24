import { describe, expect, it } from "vitest";
import { selectPrincipal } from "./principal";

const userId = "11111111-1111-4111-8111-111111111111";
const orgA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const orgB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const rows = [{ organizationId: orgA, role: "analyst" }, { organizationId: orgB, role: "viewer" }];

describe("organization selection", () => {
  it("requires an explicit organization for multi-membership users", () => {
    expect(() => selectPrincipal(userId, null, rows)).toThrow();
    expect(selectPrincipal(userId, orgA, rows)).toEqual({ userId, organizationId: orgA, role: "analyst" });
  });
  it("rejects a browser-selected organization without membership", () => {
    expect(() => selectPrincipal(userId, "cccccccc-cccc-4ccc-8ccc-cccccccccccc", rows)).toThrow();
    expect(() => selectPrincipal(userId, orgA, [])).toThrow();
  });
  it("selects the single active membership when no header is supplied", () => {
    expect(selectPrincipal(userId, null, rows.slice(0, 1)).organizationId).toBe(orgA);
  });
});
