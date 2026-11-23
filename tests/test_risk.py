from app.risk import assess_payment


def base(**overrides):
    params=dict(invoice_number='ABC-003',current_account='SYNTHETIC-1842',amount_cents=700000,
                previous_accounts=['SYNTHETIC-1842']*14,
                previous_paid_amounts_cents=[700000]*14,
                previously_paid_invoices=['ABC-001','ABC-002'])
    params.update(overrides)
    return assess_payment(**params)


def test_normal():
    a=base()
    assert a.score==0 and a.recommended_status=='ready' and not a.signals


def test_changed_account():
    a=base(current_account='SYNTHETIC-9077')
    assert a.score==75 and a.recommended_status=='needs_review'
    assert a.signals[0].code=='BANK_ACCOUNT_CHANGED'


def test_duplicate_always_blocks():
    a=base(invoice_number='aBc-001')
    assert a.score==100 and a.recommended_status=='blocked'
    assert a.kind=='duplicate'


def test_big_amount():
    a=base(amount_cents=1900000)
    assert a.score==65 and a.recommended_status=='needs_review'
    assert any(s.code=='LARGE_AMOUNT_DEVIATION' for s in a.signals)


def test_combined_signals_and_score_clamp():
    a=base(amount_cents=1900000,current_account='DIFFERENT')
    assert a.score==100 and len(a.signals)==2


def test_no_history_is_review():
    a=base(previous_accounts=[],previous_paid_amounts_cents=[],previously_paid_invoices=[])
    assert a.score==45 and a.kind=='new'


def test_account_comparison_canonicalizes_whitespace():
    a=base(current_account='syn thetic-1842')
    assert a.score==0


def test_positive_amount_required():
    import pytest
    with pytest.raises(ValueError): base(amount_cents=0)
