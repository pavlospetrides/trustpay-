"""Opt-in live provider smoke test using only a synthetic PDF and masked evidence."""

import os
from pathlib import Path

import pytest
from dotenv import load_dotenv

from app.invoice_ai import OpenAIInvoiceProvider
from tests.test_invoice_ai import SYNTHETIC_TEXT, synthetic_pdf


@pytest.mark.skipif(os.getenv("TRUSTPAY_OPENAI_LIVE_CONFIRM") != "synthetic",
                    reason="Live billed provider call requires explicit synthetic-only opt-in")
def test_live_structured_extraction_and_masked_explanation():
    load_dotenv(Path(__file__).resolve().parents[2] / ".env", override=False)
    assert os.getenv("TRUSTPAY_ENVIRONMENT") == "development"
    assert os.getenv("TRUSTPAY_AI_EXTERNAL_DOCUMENTS") == "development"
    assert os.getenv("OPENAI_API_KEY"), "Set OPENAI_API_KEY only in the ignored backend .env"
    model = os.getenv("TRUSTPAY_AI_MODEL", "gpt-5.4-mini")
    provider = OpenAIInvoiceProvider(model=model)
    fields = provider.extract(synthetic_pdf(SYNTHETIC_TEXT), "application/pdf", "")
    assert fields.invoice_number == "AS-2026-114"
    assert fields.total_amount == "8420.00"
    assert fields.iban == "GB43TRST00000000000099"
    evidence = {"risk_score": 75, "risk_level": "critical", "historical_payment_count": 14,
                "current_account": "**** 0099", "previous_account": "**** 0001",
                "signals": ["BANK_ACCOUNT_CHANGED"]}
    summary = provider.explain(evidence)
    assert len(summary) >= 20
    assert "GB43TRST00000000000099" not in summary
