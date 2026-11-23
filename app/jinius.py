"""Jinius integration seam.

No real Jinius API endpoint, payload schema, or scope is assumed here.
Implement a LIVE adapter only after receiving official hackathon specifications.
"""
from dataclasses import dataclass
from typing import Protocol
from .fixtures import INVOICES

@dataclass(frozen=True)
class NormalizedInvoice:
    id: str
    supplier_id: str
    number: str
    amount_cents: int
    creditor_account: str
    date: str
    source: str

class InvoiceSource(Protocol):
    def list_invoices(self) -> list[NormalizedInvoice]: ...

class DemoJiniusAdapter:
    """Deterministic synthetic data — NOT the Jinius API."""
    def list_invoices(self) -> list[NormalizedInvoice]:
        return [NormalizedInvoice(**item) for item in INVOICES]

class LiveJiniusAdapter:
    """Intentionally disabled until official endpoints and scopes are provided."""
    def list_invoices(self) -> list[NormalizedInvoice]:
        raise NotImplementedError("Official Jinius sandbox API contract has not been supplied")
