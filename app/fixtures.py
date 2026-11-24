"""Synthetic historical records. IBANs have valid checksums but a fictitious TRST bank code."""


def synthetic_iban(number: int) -> str:
    """Valid checksum, intentionally fictitious TRST bank code."""
    body = f"TRST000000{number:08d}"
    raw = body + "GB00"
    digits = "".join(str(ord(char) - 55) if char.isalpha() else char for char in raw)
    check = 98 - int(digits) % 97
    return f"GB{check:02d}{body}"


SUPPLIERS = [
    {"id": "SUP-001", "name": "Aegean Supplies Ltd", "short": "Aegean Supplies", "account": synthetic_iban(1), "count": 14, "typical_cents": 760000, "prefix": "AS-HIST"},
    {"id": "SUP-002", "name": "Meridian Office Ltd", "short": "Meridian Office", "account": synthetic_iban(2), "count": 9, "typical_cents": 350000, "prefix": "MO-HIST"},
    {"id": "SUP-003", "name": "Kastro Maintenance Ltd", "short": "Kastro Maintenance", "account": synthetic_iban(3), "count": 12, "typical_cents": 496000, "prefix": "KM-HIST"},
    {"id": "SUP-004", "name": "Palm Tree Logistics Ltd", "short": "Palm Tree Logistics", "account": synthetic_iban(4), "count": 8, "typical_cents": 120000, "prefix": "PT-HIST"},
]
INVOICES = [
    {"id": "INV-2409", "supplier_id": "SUP-001", "number": "AS-2026-114", "amount_cents": 842000, "creditor_account": synthetic_iban(99), "date": "2026-11-19", "source": "jinius_demo_adapter"},
    {"id": "INV-2410", "supplier_id": "SUP-002", "number": "MO-2128", "amount_cents": 375000, "creditor_account": synthetic_iban(2), "date": "2026-11-18", "source": "jinius_demo_adapter"},
    {"id": "INV-2411", "supplier_id": "SUP-003", "number": "KM-0921", "amount_cents": 1490000, "creditor_account": synthetic_iban(3), "date": "2026-11-17", "source": "jinius_demo_adapter"},
    {"id": "INV-2412", "supplier_id": "SUP-004", "number": "PT-00891", "amount_cents": 124000, "creditor_account": synthetic_iban(4), "date": "2026-11-16", "source": "jinius_demo_adapter"},
]
