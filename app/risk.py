"""Deterministic, auditable payment anomaly checks.

Scores are relative review PRIORITIES (0..100), not fraud probabilities.
No payment initiation occurs anywhere in this project.
"""
from dataclasses import dataclass, asdict
from decimal import Decimal, InvalidOperation
from statistics import median
from typing import Iterable


@dataclass(frozen=True)
class RiskSignal:
    code: str
    weight: int
    explanation: str
    severity: str


@dataclass(frozen=True)
class Assessment:
    score: int
    level: str
    recommended_status: str
    signals: list[RiskSignal]
    reason: str
    kind: str

    def as_dict(self) -> dict:
        return {
            **{k: v for k, v in asdict(self).items() if k != "signals"},
            "signals": [asdict(s) for s in self.signals],
        }


def _normalized_account(value: str) -> str:
    return "".join(value.upper().split())


def assess_payment(
    *,
    invoice_number: str,
    current_account: str,
    amount_cents: int,
    previous_accounts: Iterable[str],
    previous_paid_amounts_cents: Iterable[int],
    previously_paid_invoices: Iterable[str],
) -> Assessment:
    """Assess an invoice against SAME SUPPLIER history only.

    Historical account IDs are synthetic demo tokens, not bank-verified IBANs.
    Duplicate invoice numbers are supplier-scoped and compared case-insensitively.
    """
    if amount_cents <= 0:
        raise ValueError("amount_cents must be positive")
    if not invoice_number.strip() or not current_account.strip():
        raise ValueError("invoice_number and current_account are required")

    accounts = [_normalized_account(a) for a in previous_accounts if a.strip()]
    amounts = [a for a in previous_paid_amounts_cents if a > 0]
    paid_invoices = {v.strip().casefold() for v in previously_paid_invoices}
    signals: list[RiskSignal] = []

    if invoice_number.strip().casefold() in paid_invoices:
        signals.append(RiskSignal("DUPLICATE_PAID_INVOICE", 100,
            "This supplier's invoice number matches a previously paid invoice. A second payment must be blocked.", "critical"))

    if accounts:
        # The most common historical account, rather than simply the last row.
        counts = {a: accounts.count(a) for a in set(accounts)}
        canonical = max(sorted(counts), key=lambda a: counts[a])
        if _normalized_account(current_account) != canonical:
            signals.append(RiskSignal("BANK_ACCOUNT_CHANGED", 75,
                f"The payment destination differs from the account used in {counts[canonical]} of {len(accounts)} prior supplier payments. Independently verify the new account.", "critical"))
    else:
        signals.append(RiskSignal("NEW_SUPPLIER_OR_NO_HISTORY", 45,
            "No historical payments were found for this supplier. Confirm identity and payment instructions before approval.", "review"))

    if len(amounts) >= 3:
        typical = median(amounts)
        ratio = Decimal(amount_cents) / Decimal(typical)
        if ratio >= Decimal('2.5'):
            signals.append(RiskSignal("LARGE_AMOUNT_DEVIATION", 65,
                f"Amount is {ratio:.1f}× the median of {len(amounts)} historical payments (€{typical / 100:,.2f}).", "review"))
        elif ratio >= Decimal('1.75'):
            signals.append(RiskSignal("ELEVATED_AMOUNT", 40,
                f"Amount is {ratio:.1f}× the historical median (€{typical / 100:,.2f}).", "review"))

    score = min(100, sum(s.weight for s in signals))
    level = "critical" if score >= 75 else "review" if score >= 40 else "low"
    # Duplicate is an absolute hard stop. IBAN change is on hold until verified.
    duplicate = any(s.code == "DUPLICATE_PAID_INVOICE" for s in signals)
    status = "blocked" if duplicate else "needs_review" if score >= 40 else "ready"
    reason = signals[0].explanation if signals else "Account, invoice reference and amount are consistent with the available historical data."
    kind = "duplicate" if duplicate else (
        "iban" if any(s.code == "BANK_ACCOUNT_CHANGED" for s in signals) else
        "amount" if any(s.code in {"LARGE_AMOUNT_DEVIATION", "ELEVATED_AMOUNT"} for s in signals) else
        "new" if signals else "normal")
    return Assessment(score, level, status, signals, reason, kind)
