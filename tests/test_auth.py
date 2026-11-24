import httpx
import pytest
from fastapi import HTTPException

from app.auth import SupabaseAuth


USER = "11111111-1111-4111-8111-111111111111"


def auth_with_response(status, body):
    transport = httpx.MockTransport(lambda request: httpx.Response(status, json=body))
    return SupabaseAuth("https://example.supabase.co", "publishable", httpx.Client(transport=transport))


def test_verified_user_identity_comes_from_auth_server():
    assert str(auth_with_response(200, {"id": USER}).user_id("valid-token")) == USER


def test_invalid_token_cannot_be_used():
    with pytest.raises(HTTPException) as error:
        auth_with_response(401, {"message": "invalid"}).user_id("invalid-token")
    assert error.value.status_code == 401


def test_auth_outage_fails_closed():
    with pytest.raises(HTTPException) as error:
        auth_with_response(503, {}).user_id("valid-token")
    assert error.value.status_code == 503


def jwt(exp: float) -> str:
    import base64, json
    body = base64.urlsafe_b64encode(json.dumps({"exp": exp}).encode()).decode().rstrip("=")
    return f"header.{body}.signature"


class Counting:
    """Mock Supabase Auth that returns queued statuses and counts calls."""
    def __init__(self, *statuses):
        self.statuses, self.calls = list(statuses), 0

    def __call__(self, request):
        self.calls += 1
        status = self.statuses.pop(0) if len(self.statuses) > 1 else self.statuses[0]
        if status == "drop":
            raise httpx.ConnectError("dropped", request=request)
        return httpx.Response(status, json={"id": USER})


def make(handler, now):
    return SupabaseAuth("https://example.supabase.co", "publishable",
                        httpx.Client(transport=httpx.MockTransport(handler)), clock=lambda: now[0])


def test_verified_token_is_reused_briefly_then_checked_again():
    handler, now = Counting(200), [1000.0]
    auth, token = make(handler, now), jwt(exp=5000)
    assert str(auth.user_id(token)) == USER and str(auth.user_id(token)) == USER
    assert handler.calls == 1
    now[0] += 61
    auth.user_id(token)
    assert handler.calls == 2


def test_cache_never_outlives_the_token_expiry():
    handler, now = Counting(200), [1000.0]
    auth, token = make(handler, now), jwt(exp=1010)
    auth.user_id(token)
    now[0] = 1011
    auth.user_id(token)
    assert handler.calls == 2


def test_rejected_and_unparseable_tokens_are_never_cached():
    now = [1000.0]
    rejecting = Counting(401)
    auth = make(rejecting, now)
    for _ in range(2):
        with pytest.raises(HTTPException):
            auth.user_id(jwt(exp=5000))
    assert rejecting.calls == 2
    opaque = Counting(200)
    auth = make(opaque, now)
    auth.user_id("not-a-jwt"); auth.user_id("not-a-jwt")
    assert opaque.calls == 2


def test_one_retry_on_outage_or_dropped_connection():
    for first in (503, "drop"):
        handler = Counting(first, 200)
        assert str(make(handler, [1000.0]).user_id(jwt(exp=5000))) == USER
        assert handler.calls == 2


def test_persistent_outage_still_fails_closed_after_retry():
    handler = Counting("drop")
    with pytest.raises(HTTPException) as error:
        make(handler, [1000.0]).user_id(jwt(exp=5000))
    assert error.value.status_code == 503 and handler.calls == 2
