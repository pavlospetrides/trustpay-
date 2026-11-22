"""Synthetic and intentionally non-bank-valid historical records."""
SUPPLIERS = [
    {"id": "SUP-001", "name": "Aegean Supplies Ltd", "short": "Aegean Supplies", "account": "SYNTHETIC-CY-1842", "count": 14, "typical_cents": 760000, "prefix": "AS-HIST"},
    {"id": "SUP-002", "name": "Meridian Office Ltd", "short": "Meridian Office", "account": "SYNTHETIC-CY-4421", "count": 9, "typical_cents": 350000, "prefix": "MO-HIST"},
    {"id": "SUP-003", "name": "Kastro Maintenance Ltd", "short": "Kastro Maintenance", "account": "SYNTHETIC-CY-7355", "count": 12, "typical_cents": 496000, "prefix": "KM-HIST"},
    {"id": "SUP-004", "name": "Palm Tree Logistics Ltd", "short": "Palm Tree Logistics", "account": "SYNTHETIC-CY-3508", "count": 8, "typical_cents": 120000, "prefix": "PT-HIST"},
]
INVOICES = [
    {"id": "INV-2409", "supplier_id": "SUP-001", "number": "AS-2026-114", "amount_cents": 842000, "creditor_account": "SYNTHETIC-CY-9077", "date": "2026-11-19", "source": "jinius_demo_adapter"},
    {"id": "INV-2410", "supplier_id": "SUP-002", "number": "MO-2128", "amount_cents": 375000, "creditor_account": "SYNTHETIC-CY-4421", "date": "2026-11-18", "source": "jinius_demo_adapter"},
    {"id": "INV-2411", "supplier_id": "SUP-003", "number": "KM-0921", "amount_cents": 1490000, "creditor_account": "SYNTHETIC-CY-7355", "date": "2026-11-17", "source": "jinius_demo_adapter"},
    {"id": "INV-2412", "supplier_id": "SUP-004", "number": "PT-00891", "amount_cents": 124000, "creditor_account": "SYNTHETIC-CY-3508", "date": "2026-11-16", "source": "jinius_demo_adapter"},
]
