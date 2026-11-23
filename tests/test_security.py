import pytest

from app.security import AccountProtector, normalize_iban


def test_iban_normalization_and_check_digits():
    assert normalize_iban("GB82 WEST 1234 5698 7654 32") == "GB82WEST12345698765432"
    with pytest.raises(ValueError):
        normalize_iban("GB82 WEST 1234 5698 7654 33")


def test_account_encryption_and_keyed_fingerprint():
    first = AccountProtector(b"a" * 32, b"b" * 32)
    other = AccountProtector(b"a" * 32, b"c" * 32)
    account = "GB82WEST12345698765432"
    ciphertext, fingerprint, last4 = first.protect(account)
    assert account.encode() not in ciphertext
    assert first.reveal(ciphertext) == account
    assert fingerprint == first.protect("GB82 WEST 1234 5698 7654 32")[1]
    assert fingerprint != other.protect(account)[1]
    assert last4 == "5432"
