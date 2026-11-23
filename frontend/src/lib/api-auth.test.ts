import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.hoisted(() => vi.fn());
vi.mock("./supabase", () => ({
  authConfigured: true,
  organizationStorageKey: "trustpay.organizationId",
  supabaseBrowser: () => ({ auth: { getSession } }),
}));

import { api, ApiError } from "./api";

describe("authenticated API transport", () => {
  beforeEach(() => {
    getSession.mockReset();
    vi.stubGlobal("localStorage", { getItem: () => "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" });
  });

  it("forwards the user token and selected organization to FastAPI", async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: "user-token" } }, error: null });
    const fetcher = vi.fn(async () => new Response("[]", { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    await api.invoices();
    const [, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect((options.headers as Record<string, string>).Authorization).toBe("Bearer user-token");
    expect((options.headers as Record<string, string>)["X-Organization-Id"]).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  });

  it("does not contact the API without a session", async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(api.invoices()).rejects.toBeInstanceOf(ApiError);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
