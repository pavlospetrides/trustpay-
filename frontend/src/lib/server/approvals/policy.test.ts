import { describe, expect, it } from "vitest";
import { authorizeTransition, releasedStatus } from "./policy";

const maker = "11111111-1111-4111-8111-111111111111";
const verifier = "22222222-2222-4222-8222-222222222222";
const approver = "33333333-3333-4333-8333-333333333333";
const principal = (userId: string, role: string) => ({ userId, organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", role });

describe("maker-checker policy", () => {
  it("blocks approval until independent verification and a distinct approver", () => {
    const row = { status: "needs_review", score: 75, verifiedBy: null, createdBy: maker };
    expect(() => authorizeTransition(principal(approver, "approver"), "approve", row)).toThrow();
    expect(() => authorizeTransition(principal(verifier, "analyst"), "verify", row)).not.toThrow();
    const ready = { ...row, status: "ready", verifiedBy: verifier };
    expect(() => authorizeTransition(principal(verifier, "approver"), "approve", ready)).toThrow();
    expect(() => authorizeTransition(principal(maker, "approver"), "approve", ready)).toThrow();
    expect(() => authorizeTransition(principal(approver, "approver"), "approve", ready)).not.toThrow();
  });

  it("denies maker verification, viewer transitions, and duplicate hard blocks", () => {
    const row = { status: "blocked", score: 100, verifiedBy: null, createdBy: maker };
    expect(() => authorizeTransition(principal(verifier, "analyst"), "verify", row)).toThrow();
    expect(() => authorizeTransition(principal(verifier, "viewer"), "hold", row)).toThrow();
    expect(() => authorizeTransition(principal(maker, "analyst"), "verify", { ...row, status: "needs_review" })).toThrow();
  });

  it("releases a verified hold back to ready, but never by the invoice creator", () => {
    const held = { status: "hold", score: 75, verifiedBy: verifier, createdBy: maker };
    expect(() => authorizeTransition(principal(maker, "analyst"), "release", held)).toThrow("Maker-checker");
    expect(() => authorizeTransition(principal(verifier, "analyst"), "release", held)).not.toThrow();
    expect(() => authorizeTransition(principal(verifier, "analyst"), "release", { ...held, status: "ready" })).toThrow("not on hold");
    expect(() => authorizeTransition(principal(approver, "approver"), "release", held)).toThrow("Role");
    expect(releasedStatus(held)).toBe("ready");
    expect(releasedStatus({ ...held, verifiedBy: null })).toBe("needs_review");
    expect(releasedStatus({ ...held, verifiedBy: null, score: 0 })).toBe("ready");
  });

  it("lets reviewers reject from any state, including approved, and makes rejection final", () => {
    for (const status of ["ready", "needs_review", "blocked", "hold", "approved"]) {
      expect(() => authorizeTransition(principal(approver, "approver"), "reject", { status, score: 75, verifiedBy: verifier, createdBy: maker })).not.toThrow();
    }
    expect(() => authorizeTransition(principal(approver, "viewer"), "reject", { status: "ready", score: 0, verifiedBy: null, createdBy: maker })).toThrow("Role");
    const rejected = { status: "rejected", score: 75, verifiedBy: verifier, createdBy: maker };
    for (const action of ["verify", "approve", "hold", "release", "reject"] as const) {
      expect(() => authorizeTransition(principal(approver, "owner"), action, rejected)).toThrow("final");
    }
  });
});
