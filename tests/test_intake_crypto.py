from uuid import uuid4

import pytest
from cryptography.exceptions import InvalidTag

from app.intake_store import DraftCipher
from app.security import AccountProtector


def test_draft_fields_are_encrypted_and_bound_to_tenant_and_intake():
    cipher = DraftCipher(AccountProtector(b"a" * 32, b"b" * 32))
    org, intake = uuid4(), uuid4()
    fields = {"supplier_name": "Synthetic Ltd", "iban": "GB43TRST00000000000099"}
    blob = cipher.seal(fields, org, intake)
    assert b"Synthetic Ltd" not in blob and b"GB43" not in blob
    assert cipher.open(blob, org, intake) == fields
    with pytest.raises(InvalidTag):
        cipher.open(blob, uuid4(), intake)
    with pytest.raises(InvalidTag):
        cipher.open(blob, org, uuid4())
