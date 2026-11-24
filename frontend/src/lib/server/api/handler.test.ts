import { describe, expect, it } from "vitest";
import { DemoStore } from "../database/demo-store";
import { handleApiRequest } from "./handler";
import type { ApiContext } from "./handler";

const request = (path: string, method = "GET", body?: unknown) => new Request(`http://127.0.0.1:3000/api/${path}`, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });

describe("single-server synthetic API", () => {
  it("serves the 75-score verification and approval workflow with separate audit events", async () => {
    const db = new DemoStore(":memory:");
    const context = { mode: "sqlite" as const, demo: db };
    try {
      const health = await handleApiRequest(request("health"), ["health"], context);
      expect(await health.json()).toMatchObject({ mode: "synthetic-local-demo", payment_initiation: false });
      expect(health.headers.get("Cache-Control")).toBe("no-store");
      const blocked = await handleApiRequest(request("v1/invoices/INV-2409/approve", "POST"), ["v1", "invoices", "INV-2409", "approve"], context);
      expect(blocked.status).toBe(409);
      const verified = await handleApiRequest(request("v1/invoices/INV-2409/verify", "POST", { evidence_note: "Independent callback confirmed" }), ["v1", "invoices", "INV-2409", "verify"], context);
      expect((await verified.json()).status).toBe("ready");
      const approved = await handleApiRequest(request("v1/invoices/INV-2409/approve", "POST"), ["v1", "invoices", "INV-2409", "approve"], context);
      expect((await approved.json()).status).toBe("approved");
      const audit = await handleApiRequest(request("v1/audit"), ["v1", "audit"], context);
      expect((await audit.json()).filter((event: { invoice_id: string }) => event.invoice_id === "INV-2409").map((event: { action: string }) => event.action)).toEqual(["APPROVE", "VERIFY", "ASSESSED"]);
    } finally { db.close(); }
  });
  it("rejects malformed manual assessments before persistence", async () => {
    const db = new DemoStore(":memory:");
    try {
      const response = await handleApiRequest(request("v1/invoices/assess", "POST", { id: "X", amount_cents: -1 }), ["v1", "invoices", "assess"], { mode: "sqlite", demo: db });
      expect(response.status).toBe(422);
      expect(db.invoices()).toHaveLength(4);
    } finally { db.close(); }
  });
  it("refuses import resolution in the synthetic demo, as the Python backend did", async () => {
    const db = new DemoStore(":memory:");
    try {
      const response = await handleApiRequest(request("v1/integrations/jinius/imports/INV-2411/1/resolve", "POST", { supplier_id: "SUP-003" }), ["v1", "integrations", "jinius", "imports", "INV-2411", "1", "resolve"], { mode: "sqlite", demo: db });
      expect([response.status, (await response.json()).detail]).toEqual([403, "Integration imports require PostgreSQL mode"]);
    } finally { db.close(); }
  });
  it("denies a verified user without tenant membership", async () => {
    const context = { mode: "postgres", pg: { membershipRows: async () => [] }, verifyToken: async () => "11111111-1111-4111-8111-111111111111" } as unknown as ApiContext;
    const response = await handleApiRequest(new Request("http://localhost/api/v1/invoices", { headers: { Authorization: "Bearer synthetic-token" } }), ["v1", "invoices"], context);
    expect(response.status).toBe(403);
  });
});
