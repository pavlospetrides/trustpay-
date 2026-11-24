"""Automatic Jinius sync (#18). Runs only against an explicitly designated disposable migrated Supabase database."""

import base64
import json
import os
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from decimal import Decimal
from uuid import uuid4

import psycopg
import pytest
from fastapi.testclient import TestClient

from app.fixtures import synthetic_iban
from app.jinius import DemoJiniusAdapter
from app.main import create_app
from app.postgres_store import Principal
from app.security import AccountProtector

pytestmark = pytest.mark.skipif(
    not os.environ.get("TRUSTPAY_TEST_DATABASE_URL") or os.environ.get("TRUSTPAY_TEST_CONFIRM") != "disposable",
    reason="Requires TRUSTPAY_TEST_DATABASE_URL and TRUSTPAY_TEST_CONFIRM=disposable",
)


class ListAdapter:
    source = "jinius_demo_adapter"

    def __init__(self, records):
        self.records = records

    def list_invoices(self):
        return list(self.records)


class BrokenAdapter:
    source = "jinius_demo_adapter"

    def list_invoices(self):
        raise RuntimeError("provider said GB43TRST00000000000099")


def as_member(con, user):
    """Act as a signed-in browser client so RLS and grants apply, not the service connection."""
    con.execute("set local role authenticated")
    con.execute("select set_config('request.jwt.claims', %s, true)", (json.dumps({"sub": str(user), "role": "authenticated"}),))


