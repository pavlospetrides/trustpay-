"""Full synthetic intake flow, only against an explicitly disposable Supabase stack."""

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
from tests.test_invoice_ai import synthetic_pdf


@pytest.mark.skipif(
    not os.environ.get("TRUSTPAY_TEST_DATABASE_URL") or os.environ.get("TRUSTPAY_TEST_CONFIRM") != "disposable",
    reason="Requires a migrated disposable Supabase stack",
)
def test_synthetic_pdf_intake_review_risk_and_approval(monkeypatch):
    dsn = os.environ["TRUSTPAY_TEST_DATABASE_URL"]
    org_a, org_b = uuid4(), uuid4()
    maker, outsider, verifier, approver = (uuid4() for _ in range(4))
    supplier_id, bank_id = uuid4(), uuid4()
    protector = AccountProtector(b"a" * 32, b"b" * 32)
    ciphertext, fingerprint, last4 = protector.protect(synthetic_iban(1))
    with psycopg.connect(dsn) as con:
        for user in (maker, outsider, verifier, approver):
            con.execute("insert into auth.users(id,email) values (%s,%s)", (user, f"{user}@example.invalid"))
        for org in (org_a, org_b):
            con.execute("insert into public.organizations(id,name,country) values (%s,%s,'CY')", (org, "Phase 2 synthetic test"))
        for org, user, role in ((org_a, maker, "analyst"), (org_b, outsider, "analyst"),
                                (org_a, verifier, "analyst"), (org_a, approver, "approver")):
            con.execute("insert into public.organization_memberships(organization_id,user_id,role) values (%s,%s,%s)",
                        (org, user, role))
        con.execute("insert into public.suppliers(id,organization_id,public_id,name) values (%s,%s,'TEST-SUP','Synthetic test supplier')",
                    (supplier_id, org_a))
        con.execute("""insert into public.supplier_bank_accounts
            (id,organization_id,supplier_id,encrypted_iban,iban_fingerprint,iban_last4,verification_status,last_verified_at)
            values (%s,%s,%s,%s,%s,%s,'verified',now())""",
            (bank_id, org_a, supplier_id, ciphertext, fingerprint, last4))
        for i in range(14):
            con.execute("""insert into public.payment_records
                (organization_id,supplier_id,bank_account_id,historical_invoice_number,amount,currency,status,paid_at,source)
                values (%s,%s,%s,%s,%s,'EUR','paid',now(),'synthetic_test')""",
                (org_a, supplier_id, bank_id, f"HIST-{i}", Decimal("8420.00")))

    monkeypatch.setenv("TRUSTPAY_BACKEND", "postgres")
    monkeypatch.setenv("TRUSTPAY_DATABASE_URL", dsn)
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", "test-publishable")
    monkeypatch.setenv("TRUSTPAY_IBAN_ENCRYPTION_KEY", base64.b64encode(b"a" * 32).decode())
    monkeypatch.setenv("TRUSTPAY_IBAN_FINGERPRINT_KEY", base64.b64encode(b"b" * 32).decode())
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setenv("TRUSTPAY_AI_EXTERNAL_DOCUMENTS", "disabled")
    tokens = {"maker": maker, "outsider": outsider, "verifier": verifier, "approver": approver}
    monkeypatch.setattr("app.auth.SupabaseAuth.user_id", lambda self, token: tokens[token])
    objects = {}
    monkeypatch.setattr("app.documents.PrivateInvoiceStorage.upload",
                        lambda self, path, content_type, data: objects.setdefault(path, data))
    monkeypatch.setattr("app.documents.PrivateInvoiceStorage.download", lambda self, path: objects[path])
    client = TestClient(create_app())
    headers = lambda token, org: {"Authorization": f"Bearer {token}", "X-Organization-Id": str(org)}
    text = f"""TRUSTPAY SYNTHETIC INVOICE
Supplier: Synthetic test supplier
Invoice Number: NEW-456
Invoice Date: 2026-11-23
Total Amount: 8420.00
Currency: EUR
IBAN: {synthetic_iban(99)}
"""
    data = synthetic_pdf(text)
    upload_headers = {**headers("maker", org_a), "Idempotency-Key": "phase2-synthetic-one"}
    upload = client.post("/api/v1/invoice-intakes", files={"file": ("synthetic.pdf", data, "application/pdf")},
                         headers=upload_headers)
    assert upload.status_code == 201, upload.text
    draft = upload.json()
    assert draft["fields"]["invoice_number"] == "NEW-456" and draft["status"] == "needs_review"
    retry = client.post("/api/v1/invoice-intakes", files={"file": ("synthetic.pdf", data, "application/pdf")},
                        headers=upload_headers)
    assert retry.status_code == 201 and retry.json()["id"] == draft["id"]
    conflict = client.post("/api/v1/invoice-intakes", files={"file": ("other.pdf", synthetic_pdf(text + "Note: different\n"), "application/pdf")},
                           headers=upload_headers)
    assert conflict.status_code == 409
    path = f"/api/v1/invoice-intakes/{draft['id']}"
    assert client.get(path, headers=headers("outsider", org_b)).status_code == 404
    for attempt in (2, 3):
        extracted = client.post(path + "/extract", headers=headers("maker", org_a))
        assert extracted.status_code == 200 and extracted.json()["extraction_attempts"] == attempt
    assert client.post(path + "/extract", headers=headers("maker", org_a)).status_code == 429
    review = client.patch(path, json={"fields": draft["fields"], "supplier_id": "TEST-SUP",
                                      "create_new_supplier": False}, headers=headers("maker", org_a))
    assert review.status_code == 200, review.text
    assert review.json()["status"] == "reviewed"
    analyzed = client.post(path + "/analyze", headers=headers("maker", org_a))
    assert analyzed.status_code == 200, analyzed.text
    invoice = analyzed.json()
    assert invoice["risk"] == 75 and invoice["history"] == 14
    assert invoice["status"] == "needs_review"
    assert invoice["ai_explanation_method"] == "verified_policy"
    assert "Independently verify" in invoice["ai_explanation"]
    assert synthetic_iban(99) not in str(invoice)
    invoice_path = f"/api/v1/invoices/{invoice['id']}"
    assert len(client.get(invoice_path + "/documents", headers=headers("maker", org_a)).json()) == 1
    assert client.post(invoice_path + "/approve", headers=headers("approver", org_a)).status_code == 403
    history = client.get(invoice_path + "/assessments", headers=headers("maker", org_a))
    assert history.status_code == 200 and len(history.json()) == 1
    detail = client.get(invoice_path + f"/assessments/{history.json()[0]['id']}", headers=headers("maker", org_a))
    assert detail.status_code == 200 and detail.json()["evidence"]["historical_payment_count"] == 14
    assert client.post(invoice_path + "/verify", json={"evidence_note": "Synthetic independent supplier callback"},
                       headers=headers("verifier", org_a)).status_code == 200
    assert client.post(invoice_path + "/approve", headers=headers("approver", org_a)).json()["status"] == "approved"
    actions = {event["action"] for event in client.get("/api/v1/audit", headers=headers("maker", org_a)).json()}
    assert {"INTAKE_UPLOADED", "INTAKE_REVIEWED", "ASSESSED", "APPROVE"}.issubset(actions)

    unknown_text = text.replace("Synthetic test supplier", "New synthetic supplier").replace("NEW-456", "NEW-789")
    second = client.post("/api/v1/invoice-intakes", files={"file": ("unknown.pdf", synthetic_pdf(unknown_text), "application/pdf")},
                         headers={**headers("maker", org_a), "Idempotency-Key": "phase2-synthetic-two"})
    assert second.status_code == 201
    unknown = client.patch(f"/api/v1/invoice-intakes/{second.json()['id']}",
                           json={"fields": second.json()["fields"], "supplier_id": None, "create_new_supplier": True},
                           headers=headers("maker", org_a))
    assert unknown.status_code == 200
    new_invoice = client.post(f"/api/v1/invoice-intakes/{second.json()['id']}/analyze", headers=headers("maker", org_a))
    assert new_invoice.status_code == 200, new_invoice.text
    assert new_invoice.json()["history"] == 0 and new_invoice.json()["risk"] == 45
