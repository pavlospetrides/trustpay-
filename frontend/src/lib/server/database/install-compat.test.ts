import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("Windows installation contract", () => {
  it("uses Node 24 built-in SQLite without the native better-sqlite3 dependency", () => {
    const manifest = JSON.parse(readFileSync(new URL("../../../../package.json", import.meta.url), "utf8"));
    expect(manifest.dependencies).not.toHaveProperty("better-sqlite3");
    expect(manifest.devDependencies).not.toHaveProperty("@types/better-sqlite3");
    expect(manifest.engines.node).toBe(">=24.11.1 <25");
  });
});
