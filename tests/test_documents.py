import pytest

from app.documents import validate_invoice_document


def test_only_expected_invoice_file_types_are_accepted():
    assert validate_invoice_document("application/pdf", b"%PDF-1.7\n" + b"x" * 50) == ".pdf"
    assert validate_invoice_document("image/png", b"\x89PNG\r\n\x1a\n" + b"x" * 50) == ".png"
    with pytest.raises(ValueError):
        validate_invoice_document("application/pdf", b"<script>alert(1)</script>")
    with pytest.raises(ValueError):
        validate_invoice_document("text/html", b"<script>alert(1)</script>")


def test_oversized_invoice_is_rejected():
    with pytest.raises(ValueError):
        validate_invoice_document("application/pdf", b"%PDF" + b"x" * (10 * 1024 * 1024))
