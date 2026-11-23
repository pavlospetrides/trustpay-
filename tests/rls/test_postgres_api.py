"""Runs only against an explicitly designated disposable migrated Supabase database."""

import base64
import os
from decimal import Decimal
from uuid import uuid4

import psycopg
import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.security import AccountProtector
from supabase.seed import synthetic_iban


@pytest.mark.skipif(
    not os.environ.get("TRUSTPAY_TEST_DATABASE_URL") or os.environ.get("TRUSTPAY_TEST_CONFIRM") != "disposable",
    reason="Requires TRUSTPAY_TEST_DATABASE_URL and TRUSTPAY_TEST_CONFIRM=disposable",
)
def test_postgres_api_tenant_isolation_and_approval_bypass(monkeypatch):
    dsn = os.environ["TRUSTPAY_TEST_DATABASE_URL"]
    org_a, org_b = uuid4(), uuid4()
    maker, outsider, verifier, approver = (uuid4() for _ in range(4))
    supplier_a, supplier_b, account_id = uuid4(), uuid4(), uuid4()
    protected = AccountProtector(b"a" * 32, b"b" * 32)
    ciphertext, fingerprint, last4 = protected.protect(synthetic_iban(1))
    with psycopg.connect(dsn) as con:
        for user in (maker, outsider, verifier, approver):
            con.execute("insert into auth.users(id,email) values (%s,%s)", (user, f"{user}@example.invalid"))
        for org, label in ((org_a, "A"), (org_b, "B")):
            con.execute("insert into public.organizations(id,name,country) values (%s,%s,'CY')", (org, f"Synthetic test {label}"))
        for org, user, role in ((org_a, maker, "analyst"), (org_b, outsider, "approver"),
                                (org_a, verifier, "analyst"), (org_a, approver, "approver")):
            con.execute("""insert into public.organization_memberships(organization_id,user_id,role)
                values (%s,%s,%s)""", (org, user, role))
        for supplier, org in ((supplier_a, org_a), (supplier_b, org_b)):
            con.execute("""insert into public.suppliers(id,organization_id,public_id,name)
                values (%s,%s,'TEST-SUP','Synthetic test supplier')""", (supplier, org))
        con.execute("""insert into public.supplier_bank_accounts
            (id,organization_id,supplier_id,encrypted_iban,iban_fingerprint,iban_last4,verification_status,last_verified_at)
            values (%s,%s,%s,%s,%s,%s,'verified',now())""",
            (account_id, org_a, supplier_a, ciphertext, fingerprint, last4))
        for i in range(14):
            con.execute("""insert into public.payment_records
                (organization_id,supplier_id,bank_account_id,historical_invoice_number,amount,currency,status,paid_at,source)
                values (%s,%s,%s,%s,%s,'EUR','paid',now(),'synthetic_test')""",
                (org_a, supplier_a, account_id, f"HIST-{i}", Decimal("8420.00")))

    monkeypatch.setenv("TRUSTPAY_BACKEND", "postgres")
    monkeypatch.setenv("TRUSTPAY_DATABASE_URL", dsn)
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", "test-publishable")
    monkeypatch.setenv("TRUSTPAY_IBAN_ENCRYPTION_KEY", base64.b64encode(b"a" * 32).decode())
    monkeypatch.setenv("TRUSTPAY_IBAN_FINGERPRINT_KEY", base64.b64encode(b"b" * 32).decode())
    token_users = {"maker": maker, "outsider": outsider, "verifier": verifier, "approver": approver}
    monkeypatch.setattr("app.auth.SupabaseAuth.user_id", lambda self, token: token_users[token])
    client = TestClient(create_app())
    headers = lambda token, org: {"Authorization": f"Bearer {token}", "X-Organization-Id": str(org)}
    public_id = f"TEST-{uuid4().hex[:12]}"
    payload = {"id": public_id, "supplier_id": "TEST-SUP", "invoice_number": "NEW-001",
               "amount_cents": 842000, "creditor_account": synthetic_iban(99), "invoice_date": "2026-11-23"}
    created = client.post("/api/v1/invoices/assess", json=payload, headers=headers("maker", org_a))
    assert created.status_code == 201, created.text
    assert created.json()["risk"] == 75 and created.json()["history"] == 14
    path = f"/api/v1/invoices/{public_id}"
    assert client.get(path, headers=headers("outsider", org_b)).status_code == 404
    assert client.get(path, headers=headers("outsider", org_a)).status_code == 403
    assert client.post(path + "/approve", headers=headers("maker", org_a)).status_code == 403
    assert client.post(path + "/approve", headers=headers("approver", org_a)).status_code == 403
    verified = client.post(path + "/verify", json={"evidence_note": "Synthetic independent callback record"},
                           headers=headers("verifier", org_a))
    assert verified.status_code == 200, verified.text
    approved = client.post(path + "/approve", headers=headers("approver", org_a))
    assert approved.status_code == 200 and approved.json()["status"] == "approved"
    actions = {entry["action"] for entry in client.get("/api/v1/audit", headers=headers("maker", org_a)).json()}
    assert {"ASSESSED", "VERIFY", "APPROVE"}.issubset(actions)
