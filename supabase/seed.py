"""Explicit, nonautomatic synthetic seed for a designated development project."""

import os
from pathlib import Path
from decimal import Decimal
from uuid import UUID

import psycopg
from dotenv import load_dotenv

from app.fixtures import synthetic_iban  # noqa: F401  (re-exported for tests)
from app.postgres_store import PostgresStore, Principal
from app.security import AccountProtector

ORG = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
SUPPLIERS = [
    ("SUP-001", 14, 842000, "AS-HIST", 1),
    ("SUP-002", 11, 375000, "MO-HIST", 2),
    ("SUP-003", 12, 496000, "KM-HIST", 3),
    ("SUP-004", 8, 120000, "PT-HIST", 4),
    ("SUP-005", 0, 0, "NEW", 5),
]


def main() -> None:
    load_dotenv(Path(__file__).resolve().parent.parent / ".env", override=False)
    if os.environ.get("TRUSTPAY_ENVIRONMENT") != "development" or os.environ.get("TRUSTPAY_SEED_CONFIRM") != "development":
        raise RuntimeError("Synthetic seed requires TRUSTPAY_ENVIRONMENT=development and TRUSTPAY_SEED_CONFIRM=development")
    owner = UUID(os.environ["TRUSTPAY_DEMO_OWNER_ID"])
    extra_users = [
        (UUID(value), role) for name, role in
        (("TRUSTPAY_DEMO_ANALYST_ID", "analyst"), ("TRUSTPAY_DEMO_APPROVER_ID", "approver"))
        if (value := os.environ.get(name))
    ]
    if len({owner, *(user for user, _ in extra_users)}) != 1 + len(extra_users):
        raise RuntimeError("Synthetic owner, analyst, and approver must be distinct Auth users")
    dsn = os.environ["TRUSTPAY_DATABASE_URL"]
    store = PostgresStore(dsn, AccountProtector.from_environment())
    with store.connect() as con:
        if not con.execute("select 1 from auth.users where id=%s", (owner,)).fetchone():
            raise RuntimeError("Create the development owner in Supabase Auth first")
        existing = con.execute("""select count(*) as total,
            count(*) filter (where source='synthetic_seed') as synthetic
            from public.payment_records where organization_id=%s""", (ORG,)).fetchone()
        if existing["total"] not in (0, 45) or existing["total"] != existing["synthetic"]:
            raise RuntimeError("Unexpected payment history in demo organization; refusing to seed")
        current_org = con.execute("select name from public.organizations where id=%s", (ORG,)).fetchone()
        if current_org and current_org["name"] != "Asteria Synthetic Ltd":
            raise RuntimeError("Demo organization ID already belongs to different data")
        con.execute("set local trustpay.allow_synthetic_seed = 'development'")
        con.execute(Path(__file__).with_name("seed.sql").read_text(encoding="utf-8"))
        con.execute("""insert into public.organization_memberships(organization_id,user_id,role)
            values (%s,%s,'owner') on conflict (organization_id,user_id) do nothing""", (ORG, owner))
        for user, role in extra_users:
            if not con.execute("select 1 from auth.users where id=%s", (user,)).fetchone():
                raise RuntimeError(f"Create development {role} user in Supabase Auth first")
            con.execute("""insert into public.organization_memberships(organization_id,user_id,role)
                values (%s,%s,%s) on conflict (organization_id,user_id) do nothing""", (ORG, user, role))
        if existing["total"] == 0:
          for public_id, count, typical, prefix, account_number in SUPPLIERS:
              supplier = con.execute("select id from public.suppliers where organization_id=%s and public_id=%s",
                                     (ORG, public_id)).fetchone()
              if not count:
                  continue
              ciphertext, fingerprint, last4 = store.protector.protect(synthetic_iban(account_number))
              account = con.execute("""insert into public.supplier_bank_accounts
                (organization_id,supplier_id,encrypted_iban,iban_fingerprint,iban_last4,verification_status,last_verified_at)
                values (%s,%s,%s,%s,%s,'verified',now()) returning id""",
                  (ORG, supplier["id"], ciphertext, fingerprint, last4)).fetchone()
              for i in range(count):
                  number = "MO-2128" if public_id == "SUP-002" and i == 2 else f"{prefix}-{i+1:03d}"
                  con.execute("""insert into public.payment_records
                    (organization_id,supplier_id,bank_account_id,historical_invoice_number,
                     amount,currency,status,paid_at,source,external_reference)
                    values (%s,%s,%s,%s,%s,'EUR','paid',now() - (%s * interval '1 day'),'synthetic_seed',%s)""",
                      (ORG, supplier["id"], account["id"], number,
                       Decimal(typical + (i % 3 - 1) * 12000) / Decimal(100),
                       count - i, f"DEMO-{public_id}-{i+1}"))
    user = Principal(owner, ORG, "owner")
    scenarios = [
        ("INV-2409", "SUP-001", "AS-2026-114", 842000, 99),
        ("INV-2410", "SUP-002", "MO-2128", 375000, 2),
        ("INV-2411", "SUP-003", "KM-0921", 1490000, 3),
        ("INV-2412", "SUP-004", "PT-00891", 124000, 4),
        ("INV-2413", "SUP-005", "NEW-0001", 350000, 5),
    ]
    for public_id, supplier_id, invoice_number, amount_cents, account_number in scenarios:
        with store.connect() as con:
            existing_invoice = con.execute("""select external_source from public.invoices
                where organization_id=%s and public_id=%s""", (ORG, public_id)).fetchone()
        if existing_invoice:
            if existing_invoice["external_source"] != "synthetic_seed":
                raise RuntimeError(f"Existing invoice {public_id} is not synthetic seed data")
            continue
        store.create_assessment({"id": public_id, "supplier_id": supplier_id,
                                 "invoice_number": invoice_number, "amount_cents": amount_cents,
                                 "creditor_account": synthetic_iban(account_number),
                                 "invoice_date": "2026-11-23", "source": "synthetic_seed"}, user)
    print("Seeded 2 synthetic organizations, 5 demo invoices, and 45 historical payments")


if __name__ == "__main__":
    main()
