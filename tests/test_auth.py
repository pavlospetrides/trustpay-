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
