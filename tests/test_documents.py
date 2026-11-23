import pytest
from io import BytesIO
from PIL import Image

from app.documents import validate_invoice_document


def test_only_expected_invoice_file_types_are_accepted():
    assert validate_invoice_document("application/pdf", b"%PDF-1.7\n" + b"x" * 50) == ".pdf"
    output = BytesIO()
    Image.new("RGB", (2, 2), "white").save(output, format="PNG")
    assert validate_invoice_document("image/png", output.getvalue()) == ".png"
    jpeg = BytesIO()
    Image.new("RGB", (2, 2), "white").save(jpeg, format="JPEG")
    assert validate_invoice_document("image/jpeg", jpeg.getvalue()) == ".jpg"
    with pytest.raises(ValueError):
        validate_invoice_document("image/png", jpeg.getvalue())
    with pytest.raises(ValueError, match="image"):
        validate_invoice_document("image/jpeg", jpeg.getvalue()[:20])
    with pytest.raises(ValueError):
        validate_invoice_document("application/pdf", b"<script>alert(1)</script>")
    with pytest.raises(ValueError):
        validate_invoice_document("text/html", b"<script>alert(1)</script>")
    with pytest.raises(ValueError, match="image"):
        validate_invoice_document("image/png", b"\x89PNG\r\n\x1a\n" + b"x" * 50)


def test_oversized_invoice_is_rejected():
    with pytest.raises(ValueError):
        validate_invoice_document("application/pdf", b"%PDF" + b"x" * (10 * 1024 * 1024))
