"""Validate Supabase access tokens with GoTrue before resolving tenant membership."""

from urllib.parse import urlparse
from uuid import UUID

import httpx
from fastapi import HTTPException


class SupabaseAuth:
    def __init__(self, url: str, publishable_key: str, client: httpx.Client | None = None):
        parsed = urlparse(url)
        if parsed.scheme != "https" and not (parsed.scheme == "http" and parsed.hostname in {"localhost", "127.0.0.1"}):
            raise RuntimeError("SUPABASE_URL must use HTTPS (except local development)")
        if not publishable_key:
            raise RuntimeError("SUPABASE_PUBLISHABLE_KEY is required")
        self.url = url.rstrip("/")
        self.publishable_key = publishable_key
        self.client = client or httpx.Client(timeout=5)

    def user_id(self, token: str) -> UUID:
        if not token:
            raise HTTPException(401, "Authentication required")
        try:
            response = self.client.get(
                f"{self.url}/auth/v1/user",
                headers={"apikey": self.publishable_key, "Authorization": f"Bearer {token}"},
                timeout=5,
            )
        except httpx.HTTPError as exc:
            raise HTTPException(503, "Authentication service unavailable") from exc
        if response.status_code in (401, 403):
            raise HTTPException(401, "Invalid or expired access token")
        if response.status_code != 200:
            raise HTTPException(503, "Authentication service unavailable")
        try:
            return UUID(response.json()["id"])
        except (ValueError, KeyError, TypeError) as exc:
            raise HTTPException(503, "Authentication service returned an invalid identity") from exc
