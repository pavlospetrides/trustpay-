import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";

afterEach(() => vi.unstubAllGlobals());

function stubFetch() {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify([]), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("request sharing", () => {
  it("shares identical GETs in flight, then fetches fresh data next time", async () => {
    const fetchMock = stubFetch();
    await Promise.all([api.invoices(), api.invoices(), api.invoices()]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await api.invoices();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("never shares state-changing requests", async () => {
    const fetchMock = stubFetch();
    await Promise.all([api.hold("INV-1"), api.hold("INV-1")]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not keep a failed GET", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("{}", { status: 503 }))
      .mockResolvedValueOnce(new Response("[]", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(api.invoices()).rejects.toThrow();
    await expect(api.invoices()).resolves.toEqual([]);
  });
});
