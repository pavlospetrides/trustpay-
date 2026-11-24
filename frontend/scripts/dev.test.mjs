import net from "node:net";
import { describe, expect, it } from "vitest";
import { firstFreePort, portBusy, requirementsHash, venvPython } from "./dev.mjs";

describe("dev launcher helpers", () => {
  it("uses the platform venv interpreter path", () => {
    expect(venvPython("/r/.venv", false)).toMatch(/\.venv[\\/]bin[\\/]python$/);
    expect(venvPython("C:\\r\\.venv", true)).toMatch(/Scripts[\\/]python\.exe$/);
  });

  it("reinstalls only when requirements.txt changes", () => {
    expect(requirementsHash("fastapi\n")).toBe(requirementsHash("fastapi\n"));
    expect(requirementsHash("fastapi\n")).not.toBe(requirementsHash("fastapi\npypdf\n"));
  });

  it("falls back to 8001 when 8000 is busy, and reports none when both are", async () => {
    expect(await firstFreePort([8000, 8001], async (p) => p === 8000)).toBe(8001);
    expect(await firstFreePort([8000, 8001], async () => true)).toBeNull();
  });

  it("detects a real listener", async () => {
    const server = net.createServer().listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    const { port } = server.address();
    expect(await portBusy(port)).toBe(true);
    await new Promise((resolve) => server.close(resolve));
    expect(await portBusy(port)).toBe(false);
  });
});
