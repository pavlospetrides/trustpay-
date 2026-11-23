"""Manual hosted API check for hackathon policy cases using synthetic records only."""

import os
from datetime import date
from pathlib import Path
from uuid import uuid4

import httpx
import pytest
from dotenv import load_dotenv

from supabase.seed import synthetic_iban


@pytest.mark.skipif(os.getenv("TRUSTPAY_HOSTED_E2E_CONFIRM") != "development",
                    reason="Explicitly opt in to the named synthetic hosted development project")
def test_hosted_duplicate_clean_large_and_unknown_cases():
    root = Path(__file__).resolve().parents[2]
    load_dotenv(root / ".env", override=False)
    load_dotenv(root / ".env.e2e", override=False)
    assert os.environ["TRUSTPAY_ENVIRONMENT"] == "development"
    assert os.environ["TRUSTPAY_E2E_PROJECT_REF"] == "dtoqrscbbdacqpaqxgpr"
    assert "dtoqrscbbdacqpaqxgpr" in os.environ["TRUSTPAY_DATABASE_URL"]
    api = "http://127.0.0.1:8000/api/v1"

    with httpx.Client(timeout=15) as client:
        def headers(role: str) -> dict:
            login = client.post(os.environ["SUPABASE_URL"].rstrip("/") + "/auth/v1/token",
                params={"grant_type": "password"},
                headers={"apikey": os.environ["SUPABASE_PUBLISHABLE_KEY"]},
                json={"email": os.environ[f"TRUSTPAY_E2E_{role}_EMAIL"],
                      "password": os.environ[f"TRUSTPAY_E2E_{role}_PASSWORD"]})
            assert login.status_code == 200
            return {"Authorization": "Bearer " + login.json()["access_token"],
                    "X-Organization-Id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}

        maker, approver = headers("MAKER"), headers("APPROVER")

        def assess(label: str, supplier: str, invoice_number: str, amount: int, account: str) -> dict:
            response = client.post(api + "/invoices/assess", headers=maker,
                json={"id": "E2E-" + label + "-" + uuid4().hex[:10].upper(),
                      "supplier_id": supplier, "invoice_number": invoice_number,
                      "amount_cents": amount, "creditor_account": account,
                      "invoice_date": date.today().isoformat()})
            assert response.status_code == 201, (label, response.status_code)
            return response.json()

        duplicate = assess("DUP", "SUP-001", "AS-HIST-001", 842000, synthetic_iban(1))
        assert duplicate["risk"] == 100 and duplicate["status"] == "blocked"
        assert any(signal["code"] == "DUPLICATE_PAID_INVOICE" for signal in duplicate["signals"])
        assert client.post(api + "/invoices/" + duplicate["id"] + "/approve", headers=approver).status_code == 403

        clean = assess("CLEAN", "SUP-001", "CLEAN-" + uuid4().hex[:8], 842000, synthetic_iban(1))
        assert clean["risk"] == 0 and clean["status"] == "ready"
        assert client.post(api + "/invoices/" + clean["id"] + "/approve", headers=approver).json()["status"] == "approved"

        large = assess("LARGE", "SUP-003", "LARGE-" + uuid4().hex[:8], 1490000, synthetic_iban(3))
        assert large["risk"] >= 40 and any(signal["code"] == "LARGE_AMOUNT_DEVIATION" for signal in large["signals"])
        held = client.post(api + "/invoices/" + large["id"] + "/hold", headers=maker)
        assert held.status_code == 200 and held.json()["status"] == "hold"

        unknown = assess("UNKNOWN", "SUP-005", "UNKNOWN-" + uuid4().hex[:8], 200000, synthetic_iban(5))
        assert unknown["risk"] == 45 and unknown["history"] == 0
        print("hosted synthetic policy scenarios: duplicate blocked, clean approved, large case held, no-history flagged")
