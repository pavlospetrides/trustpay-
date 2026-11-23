from fastapi.testclient import TestClient

from app.main import create_app


def test_invoice_intake_rejects_sqlite_mode(tmp_path):
    client = TestClient(create_app(str(tmp_path / "demo.sqlite3")))
    response = client.post("/api/v1/invoice-intakes", files={"file": ("invoice.pdf", b"%PDF-1.3", "application/pdf")})
    assert response.status_code == 403