def test_jinius_sync_is_idempotent_isolated_and_keeps_maker_checker(monkeypatch, caplog):
    dsn = os.environ["TRUSTPAY_TEST_DATABASE_URL"]
    org_a, org_b, org_c = uuid4(), uuid4(), uuid4()
    owner, analyst, approver, owner_b, owner_c = (uuid4() for _ in range(5))
    supplier_a, account_id = uuid4(), uuid4()
    protected = AccountProtector(b"a" * 32, b"b" * 32)
    ciphertext, fingerprint, last4 = protected.protect(synthetic_iban(1))
    with psycopg.connect(dsn) as con:
        for user in (owner, analyst, approver, owner_b, owner_c):
            con.execute("insert into auth.users(id,email) values (%s,%s)", (user, f"{user}@example.invalid"))
        for org, label in ((org_a, "A"), (org_b, "B"), (org_c, "C")):
            con.execute("insert into public.organizations(id,name,country) values (%s,%s,'CY')",
                        (org, f"Synthetic sync test {label}"))
        for org, user, role in ((org_a, owner, "owner"), (org_a, analyst, "analyst"),
                                (org_a, approver, "approver"), (org_b, owner_b, "owner"), (org_c, owner_c, "owner")):
            con.execute("""insert into public.organization_memberships(organization_id,user_id,role)
                values (%s,%s,%s)""", (org, user, role))
        con.execute("""insert into public.suppliers(id,organization_id,public_id,name)
            values (%s,%s,'SUP-004','Synthetic concurrent supplier')""", (uuid4(), org_c))
        # Org A knows only SUP-001 (the demo changed-IBAN supplier); the other demo suppliers are unknown.
        con.execute("""insert into public.suppliers(id,organization_id,public_id,name)
            values (%s,%s,'SUP-001','Aegean Supplies Ltd')""", (supplier_a, org_a))
        con.execute("""insert into public.supplier_bank_accounts
            (id,organization_id,supplier_id,encrypted_iban,iban_fingerprint,iban_last4,verification_status,last_verified_at)
            values (%s,%s,%s,%s,%s,%s,'verified',now())""",
            (account_id, org_a, supplier_a, ciphertext, fingerprint, last4))
        for i in range(14):
            con.execute("""insert into public.payment_records
                (organization_id,supplier_id,bank_account_id,historical_invoice_number,amount,currency,status,paid_at,source)
                values (%s,%s,%s,%s,%s,'EUR','paid',now(),'synthetic_test')""",
                (org_a, supplier_a, account_id, f"AS-HIST-{i}", Decimal("8420.00")))

    monkeypatch.setenv("TRUSTPAY_BACKEND", "postgres")
    monkeypatch.setenv("TRUSTPAY_DATABASE_URL", dsn)
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", "test-publishable")
    monkeypatch.setenv("TRUSTPAY_IBAN_ENCRYPTION_KEY", base64.b64encode(b"a" * 32).decode())
    monkeypatch.setenv("TRUSTPAY_IBAN_FINGERPRINT_KEY", base64.b64encode(b"b" * 32).decode())
    tokens = {"owner": owner, "analyst": analyst, "approver": approver, "owner_b": owner_b}
    monkeypatch.setattr("app.auth.SupabaseAuth.user_id", lambda self, token: tokens[token])
    app = create_app()
    client = TestClient(app)
    org_of = {"owner": org_a, "analyst": org_a, "approver": org_a, "owner_b": org_b}
    headers = lambda token: {"Authorization": f"Bearer {token}", "X-Organization-Id": str(org_of[token])}
    sync = lambda token: client.post("/api/v1/integrations/jinius/sync", headers=headers(token))

    # Role check: only owners/admins trigger a sync.
    assert sync("analyst").status_code == 403
    assert sync("approver").status_code == 403

    first = sync("owner")
    assert first.status_code == 200, first.text
    run = first.json()
    assert (run["status"], run["records_seen"], run["records_created"], run["records_needs_review"],
            run["records_skipped"], run["safe_error"]) == ("success", 4, 1, 3, 0, None)

    # Idempotency: a re-sync creates no invoices, assessments or review rows.
    second = sync("owner").json()
    assert (second["records_created"], second["records_needs_review"], second["records_skipped"]) == (0, 0, 4)
    imported = [x for x in client.get("/api/v1/invoices", headers=headers("owner")).json()
                if x["source"] == "jinius_demo_adapter"]
    assert [x["id"] for x in imported] == ["JIN-INV-2409-r1"]
    invoice = imported[0]
    assert (invoice["risk"], invoice["kind"], invoice["status"]) == (75, "iban", "needs_review")
    assert invoice["reference"] == "Synthetic Jinius demo" and invoice["history"] == 14
    path = "/api/v1/invoices/JIN-INV-2409-r1"
    assert len(client.get(path + "/assessments", headers=headers("owner")).json()) == 1
    with psycopg.connect(dsn) as con:
        assert con.execute("select count(*) from public.integration_imports where organization_id=%s",
                           (org_a,)).fetchone()[0] == 4
        runs = con.execute("""select status, records_seen from public.sync_runs where organization_id=%s
            order by started_at""", (org_a,)).fetchall()
        assert runs == [("success", 4), ("success", 4)]
        assert con.execute("select external_source, external_invoice_id, created_by from public.invoices "
                           "where organization_id=%s and public_id='JIN-INV-2409-r1'", (org_a,)).fetchone() \
            == ("jinius_demo_adapter", "INV-2409", owner)

    status = client.get("/api/v1/integrations", headers=headers("owner")).json()["jinius"]
    assert status["sync_available"] and status["live_connected"] is False
    assert status["imported_count"] == 1 and status["needs_review_count"] == 3
    assert {r["reason"] for r in status["needs_review"]} == {"Supplier is not known in this organization"}
    assert status["last_success_at"] and status["last_run"]["records_skipped"] == 4

    # Same maker-checker gates as uploads: no approval before verification, sync runner cannot verify.
    assert client.post(path + "/approve", headers=headers("approver")).status_code == 403
    note = {"evidence_note": "Synthetic callback to known supplier contact"}
    assert client.post(path + "/verify", json=note, headers=headers("owner")).status_code == 403
    assert client.post(path + "/verify", json=note, headers=headers("analyst")).status_code == 200
    assert client.post(path + "/approve", headers=headers("analyst")).status_code == 403
    approved = client.post(path + "/approve", headers=headers("approver"))
    assert approved.status_code == 200 and approved.json()["status"] == "approved"

    # Tenant isolation: Org B cannot see Org A imports, and its own sync is keyed separately.
    assert client.get(path, headers=headers("owner_b")).status_code == 404
    assert not [x for x in client.get("/api/v1/invoices", headers=headers("owner_b")).json()
                if x["id"].startswith("JIN-")]
    b_status = client.get("/api/v1/integrations", headers=headers("owner_b")).json()["jinius"]
    assert b_status["last_run"] is None and b_status["imported_count"] == 0
    b_run = sync("owner_b").json()
    assert (b_run["records_created"], b_run["records_needs_review"], b_run["records_skipped"]) == (0, 4, 0)
    assert client.get("/api/v1/integrations", headers=headers("owner")).json()["jinius"]["needs_review_count"] == 3

    # Missing/invalid IBAN goes to human review; a new revision is a new, separately assessed invoice.
    store, principal = app.state.store, Principal(owner, org_a, "owner")
    base = DemoJiniusAdapter().list_invoices()[0]
    result = store.sync_invoices(ListAdapter([
        replace(base, id="INV-9001", creditor_account=""),
        replace(base, id="INV-9002", creditor_account="NOT-AN-IBAN"),
        replace(base, revision="2"),
    ]), principal)
    assert (result["records_created"], result["records_needs_review"]) == (1, 2)
    reasons = {r["external_id"]: r["reason"] for r in store.integrations(principal)["jinius"]["needs_review"]}
    assert reasons["INV-9001"] == "Invoice has no payment account"
    assert reasons["INV-9002"] == "Payment account is not a valid IBAN"
    assert store.invoice("JIN-INV-2409-r2", principal)["risk"] == 75

    # A run that never reached its final write is closed by the next sync instead of showing "Running" forever.
    with psycopg.connect(dsn) as con:
        stale = con.execute("""insert into public.sync_runs(organization_id,connection_id,status,started_at)
            select organization_id,id,'running',now()-interval '1 hour' from public.integration_connections
            where organization_id=%s and provider='jinius' returning id""", (org_a,)).fetchone()[0]

    # A provider failure is recorded with a safe message, never the raw exception text, in the API or the log.
    caplog.clear()
    failed = store.sync_invoices(BrokenAdapter(), principal)
    assert failed["status"] == "failed" and "GB43" not in failed["safe_error"]
    assert "RuntimeError" in caplog.text and "GB43" not in caplog.text
    with psycopg.connect(dsn) as con:
        assert con.execute("select status, safe_error is not null from public.sync_runs where id=%s",
                           (stale,)).fetchone() == ("failed", True)

    # Overlapping syncs for one organization still import each record once and assess it once.
    principal_c = Principal(owner_c, org_c, "owner")
    with ThreadPoolExecutor(2) as pool:
        runs = list(pool.map(lambda _: store.sync_invoices(DemoJiniusAdapter(), principal_c), range(2)))
    assert sum(r["records_created"] + r["records_needs_review"] for r in runs) == 4
    assert sum(r["records_skipped"] for r in runs) == 4
    with psycopg.connect(dsn) as con:
        assert con.execute("select count(*) from public.integration_imports where organization_id=%s",
                           (org_c,)).fetchone()[0] == 4
        assert con.execute("""select count(*) from public.invoices i join public.risk_assessments a
            on a.organization_id=i.organization_id and a.invoice_id=i.id where i.organization_id=%s""",
            (org_c,)).fetchone()[0] == 1

    # RLS on integration_imports, checked directly: members read their own rows, outsiders see none,
    # and browser clients cannot write.
    with psycopg.connect(dsn) as con:
        as_member(con, analyst)
        assert con.execute("select count(*) from public.integration_imports").fetchone()[0] == 7
    with psycopg.connect(dsn) as con:
        as_member(con, owner_b)
        assert con.execute("select count(*) from public.integration_imports where organization_id=%s",
                           (org_a,)).fetchone()[0] == 0
    for statement in ("update public.integration_imports set status='assessed'",
                      "delete from public.integration_imports"):
        with psycopg.connect(dsn) as con:
            as_member(con, owner)
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                con.execute(statement)

    actions = [entry["action"] for entry in client.get("/api/v1/audit", headers=headers("owner")).json()]
    assert {"INTEGRATION_SYNC", "IMPORT_NEEDS_REVIEW", "ASSESSED", "VERIFY", "APPROVE"}.issubset(actions)
    with psycopg.connect(dsn) as con:
        assert con.execute("select count(*) from public.payment_approvals where organization_id=%s",
                           (org_a,)).fetchone()[0] == 1
