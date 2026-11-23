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
