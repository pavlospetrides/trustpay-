// Ported from the Python tests/rls suite (test_postgres_api, test_phase2_api, test_jinius_sync, test_jinius_resolve).
// Runs only against a migrated, disposable Supabase database; CI starts one with `supabase start`.
import { afterAll, describe, expect, it, vi } from "vitest";
import { StatusError } from "../api/status-error";
import { demoSource } from "../jinius/sync";
import { syntheticIban } from "../jinius/demo";
import { syntheticPdf } from "./synthetic-pdf";
import { apiClient, asMember, disposableUrl, pool, seedMembers, seedSupplierHistory, sql, uuid } from "./disposable-db";

const pdfForm = (text: string, name = "synthetic.pdf") => { const form = new FormData(); form.set("file", new File([new Uint8Array(syntheticPdf(text))], name, { type: "application/pdf" })); return form; };
const count = async (text: string, values: unknown[]) => Number((await sql(text, values))[0].n);

describe.skipIf(!disposableUrl)("disposable Supabase database", () => {
  afterAll(async () => { await pool.end(); });

  it("keeps tenants apart and refuses approval bypasses", async () => {
    const [orgA, orgB, maker, outsider, verifier, approver] = [uuid(), uuid(), uuid(), uuid(), uuid(), uuid()];
    await seedMembers([[orgA, maker, "analyst"], [orgB, outsider, "approver"], [orgA, verifier, "analyst"], [orgA, approver, "approver"]], [[orgA, "Synthetic test A"], [orgB, "Synthetic test B"]]);
    await seedSupplierHistory(orgA, "TEST-SUP", "Synthetic test supplier", 14);
    await sql("insert into public.suppliers(id,organization_id,public_id,name) values ($1,$2,'TEST-SUP','Synthetic test supplier')", [uuid(), orgB]);
    const { call } = apiClient({ maker: { user: maker, org: orgA }, outsider: { user: outsider, org: orgB }, outsiderA: { user: outsider, org: orgA }, verifier: { user: verifier, org: orgA }, approver: { user: approver, org: orgA } });
    const id = `TEST-${uuid().slice(0, 12)}`;
    const created = await call("POST", "/api/v1/invoices/assess", "maker", { id, supplier_id: "TEST-SUP", invoice_number: "NEW-001", amount_cents: 842000, creditor_account: syntheticIban(99), invoice_date: "2026-11-23" });
    expect([created.status, created.body.risk, created.body.history]).toEqual([201, 75, 14]);
    const path = `/api/v1/invoices/${id}`;
    expect((await call("GET", path, "outsider")).status).toBe(404);
    expect((await call("GET", path, "outsiderA")).status).toBe(403);
    expect((await call("POST", `${path}/approve`, "maker")).status).toBe(403);
    expect((await call("POST", `${path}/approve`, "approver")).status).toBe(403);
    expect((await call("POST", `${path}/verify`, "verifier", { evidence_note: "Synthetic independent callback record" })).status).toBe(200);
    const approved = await call("POST", `${path}/approve`, "approver");
    expect([approved.status, approved.body.status]).toEqual([200, "approved"]);
    const actions = new Set((await call("GET", "/api/v1/audit", "maker")).body.map((event: { action: string }) => event.action));
    for (const action of ["ASSESSED", "VERIFY", "APPROVE"]) expect(actions).toContain(action);
  });

  it("takes a synthetic PDF through intake, review, risk and approval", async () => {
    const [orgA, orgB, maker, outsider, verifier, approver] = [uuid(), uuid(), uuid(), uuid(), uuid(), uuid()];
    await seedMembers([[orgA, maker, "analyst"], [orgB, outsider, "analyst"], [orgA, verifier, "analyst"], [orgA, approver, "approver"]], [[orgA, "Phase 2 synthetic test"], [orgB, "Phase 2 synthetic test"]]);
    await seedSupplierHistory(orgA, "TEST-SUP", "Synthetic test supplier", 14);
    const { call } = apiClient({ maker: { user: maker, org: orgA }, outsider: { user: outsider, org: orgB }, verifier: { user: verifier, org: orgA }, approver: { user: approver, org: orgA } });
    const text = `TRUSTPAY SYNTHETIC INVOICE\nSupplier: Synthetic test supplier\nInvoice Number: NEW-456\nInvoice Date: 2026-11-23\nTotal Amount: 8420.00\nCurrency: EUR\nIBAN: ${syntheticIban(99)}\n`;
    const key = { "Idempotency-Key": "phase2-synthetic-one" };
    const upload = await call("POST", "/api/v1/invoice-intakes", "maker", pdfForm(text), key);
    expect(upload.status).toBe(201);
    expect([upload.body.fields.invoice_number, upload.body.status]).toEqual(["NEW-456", "needs_review"]);
    const retry = await call("POST", "/api/v1/invoice-intakes", "maker", pdfForm(text), key);
    expect([retry.status, retry.body.id]).toEqual([201, upload.body.id]);
    expect((await call("POST", "/api/v1/invoice-intakes", "maker", pdfForm(`${text}Note: different\n`, "other.pdf"), key)).status).toBe(409);
    const path = `/api/v1/invoice-intakes/${upload.body.id}`;
    expect((await call("GET", path, "outsider")).status).toBe(404);
    for (const attempt of [2, 3]) {
      const extracted = await call("POST", `${path}/extract`, "maker");
      expect([extracted.status, extracted.body.extraction_attempts]).toEqual([200, attempt]);
    }
    expect((await call("POST", `${path}/extract`, "maker")).status).toBe(429);
    const review = await call("PATCH", path, "maker", { fields: upload.body.fields, supplier_id: "TEST-SUP", create_new_supplier: false });
    expect([review.status, review.body.status]).toEqual([200, "reviewed"]);
    const analyzed = await call("POST", `${path}/analyze`, "maker");
    expect(analyzed.status).toBe(200);
    const invoice = analyzed.body;
    expect([invoice.risk, invoice.history, invoice.status, invoice.ai_explanation_method]).toEqual([75, 14, "needs_review", "verified_policy"]);
    expect(invoice.ai_explanation).toContain("Independently verify");
    expect(JSON.stringify(invoice)).not.toContain(syntheticIban(99));
    const invoicePath = `/api/v1/invoices/${invoice.id}`;
    expect((await call("GET", `${invoicePath}/documents`, "maker")).body).toHaveLength(1);
    expect((await call("POST", `${invoicePath}/approve`, "approver")).status).toBe(403);
    const history = await call("GET", `${invoicePath}/assessments`, "maker");
    expect([history.status, history.body.length]).toEqual([200, 1]);
    const detail = await call("GET", `${invoicePath}/assessments/${history.body[0].id}`, "maker");
    expect([detail.status, detail.body.evidence.historical_payment_count]).toEqual([200, 14]);
    expect((await call("POST", `${invoicePath}/verify`, "verifier", { evidence_note: "Synthetic independent supplier callback" })).status).toBe(200);
    expect((await call("POST", `${invoicePath}/approve`, "approver")).body.status).toBe("approved");
    const actions = new Set((await call("GET", "/api/v1/audit", "maker")).body.map((event: { action: string }) => event.action));
    for (const action of ["INTAKE_UPLOADED", "INTAKE_REVIEWED", "ASSESSED", "APPROVE"]) expect(actions).toContain(action);

    const unknownText = text.replace("Synthetic test supplier", "New synthetic supplier").replace("NEW-456", "NEW-789");
    const second = await call("POST", "/api/v1/invoice-intakes", "maker", pdfForm(unknownText, "unknown.pdf"), { "Idempotency-Key": "phase2-synthetic-two" });
    expect(second.status).toBe(201);
    expect((await call("PATCH", `/api/v1/invoice-intakes/${second.body.id}`, "maker", { fields: second.body.fields, supplier_id: null, create_new_supplier: true })).status).toBe(200);
    const created = await call("POST", `/api/v1/invoice-intakes/${second.body.id}/analyze`, "maker");
    expect([created.status, created.body.history, created.body.risk]).toEqual([200, 0, 45]);
  });

  it("syncs Jinius idempotently, per tenant, and keeps maker-checker", async () => {
    const [orgA, orgB, orgC, owner, analyst, approver, ownerB, ownerC] = [uuid(), uuid(), uuid(), uuid(), uuid(), uuid(), uuid(), uuid()];
    await seedMembers([[orgA, owner, "owner"], [orgA, analyst, "analyst"], [orgA, approver, "approver"], [orgB, ownerB, "owner"], [orgC, ownerC, "owner"]], [[orgA, "Synthetic sync test A"], [orgB, "Synthetic sync test B"], [orgC, "Synthetic sync test C"]]);
    await sql("insert into public.suppliers(id,organization_id,public_id,name) values ($1,$2,'SUP-004','Synthetic concurrent supplier')", [uuid(), orgC]);
    // Org A knows only SUP-001 (the demo changed-IBAN supplier); the other demo suppliers are unknown.
    await seedSupplierHistory(orgA, "SUP-001", "Aegean Supplies Ltd", 14, "AS-HIST");
    const tokens = { owner: { user: owner, org: orgA }, analyst: { user: analyst, org: orgA }, approver: { user: approver, org: orgA }, ownerB: { user: ownerB, org: orgB }, ownerC: { user: ownerC, org: orgC } };
    const { call, pg } = apiClient(tokens);
    const sync = (token: keyof typeof tokens) => call("POST", "/api/v1/integrations/jinius/sync", token);

    expect((await sync("analyst")).status).toBe(403);
    expect((await sync("approver")).status).toBe(403);
    const first = await sync("owner");
    expect(first.status).toBe(200);
    const run = first.body;
    expect([run.status, run.records_seen, run.records_created, run.records_needs_review, run.records_skipped, run.safe_error]).toEqual(["success", 4, 1, 3, 0, null]);
    const second = (await sync("owner")).body;
    expect([second.records_created, second.records_needs_review, second.records_skipped]).toEqual([0, 0, 4]);
    const imported = (await call("GET", "/api/v1/invoices", "owner")).body.filter((invoice: { source: string }) => invoice.source === "jinius_demo_adapter");
    expect(imported.map((invoice: { id: string }) => invoice.id)).toEqual(["JIN-INV-2409-r1"]);
    expect([imported[0].risk, imported[0].kind, imported[0].status, imported[0].reference, imported[0].history]).toEqual([75, "iban", "needs_review", "Synthetic Jinius demo", 14]);
    const path = "/api/v1/invoices/JIN-INV-2409-r1";
    expect((await call("GET", `${path}/assessments`, "owner")).body).toHaveLength(1);
    expect(await count("select count(*)::int as n from public.integration_imports where organization_id=$1", [orgA])).toBe(4);
    expect(await sql("select status,records_seen from public.sync_runs where organization_id=$1 order by started_at", [orgA])).toEqual([{ status: "success", records_seen: 4 }, { status: "success", records_seen: 4 }]);
    expect(await sql("select external_source,external_invoice_id,created_by from public.invoices where organization_id=$1 and public_id='JIN-INV-2409-r1'", [orgA])).toEqual([{ external_source: "jinius_demo_adapter", external_invoice_id: "INV-2409", created_by: owner }]);

    const status = (await call("GET", "/api/v1/integrations", "owner")).body.jinius;
    expect([status.sync_available, status.live_connected, status.imported_count, status.needs_review_count]).toEqual([true, false, 1, 3]);
    expect(new Set(status.needs_review.map((row: { reason: string }) => row.reason))).toEqual(new Set(["Supplier is not known in this organization"]));
    expect(status.last_success_at).toBeTruthy();
    expect(status.last_run.records_skipped).toBe(4);

    const note = { evidence_note: "Synthetic callback to known supplier contact" };
    expect((await call("POST", `${path}/approve`, "approver")).status).toBe(403);
    expect((await call("POST", `${path}/verify`, "owner", note)).status).toBe(403);
    expect((await call("POST", `${path}/verify`, "analyst", note)).status).toBe(200);
    expect((await call("POST", `${path}/approve`, "analyst")).status).toBe(403);
    const approved = await call("POST", `${path}/approve`, "approver");
    expect([approved.status, approved.body.status]).toEqual([200, "approved"]);

    expect((await call("GET", path, "ownerB")).status).toBe(404);
    expect((await call("GET", "/api/v1/invoices", "ownerB")).body.filter((invoice: { id: string }) => invoice.id.startsWith("JIN-"))).toEqual([]);
    const bStatus = (await call("GET", "/api/v1/integrations", "ownerB")).body.jinius;
    expect([bStatus.last_run, bStatus.imported_count]).toEqual([null, 0]);
    const bRun = (await sync("ownerB")).body;
    expect([bRun.records_created, bRun.records_needs_review, bRun.records_skipped]).toEqual([0, 4, 0]);
    expect((await call("GET", "/api/v1/integrations", "owner")).body.jinius.needs_review_count).toBe(3);

    // Missing/invalid IBAN goes to human review; a new revision is a new, separately assessed invoice.
    const principal = { userId: owner, organizationId: orgA, role: "owner" };
    const base = demoSource()[0];
    const listed = apiClient(tokens, () => [{ ...base, id: "INV-9001", creditor_account: "" }, { ...base, id: "INV-9002", creditor_account: "NOT-AN-IBAN" }, { ...base, revision: "2" }]);
    const result = await listed.jinius.run(principal);
    expect([result.records_created, result.records_needs_review]).toEqual([1, 2]);
    const reasons = Object.fromEntries((await listed.jinius.integrations(principal)).jinius.needs_review!.map((row) => [row.external_id, row.reason]));
    expect([reasons["INV-9001"], reasons["INV-9002"]]).toEqual(["Invoice has no payment account", "Payment account is not a valid IBAN"]);
    expect((await pg.invoice("JIN-INV-2409-r2", principal)).risk).toBe(75);

    // A run that never reached its final write is closed by the next sync instead of showing "Running" forever.
    const stale = (await sql(`insert into public.sync_runs(organization_id,connection_id,status,started_at) select organization_id,id,'running',now()-interval '1 hour'
      from public.integration_connections where organization_id=$1 and provider='jinius' returning id`, [orgA]))[0].id;
    // A provider failure is stored with a safe message, never the raw exception text, in the API or the log.
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const failed = await apiClient(tokens, () => { throw new TypeError("provider said GB43TRST00000000000099"); }).jinius.run(principal);
    const log = logged.mock.calls.flat().join(" ");
    logged.mockRestore();
    expect(failed.status).toBe("failed");
    expect(failed.safe_error).not.toContain("GB43");
    expect(log).toContain("TypeError");
    expect(log).not.toContain("GB43");
    expect(await sql("select status, safe_error is not null as has_error from public.sync_runs where id=$1", [stale])).toEqual([{ status: "failed", has_error: true }]);

    // Overlapping syncs for one organization still import each record once and assess it once.
    const principalC = { userId: ownerC, organizationId: orgC, role: "owner" };
    const { jinius } = apiClient(tokens);
    const runs = await Promise.all([jinius.run(principalC), jinius.run(principalC)]);
    expect(runs.reduce((sum, item) => sum + item.records_created + item.records_needs_review, 0)).toBe(4);
    expect(runs.reduce((sum, item) => sum + item.records_skipped, 0)).toBe(4);
    expect(await count("select count(*)::int as n from public.integration_imports where organization_id=$1", [orgC])).toBe(4);
    expect(await count("select count(*)::int as n from public.invoices i join public.risk_assessments a on a.organization_id=i.organization_id and a.invoice_id=i.id where i.organization_id=$1", [orgC])).toBe(1);

    // RLS on integration_imports, checked directly: members read their own rows, outsiders none, browser clients cannot write.
    expect(await asMember(analyst, async (query) => (await query("select count(*)::int as n from public.integration_imports"))[0].n)).toBe(7);
    expect(await asMember(ownerB, async (query) => (await query("select count(*)::int as n from public.integration_imports where organization_id=$1", [orgA]))[0].n)).toBe(0);
    for (const statement of ["update public.integration_imports set status='assessed'", "delete from public.integration_imports"]) {
      await expect(asMember(owner, (query) => query(statement))).rejects.toMatchObject({ code: "42501" });
    }
    const actions = new Set((await call("GET", "/api/v1/audit", "owner")).body.map((event: { action: string }) => event.action));
    for (const action of ["INTEGRATION_SYNC", "IMPORT_NEEDS_REVIEW", "ASSESSED", "VERIFY", "APPROVE"]) expect(actions).toContain(action);
    expect(await count("select count(*)::int as n from public.payment_approvals where organization_id=$1", [orgA])).toBe(1);
  });

  it("resolves an unknown-supplier import once, by an authorized reviewer", async () => {
    const [orgA, orgB, owner, analyst, approver, ownerB] = [uuid(), uuid(), uuid(), uuid(), uuid(), uuid()];
    await seedMembers([[orgA, owner, "owner"], [orgA, analyst, "analyst"], [orgA, approver, "approver"], [orgB, ownerB, "owner"]], [[orgA, "Synthetic resolve test A"], [orgB, "Synthetic resolve test B"]]);
    // The reviewer's own supplier record for Kastro; the provider calls it SUP-003, which Org A does not use.
    await sql("insert into public.suppliers(id,organization_id,public_id,name) values ($1,$2,'KASTRO-LOCAL','Kastro Maintenance Ltd')", [uuid(), orgA]);
    const tokens = { owner: { user: owner, org: orgA }, analyst: { user: analyst, org: orgA }, approver: { user: approver, org: orgA }, ownerB: { user: ownerB, org: orgB } };
    const { call, jinius } = apiClient(tokens);
    const resolve = (token: keyof typeof tokens, external: string, supplier = "KASTRO-LOCAL") => call("POST", `/api/v1/integrations/jinius/imports/${external}/1/resolve`, token, { supplier_id: supplier });
    const ownerPrincipal = { userId: owner, organizationId: orgA, role: "owner" };
    const reviewer = { userId: analyst, organizationId: orgA, role: "analyst" };

    const run = await jinius.run(ownerPrincipal);
    expect([run.records_created, run.records_needs_review]).toEqual([0, 4]);
    const review = Object.fromEntries((await call("GET", "/api/v1/integrations", "owner")).body.jinius.needs_review.map((row: { external_id: string }) => [row.external_id, row]));
    expect([review["INV-2411"].resolvable, review["INV-2411"].supplier_reference]).toEqual([true, "SUP-003"]);

    expect((await resolve("approver", "INV-2411")).status).toBe(403);
    expect((await resolve("ownerB", "INV-2411")).status).toBe(404);
    expect((await resolve("analyst", "INV-2411", "NOPE")).status).toBe(404);
    expect((await resolve("analyst", "INV-0000")).status).toBe(404);

    const resolved = await resolve("analyst", "INV-2411");
    expect(resolved.status).toBe(200);
    expect([resolved.body.id, resolved.body.supplier_id, resolved.body.risk, resolved.body.status, resolved.body.reference]).toEqual(["JIN-INV-2411-r1", "KASTRO-LOCAL", 45, "needs_review", "Synthetic Jinius demo"]);
    expect((await resolve("analyst", "INV-2411")).status).toBe(422);
    const path = "/api/v1/invoices/JIN-INV-2411-r1";
    expect((await call("GET", `${path}/assessments`, "analyst")).body).toHaveLength(1);
    const status = (await call("GET", "/api/v1/integrations", "owner")).body.jinius;
    expect([status.imported_count, status.needs_review_count]).toEqual([1, 3]);

    // The resolver is the maker: they cannot verify; a different checker still can.
    const note = { evidence_note: "Synthetic callback to known supplier contact" };
    expect((await call("POST", `${path}/verify`, "analyst", note)).status).toBe(403);
    expect((await call("POST", `${path}/verify`, "owner", note)).status).toBe(200);
    expect((await call("POST", `${path}/approve`, "approver")).status).toBe(200);

    // Missing-IBAN rows are not resolvable by assigning a supplier.
    await apiClient(tokens, () => [{ ...demoSource()[0], id: "INV-9101", creditor_account: "" }]).jinius.run(ownerPrincipal);
    expect((await resolve("analyst", "INV-9101")).status).toBe(422);

    // If the provider stops returning the revision, nothing is assessed.
    await expect(apiClient(tokens, () => []).jinius.resolve("INV-2412", "1", "KASTRO-LOCAL", reviewer)).rejects.toMatchObject({ status: 422 });
    expect(await sql("select status from public.integration_imports where organization_id=$1 and external_id='INV-2412'", [orgA])).toEqual([{ status: "needs_review" }]);
    expect(await count("select count(*)::int as n from public.invoices where organization_id=$1", [orgA])).toBe(1);

    // Overlapping resolves of one row: exactly one assesses it, the other is refused after waiting for the lock.
    const attempt = () => jinius.resolve("INV-2410", "1", "KASTRO-LOCAL", reviewer).then((invoice) => invoice.id, (error) => { if (error instanceof StatusError && error.status === 422) return "refused"; throw error; });
    expect((await Promise.all([attempt(), attempt()])).sort()).toEqual(["JIN-INV-2410-r1", "refused"]);

    // The provider changed the record without a new revision: resolve refuses instead of assessing other data.
    const changed = { ...demoSource().find((record) => record.id === "INV-2409")!, amount_cents: 1 };
    await expect(apiClient(tokens, () => [changed]).jinius.resolve("INV-2409", "1", "KASTRO-LOCAL", reviewer)).rejects.toThrow(/changed/);

    // The failed INV-2412 attempt above wrote nothing, so a retry resolves it once.
    expect((await jinius.resolve("INV-2412", "1", "KASTRO-LOCAL", reviewer)).id).toBe("JIN-INV-2412-r1");
    expect(await count("select count(*)::int as n from public.invoices where organization_id=$1", [orgA])).toBe(3);
    expect(await count("select count(*)::int as n from public.risk_assessments where organization_id=$1", [orgA])).toBe(3);
    expect(await sql("select status from public.integration_imports where organization_id=$1 and external_id='INV-2409'", [orgA])).toEqual([{ status: "needs_review" }]);
    expect((await call("GET", "/api/v1/audit", "owner")).body.map((event: { action: string }) => event.action)).toContain("IMPORT_RESOLVED");
  });
});
