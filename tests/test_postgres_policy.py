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


def test_pool_pings_only_connections_idle_past_the_threshold(monkeypatch):
    from app import postgres_store as ps
    pings = []
    monkeypatch.setattr(ps.ConnectionPool, "check_connection", staticmethod(lambda conn: pings.append(conn)))
    now = [1000.0]
    monkeypatch.setattr(ps.time, "monotonic", lambda: now[0])

    class Conn: pass
    fresh, recent, idle = Conn(), Conn(), Conn()
    ps._check_if_idle(fresh)                      # never returned yet: just opened
    ps._mark_returned(recent); now[0] += 5; ps._check_if_idle(recent)
    ps._mark_returned(idle); now[0] += ps.IDLE_CHECK_SECONDS + 1; ps._check_if_idle(idle)
    assert pings == [idle]
