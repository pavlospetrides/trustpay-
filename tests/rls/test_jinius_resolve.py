"""Resolving unknown-supplier Jinius imports (#20). Runs only against a disposable migrated Supabase database."""

import base64
import os
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from uuid import uuid4

import psycopg
import pytest
from fastapi.testclient import TestClient

from app.jinius import DemoJiniusAdapter
from app.main import create_app
from app.postgres_store import Principal

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


def test_unknown_supplier_import_is_resolved_once_by_an_authorized_reviewer(monkeypatch):
    dsn = os.environ["TRUSTPAY_TEST_DATABASE_URL"]
    org_a, org_b = uuid4(), uuid4()
    owner, analyst, approver, owner_b = (uuid4() for _ in range(4))
    with psycopg.connect(dsn) as con:
        for user in (owner, analyst, approver, owner_b):
            con.execute("insert into auth.users(id,email) values (%s,%s)", (user, f"{user}@example.invalid"))
        for org, label in ((org_a, "A"), (org_b, "B")):
            con.execute("insert into public.organizations(id,name,country) values (%s,%s,'CY')",
                        (org, f"Synthetic resolve test {label}"))
        for org, user, role in ((org_a, owner, "owner"), (org_a, analyst, "analyst"),
                                (org_a, approver, "approver"), (org_b, owner_b, "owner")):
            con.execute("""insert into public.organization_memberships(organization_id,user_id,role)
                values (%s,%s,%s)""", (org, user, role))
        # The reviewer's own supplier record for Kastro; the provider calls it SUP-003, which Org A does not use.
        con.execute("""insert into public.suppliers(id,organization_id,public_id,name)
            values (%s,%s,'KASTRO-LOCAL','Kastro Maintenance Ltd')""", (uuid4(), org_a))

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
    resolve = lambda token, ext, supplier="KASTRO-LOCAL", rev="1": client.post(
        f"/api/v1/integrations/jinius/imports/{ext}/{rev}/resolve", json={"supplier_id": supplier},
        headers=headers(token))

    # Org A knows none of the provider's supplier references, so every demo record waits for review.
    store = app.state.store
    run = store.sync_invoices(DemoJiniusAdapter(), Principal(owner, org_a, "owner"))
    assert (run["records_created"], run["records_needs_review"]) == (0, 4)
    review = {r["external_id"]: r for r in
              client.get("/api/v1/integrations", headers=headers("owner")).json()["jinius"]["needs_review"]}
    assert review["INV-2411"]["resolvable"] and review["INV-2411"]["supplier_reference"] == "SUP-003"

    # Role, tenant and input checks come before any write.
    assert resolve("approver", "INV-2411").status_code == 403
    assert resolve("owner_b", "INV-2411").status_code == 404
    assert resolve("analyst", "INV-2411", supplier="NOPE").status_code == 404
    assert resolve("analyst", "INV-0000").status_code == 404

    resolved = resolve("analyst", "INV-2411")
    assert resolved.status_code == 200, resolved.text
    invoice = resolved.json()
    assert invoice["id"] == "JIN-INV-2411-r1" and invoice["supplier_id"] == "KASTRO-LOCAL"
    assert (invoice["risk"], invoice["status"], invoice["reference"]) == (45, "needs_review", "Synthetic Jinius demo")

    # Exactly once: a second resolve is refused and no second assessment appears.
    assert resolve("analyst", "INV-2411").status_code == 422
    path = "/api/v1/invoices/JIN-INV-2411-r1"
    assert len(client.get(path + "/assessments", headers=headers("analyst")).json()) == 1
    status = client.get("/api/v1/integrations", headers=headers("owner")).json()["jinius"]
    assert status["imported_count"] == 1 and status["needs_review_count"] == 3

    # The resolver is the maker: they cannot verify; a different checker path still applies.
    note = {"evidence_note": "Synthetic callback to known supplier contact"}
    assert client.post(path + "/verify", json=note, headers=headers("analyst")).status_code == 403
    assert client.post(path + "/verify", json=note, headers=headers("owner")).status_code == 200
    assert client.post(path + "/approve", headers=headers("approver")).status_code == 200

    # Missing-IBAN rows are not resolvable by assigning a supplier.
    principal = Principal(owner, org_a, "owner")
    store.sync_invoices(ListAdapter([replace(DemoJiniusAdapter().list_invoices()[0], id="INV-9101",
                                             creditor_account="")]), principal)
    assert resolve("analyst", "INV-9101").status_code == 422

    # If the provider stops returning the revision, nothing is assessed.
    with pytest.raises(ValueError):
        store.resolve_import("INV-2412", "1", "KASTRO-LOCAL", ListAdapter([]), Principal(analyst, org_a, "analyst"))
    with psycopg.connect(dsn) as con:
        assert con.execute("""select status from public.integration_imports where organization_id=%s
            and external_id='INV-2412'""", (org_a,)).fetchone()[0] == "needs_review"
        assert con.execute("select count(*) from public.invoices where organization_id=%s", (org_a,)).fetchone()[0] == 1

    # Overlapping resolves of one row: exactly one assesses it, the other is refused after waiting for the lock.
    reviewer = Principal(analyst, org_a, "analyst")

    def attempt(_):
        try:
            return store.resolve_import("INV-2410", "1", "KASTRO-LOCAL", DemoJiniusAdapter(), reviewer)["id"]
        except ValueError:
            return "refused"
    with ThreadPoolExecutor(2) as pool:
        assert sorted(pool.map(attempt, range(2))) == ["JIN-INV-2410-r1", "refused"]

    # The provider changed the record without a new revision: resolve refuses instead of assessing other data.
    changed = replace(next(r for r in DemoJiniusAdapter().list_invoices() if r.id == "INV-2409"), amount_cents=1)
    with pytest.raises(ValueError, match="changed"):
        store.resolve_import("INV-2409", "1", "KASTRO-LOCAL", ListAdapter([changed]), reviewer)

    # Rollback and retry: the failed INV-2412 attempt above wrote nothing, so a retry resolves it once.
    assert store.resolve_import("INV-2412", "1", "KASTRO-LOCAL", DemoJiniusAdapter(), reviewer)["id"] == "JIN-INV-2412-r1"
    with psycopg.connect(dsn) as con:
        assert con.execute("select count(*) from public.invoices where organization_id=%s", (org_a,)).fetchone()[0] == 3
        assert con.execute("select count(*) from public.risk_assessments where organization_id=%s",
                           (org_a,)).fetchone()[0] == 3
        assert con.execute("""select status from public.integration_imports where organization_id=%s
            and external_id='INV-2409'""", (org_a,)).fetchone()[0] == "needs_review"

    actions = [e["action"] for e in client.get("/api/v1/audit", headers=headers("owner")).json()]
    assert "IMPORT_RESOLVED" in actions
