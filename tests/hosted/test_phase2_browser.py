"""Manual real-browser verification against the named synthetic development project only."""

import os
from pathlib import Path
from uuid import uuid4

import httpx
import psycopg
import pytest
from dotenv import load_dotenv

from supabase.seed import synthetic_iban
from tests.test_invoice_ai import synthetic_pdf


ROOT = Path(__file__).resolve().parents[2]
PROJECT_REF = "dtoqrscbbdacqpaqxgpr"
ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"


@pytest.mark.skipif(os.getenv("TRUSTPAY_HOSTED_E2E_CONFIRM") != "development",
                    reason="Explicitly opt in to the named synthetic hosted development project")
def test_signed_in_synthetic_invoice_workflow():
    from playwright.sync_api import sync_playwright, expect

    load_dotenv(ROOT / ".env", override=False)
    load_dotenv(ROOT / ".env.e2e", override=False)
    assert os.environ["TRUSTPAY_ENVIRONMENT"] == "development"
    assert os.environ["TRUSTPAY_E2E_PROJECT_REF"] == PROJECT_REF
    assert PROJECT_REF in os.environ["SUPABASE_URL"]
    assert PROJECT_REF in os.environ["TRUSTPAY_DATABASE_URL"]
    assert os.environ["TRUSTPAY_E2E_MAKER_ORG"] == ORG_A
    assert os.environ["TRUSTPAY_E2E_OUTSIDER_ORG"] == ORG_B

    base = "http://127.0.0.1:3000"
    api = "http://127.0.0.1:8000/api/v1"
    reference = "E2E-" + uuid4().hex[:10].upper()
    iban = synthetic_iban(900000 + int(uuid4().hex[:5], 16))
    pdf = synthetic_pdf(f"""TRUSTPAY SYNTHETIC INVOICE
Supplier: Aegean Supplies Synthetic Ltd
Invoice Number: {reference}
Invoice Date: 2026-11-23
Due Date: 2026-12-23
Total Amount: 8420.00
Currency: EUR
IBAN: {iban}
Payment Reference: {reference}
""")

    def token(client: httpx.Client, role: str) -> str:
        response = client.post(os.environ["SUPABASE_URL"].rstrip("/") + "/auth/v1/token",
            params={"grant_type": "password"},
            headers={"apikey": os.environ["SUPABASE_PUBLISHABLE_KEY"]},
            json={"email": os.environ[f"TRUSTPAY_E2E_{role}_EMAIL"],
                  "password": os.environ[f"TRUSTPAY_E2E_{role}_PASSWORD"]})
        assert response.status_code == 200, f"{role} password sign-in failed ({response.status_code})"
        return response.json()["access_token"]

    def headers(access_token: str, organization_id: str = ORG_A) -> dict:
        return {"Authorization": f"Bearer {access_token}", "X-Organization-Id": organization_id}

    with httpx.Client(timeout=20) as client, sync_playwright() as playwright:
        assert client.get("http://127.0.0.1:8000/api/health").json()["mode"] == "supabase-postgres"
        browser = playwright.chromium.launch(headless=True)

        def sign_in(role: str):
            context = browser.new_context()
            page = context.new_page()
            page.goto(base + "/login")
            page.get_by_label("Email").fill(os.environ[f"TRUSTPAY_E2E_{role}_EMAIL"])
            page.get_by_label("Password").fill(os.environ[f"TRUSTPAY_E2E_{role}_PASSWORD"])
            page.get_by_role("button", name="Sign in").click()
            expect(page).to_have_url(base + "/app/overview", timeout=20000)
            return context, page

        maker_context, maker = sign_in("MAKER")
        maker.goto(base + "/app/payments/new")
        expect(maker.get_by_text("Upload and review an invoice")).to_be_visible()
        maker.locator('input[type="file"]').set_input_files(
            {"name": "synthetic-changed-account.pdf", "mimeType": "application/pdf", "buffer": pdf})
        maker.get_by_role("button", name="Upload invoice").click()
        expect(maker).to_have_url(__import__("re").compile(r"/app/intakes/[0-9a-f-]+$"), timeout=30000)
        intake_id = maker.url.rsplit("/", 1)[-1]
        expect(maker.get_by_label("Invoice number")).to_have_value(reference)
        expect(maker.get_by_label("Destination IBAN")).to_have_value(iban)
        maker.get_by_label("Supplier match").select_option("SUP-001")
        maker.get_by_role("button", name="Save corrections").click()
        expect(maker.get_by_text("Reviewed fields saved", exact=False)).to_be_visible()
        maker.get_by_role("button", name="Analyze risk").click()
        expect(maker).to_have_url(__import__("re").compile(r"/app/payments/UPL-[A-Z0-9]+$"), timeout=30000)
        invoice_id = maker.url.rsplit("/", 1)[-1]
        expect(maker.get_by_text("BANK ACCOUNT CHANGED")).to_be_visible()
        expect(maker.get_by_text("14 paid records")).to_be_visible()
        expect(maker.get_by_text("75/100 review priority", exact=False)).to_be_visible()
        expect(maker.get_by_text("Policy explanation")).to_be_visible()
        expect(maker.get_by_role("button", name="Approve internally")).to_be_disabled()

        maker_token = token(client, "MAKER")
        outsider_token = token(client, "OUTSIDER")
        approver_token = token(client, "APPROVER")
        assert client.get(f"{api}/invoice-intakes/{intake_id}", headers=headers(maker_token)).status_code == 200
        document = client.get(f"{api}/invoice-intakes/{intake_id}/document", headers=headers(maker_token))
        assert document.status_code == 200 and document.content == pdf
        assert client.get(f"{api}/invoice-intakes/{intake_id}", headers=headers(outsider_token, ORG_B)).status_code == 404
        assert client.get(f"{api}/invoices/{invoice_id}", headers=headers(outsider_token, ORG_B)).status_code == 404
        assert client.get(f"{api}/invoice-intakes/{intake_id}/document", headers=headers(outsider_token, ORG_B)).status_code == 404
        assert client.post(f"{api}/invoices/{invoice_id}/approve", headers=headers(approver_token)).status_code == 403
        assert client.post(f"{api}/invoices/{invoice_id}/verify", headers=headers(maker_token),
                           json={"evidence_note": "Synthetic callback evidence"}).status_code == 403

        with psycopg.connect(os.environ["TRUSTPAY_DATABASE_URL"], connect_timeout=8) as con:
            con.execute("set transaction read only")
            row = con.execute("""select i.status,a.score,a.evidence,t.storage_path
                from public.invoices i join public.risk_assessments a on a.invoice_id=i.id
                join public.invoice_intakes t on t.invoice_id=i.id
                where i.organization_id=%s and i.public_id=%s""", (ORG_A, invoice_id)).fetchone()
            assert row and row[0] == "needs_review" and row[1] == 75
            assert row[2]["historical_payment_count"] == 14
            storage_path = row[3]
        direct = client.get(os.environ["SUPABASE_URL"].rstrip("/") +
                            "/storage/v1/object/authenticated/invoice-documents/" + storage_path,
                            headers={"apikey": os.environ["SUPABASE_PUBLISHABLE_KEY"],
                                     "Authorization": "Bearer " + outsider_token})
        assert direct.status_code in (400, 401, 403, 404), direct.status_code
        owner_document = client.get(os.environ["SUPABASE_URL"].rstrip("/") +
                                    "/storage/v1/object/authenticated/invoice-documents/" + storage_path,
                                    headers={"apikey": os.environ["SUPABASE_PUBLISHABLE_KEY"],
                                             "Authorization": "Bearer " + maker_token})
        assert owner_document.status_code == 200 and owner_document.content == pdf
        for access_token, expected_rows in ((maker_token, 1), (outsider_token, 0)):
            response = client.get(os.environ["SUPABASE_URL"].rstrip("/") + "/rest/v1/invoice_intakes",
                                  params={"select": "id,status", "id": "eq." + intake_id},
                                  headers={"apikey": os.environ["SUPABASE_PUBLISHABLE_KEY"],
                                           "Authorization": "Bearer " + access_token})
            assert response.status_code == 200 and len(response.json()) == expected_rows

        verifier_context, verifier = sign_in("VERIFIER")
        verifier.goto(base + "/app/payments/" + invoice_id)
        verifier.get_by_label("Independent verification evidence").fill("Synthetic independent callback to known supplier contact")
        verifier.get_by_role("button", name="Record verification").click()
        expect(verifier.get_by_text("Independent verification recorded.")).to_be_visible(timeout=20000)
        approver_context, approver = sign_in("APPROVER")
        approver.goto(base + "/app/payments/" + invoice_id)
        approver.get_by_role("button", name="Approve internally").click()
        expect(approver.get_by_text("Internal approval recorded", exact=False).first).to_be_visible(timeout=20000)
        audit = client.get(f"{api}/audit", headers=headers(maker_token))
        assert audit.status_code == 200
        actions = {event["action"] for event in audit.json() if event.get("invoice_id") in (invoice_id, intake_id)}
        assert {"INTAKE_UPLOADED", "INTAKE_REVIEWED", "INTAKE_ANALYZED", "ASSESSED", "VERIFY", "APPROVE"}.issubset(actions)
        final = client.get(f"{api}/invoices/{invoice_id}", headers=headers(maker_token)).json()
        assert final["status"] == "approved" and final["source"] == "uploaded"
        print(f"verified synthetic invoice {invoice_id}: score 75, 14 historical payments, approval and audit persisted")
        maker_context.close(); verifier_context.close(); approver_context.close(); browser.close()
