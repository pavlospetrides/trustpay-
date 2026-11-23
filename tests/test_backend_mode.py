import pytest

from app.main import create_app


def test_postgres_mode_never_falls_back_to_sqlite(monkeypatch):
    monkeypatch.setenv("TRUSTPAY_BACKEND", "postgres")
    monkeypatch.delenv("TRUSTPAY_DATABASE_URL", raising=False)
    with pytest.raises(RuntimeError, match="TRUSTPAY_DATABASE_URL"):
        create_app()
