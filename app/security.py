"""Server-only protection for supplier bank account identifiers."""

import hashlib
import hmac
import os
import re
from base64 import b64decode

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def normalize_iban(value: str) -> str:
    iban = re.sub(r"\s+", "", value).upper()
    if not re.fullmatch(r"[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}", iban):
        raise ValueError("A valid IBAN is required")
    rearranged = iban[4:] + iban[:4]
    digits = "".join(str(ord(char) - 55) if char.isalpha() else char for char in rearranged)
    if int(digits) % 97 != 1:
        raise ValueError("Invalid IBAN check digits")
    return iban


class AccountProtector:
    def __init__(self, encryption_key: bytes, fingerprint_key: bytes):
        if len(encryption_key) != 32 or len(fingerprint_key) < 32:
            raise ValueError("Account encryption and fingerprint keys must be at least 32 bytes")
        self.cipher = AESGCM(encryption_key)
        self.fingerprint_key = fingerprint_key

    @classmethod
    def from_environment(cls) -> "AccountProtector":
        names = ("TRUSTPAY_IBAN_ENCRYPTION_KEY", "TRUSTPAY_IBAN_FINGERPRINT_KEY")
        if any(not os.environ.get(name) for name in names):
            raise RuntimeError("PostgreSQL mode requires both server-only IBAN keys")
        try:
            return cls(*(b64decode(os.environ[name], validate=True) for name in names))
        except (ValueError, KeyError) as exc:
            raise RuntimeError("IBAN keys must be base64-encoded 32-byte values") from exc

    def protect(self, raw: str) -> tuple[bytes, str, str]:
        iban = normalize_iban(raw)
        nonce = os.urandom(12)
        ciphertext = nonce + self.cipher.encrypt(nonce, iban.encode(), None)
        fingerprint = hmac.new(self.fingerprint_key, iban.encode(), hashlib.sha256).hexdigest()
        return ciphertext, fingerprint, iban[-4:]

    def reveal(self, encrypted: bytes) -> str:
        return self.cipher.decrypt(encrypted[:12], encrypted[12:], None).decode()
