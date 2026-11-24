from uuid import UUID

import pytest

from app.postgres_store import Principal, authorize_transition


ORG = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
ANALYST = UUID("11111111-1111-4111-8111-111111111111")
APPROVER = UUID("22222222-2222-4222-8222-222222222222")


def principal(user, role):
    return Principal(user, ORG, role)


def test_approval_requires_distinct_authorized_actor():
    row = {"status": "ready", "score": 75, "verified_by": ANALYST, "created_by": None}
    authorize_transition(principal(APPROVER, "approver"), "approve", row)
    with pytest.raises(PermissionError):
        authorize_transition(principal(ANALYST, "approver"), "approve", row)
    with pytest.raises(PermissionError):
        authorize_transition(principal(APPROVER, "viewer"), "approve", row)


def test_approval_rejects_unverified_risk_and_maker():
    row = {"status": "ready", "score": 75, "verified_by": None, "created_by": ANALYST}
    with pytest.raises(PermissionError):
        authorize_transition(principal(APPROVER, "approver"), "approve", row)
    row["score"] = 0
    with pytest.raises(PermissionError):
        authorize_transition(principal(ANALYST, "approver"), "approve", row)


def test_sync_records_needing_human_review():
    from dataclasses import replace
    from app.jinius import DemoJiniusAdapter
    from app.postgres_store import PostgresStore

    base = DemoJiniusAdapter().list_invoices()[0]
    assert PostgresStore._import_problem(base) is None
    cases = [
        ("Invoice has no payment account", replace(base, creditor_account=" ")),
        ("Payment account is not a valid IBAN", replace(base, creditor_account="SYNTHETIC-CY-9077")),
        ("Provider invoice reference is missing or malformed", replace(base, id="INV 2409; drop")),
        # (INV-2409, "b-rc") would share JIN-INV-2409-rb-rc with (INV-2409-rb, "c"), so revisions cannot hold "-".
        ("Provider invoice reference is missing or malformed", replace(base, revision="b-rc")),
        ("Invoice date is missing or invalid", replace(base, date="19/11/2026")),
        ("Invoice number or amount is missing", replace(base, amount_cents=0)),
    ]
    for reason, record in cases:
        assert PostgresStore._import_problem(record) == reason
