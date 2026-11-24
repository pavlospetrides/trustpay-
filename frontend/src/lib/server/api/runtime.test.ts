import { describe, expect, it } from "vitest";
import { resolveMode } from "./runtime";

describe("single-process backend selection", () => {
  it("defaults to the synthetic SQLite demo", () => {
    expect(resolveMode({})).toBe("sqlite");
  });
  it("requires explicit PostgreSQL mode for a database URL", () => {
    expect(() => resolveMode({ TRUSTPAY_DATABASE_URL: "postgres://synthetic" })).toThrow();
    expect(resolveMode({ TRUSTPAY_BACKEND: "postgres", TRUSTPAY_DATABASE_URL: "postgres://synthetic" })).toBe("postgres");
  });
});
