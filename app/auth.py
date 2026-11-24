"""Validate Supabase access tokens with GoTrue before resolving tenant membership."""

import base64
import hashlib
import json
import threading
import time
from urllib.parse import urlparse
from uuid import UUID

import httpx
from fastapi import HTTPException

# A token Supabase already accepted is trusted again for at most this long, and never past its
# own expiry. A token revoked by sign-out stays usable here for up to this window; organization
# membership and role are still read from the database on every request, so access changes
# apply immediately.
VERIFIED_TOKEN_TTL_SECONDS = 60
_MAX_CACHED_TOKENS = 1000


def _token_expiry(token: str) -> float | None:
    """The JWT `exp` claim, read only to cap the cache. The signature is checked by Supabase."""
    try:
        payload = token.split(".")[1]
        claims = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
        return float(claims["exp"])
    except (IndexError, KeyError, TypeError, ValueError):
        return None


class SupabaseAuth:
    def __init__(self, url: str, publishable_key: str, client: httpx.Client | None = None,
                 clock=time.time):
        parsed = urlparse(url)
        if parsed.scheme != "https" and not (parsed.scheme == "http" and parsed.hostname in {"localhost", "127.0.0.1"}):
            raise RuntimeError("SUPABASE_URL must use HTTPS (except local development)")
        if not publishable_key:
            raise RuntimeError("SUPABASE_PUBLISHABLE_KEY is required")
        self.url = url.rstrip("/")
        self.publishable_key = publishable_key
        self.client = client or httpx.Client(timeout=5)
        self.clock = clock
        self._verified: dict[str, tuple[UUID, float]] = {}
        self._lock = threading.Lock()

    def _ask_supabase(self, token: str) -> httpx.Response:
        # One retry: a single slow or dropped call to Supabase should not fail the request.
        for attempt in (1, 2):
            try:
                response = self.client.get(
                    f"{self.url}/auth/v1/user",
                    headers={"apikey": self.publishable_key, "Authorization": f"Bearer {token}"},
                    timeout=5,
                )
            except httpx.HTTPError as exc:
                if attempt == 2:
                    raise HTTPException(503, "Authentication service unavailable") from exc
                continue
            if response.status_code < 500 or attempt == 2:
                return response
        raise AssertionError("unreachable")

    def user_id(self, token: str) -> UUID:
        if not token:
            raise HTTPException(401, "Authentication required")
        key = hashlib.sha256(token.encode()).hexdigest()
        now = self.clock()
        with self._lock:
            cached = self._verified.get(key)
        if cached and cached[1] > now:
            return cached[0]

        response = self._ask_supabase(token)
        if response.status_code in (401, 403):
            raise HTTPException(401, "Invalid or expired access token")
        if response.status_code != 200:
            raise HTTPException(503, "Authentication service unavailable")
        try:
            user = UUID(response.json()["id"])
        except (ValueError, KeyError, TypeError) as exc:
            raise HTTPException(503, "Authentication service returned an invalid identity") from exc

        expiry = _token_expiry(token)
        if expiry is not None:
            with self._lock:
                if len(self._verified) >= _MAX_CACHED_TOKENS:
                    self._verified = {k: v for k, v in self._verified.items() if v[1] > now}
                    if len(self._verified) >= _MAX_CACHED_TOKENS:
                        self._verified.clear()
                self._verified[key] = (user, min(now + VERIFIED_TOKEN_TTL_SECONDS, expiry))
        return user
