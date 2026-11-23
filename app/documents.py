"""Private invoice-document validation and Supabase Storage transport."""

import os

import httpx
from fastapi import HTTPException

MAX_DOCUMENT_BYTES = 10 * 1024 * 1024
_TYPES = {
    "application/pdf": (b"%PDF-", ".pdf"),
    "image/png": (b"\x89PNG\r\n\x1a\n", ".png"),
    "image/jpeg": (b"\xff\xd8\xff", ".jpg"),
}


def validate_invoice_document(content_type: str, data: bytes) -> str:
    expected = _TYPES.get(content_type)
    if not expected or not data.startswith(expected[0]):
        raise ValueError("Only PDF, PNG, or JPEG invoices with matching file content are accepted")
    if len(data) > MAX_DOCUMENT_BYTES:
        raise ValueError("Invoice document exceeds the 10 MB limit")
    return expected[1]


class PrivateInvoiceStorage:
    def __init__(self, url: str, service_key: str | None = None, client: httpx.Client | None = None):
        self.url = url.rstrip("/")
        self.key = service_key or os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
        self.client = client or httpx.Client(timeout=20)

    def _headers(self):
        if not self.key:
            raise HTTPException(503, "Private invoice storage is not configured")
        if self.key.startswith("sb_secret_"):
            return {"apikey": self.key}
        return {"apikey": self.key, "Authorization": f"Bearer {self.key}"}

    def upload(self, path: str, content_type: str, data: bytes) -> None:
        try:
            response = self.client.post(
                f"{self.url}/storage/v1/object/invoice-documents/{path}",
                content=data, headers={**self._headers(), "Content-Type": content_type, "x-upsert": "false"},
            )
        except httpx.HTTPError as exc:
            raise HTTPException(503, "Private storage unavailable") from exc
        if response.status_code not in (200, 201):
            raise HTTPException(503, "Private storage rejected the upload")

    def download(self, path: str) -> bytes:
        try:
            response = self.client.get(
                f"{self.url}/storage/v1/object/authenticated/invoice-documents/{path}",
                headers=self._headers(),
            )
        except httpx.HTTPError as exc:
            raise HTTPException(503, "Private storage unavailable") from exc
        if response.status_code != 200:
            raise HTTPException(503, "Private document unavailable")
        if len(response.content) > MAX_DOCUMENT_BYTES:
            raise HTTPException(503, "Private document exceeds configured limit")
        return response.content
