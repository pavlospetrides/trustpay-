from fastapi.testclient import TestClient
from app.main import create_app


def client(tmp_path):
    return TestClient(create_app(str(tmp_path / 'test.sqlite3')))


def test_seeded_invoice_scores_from_engine(tmp_path):
    c=client(tmp_path)
    data={r['id']:r for r in c.get('/api/v1/invoices').json()}
    assert data['INV-2409']['risk']==75
    assert data['INV-2410']['risk']==100
    assert data['INV-2411']['risk']==65
    assert data['INV-2412']['risk']==0
    assert data['INV-2410']['status']=='blocked'
    assert len(c.get('/api/v1/suppliers').json())==4


def test_verification_and_approval_server_guards(tmp_path):
    c=client(tmp_path)
    path='/api/v1/invoices/INV-2409'
    assert c.post(path+'/approve').status_code==409
    assert c.post(path+'/verify',json={'evidence_note':'weak'}).status_code==422
    assert c.post(path+'/verify',json={'evidence_note':'Simulated callback to already known contact'}).status_code==200
    assert c.get(path).json()['status']=='ready'
    assert c.post(path+'/approve').status_code==200
    assert c.get(path).json()['approved_by']=='finance.manager@demo.local'
    assert c.post(path+'/approve').status_code==409
    ev=c.get('/api/v1/audit').json()
    assert any(x['action']=='APPROVE' for x in ev)
    assert any(x['action']=='VERIFY' for x in ev)


def test_duplicate_is_hard_block(tmp_path):
    c=client(tmp_path)
    path='/api/v1/invoices/INV-2410'
    assert c.post(path+'/approve').status_code==409
    assert c.post(path+'/verify',json={'evidence_note':'Test verification with documents'}).status_code==409
    assert c.get(path).json()['status']=='blocked'


def test_low_risk_approval_without_verification(tmp_path):
    c=client(tmp_path)
    r=c.post('/api/v1/invoices/INV-2412/approve')
    assert r.status_code==200 and r.json()['status']=='approved'


def test_review_hold_and_verify(tmp_path):
    c=client(tmp_path)
    path='/api/v1/invoices/INV-2411'
    assert c.post(path+'/hold').status_code==200
    assert c.post(path+'/approve').status_code==409
    assert c.post(path+'/verify',json={'evidence_note':'Reviewed attached purchase order with buyer'}).status_code==200
    assert c.post(path+'/approve').status_code==200


def test_manual_assess_and_persistence(tmp_path):
    db=tmp_path / 'test.sqlite3'
    c=TestClient(create_app(str(db)))
    payload={'id':'USER-0001','supplier_id':'SUP-001','invoice_number':'AS-2026-NEW',
         'amount_cents':850000,'creditor_account':'SYNTHETIC-CY-9999','invoice_date':'2026-11-22'}
    r=c.post('/api/v1/invoices/assess',json=payload)
    assert r.status_code==201 and r.json()['risk']==75
    assert c.post('/api/v1/invoices/assess',json=payload).status_code==409
    c2=TestClient(create_app(str(db)))
    assert c2.get('/api/v1/invoices/USER-0001').status_code==200


def test_bad_invoice_validation_and_missing_resources(tmp_path):
    c=client(tmp_path)
    r=c.post('/api/v1/invoices/assess',json={'id':'X','supplier_id':'none','invoice_number':'a','amount_cents':-1,'creditor_account':'X','invoice_date':'BAD'})
    assert r.status_code==422
    assert c.get('/api/v1/invoices/nonexistent').status_code==404


def test_reset_and_no_live_payment_endpoint(tmp_path):
    c=client(tmp_path)
    c.post('/api/v1/invoices/INV-2412/approve')
    c.post('/api/v1/demo/reset')
    assert c.get('/api/v1/invoices/INV-2412').json()['status']=='ready'
    assert c.get('/api/v1/integrations').json()['bank_payment']['payment_initiation'] is False
    assert c.post('/api/v1/payments/execute').status_code==404


def test_no_full_account_exposed(tmp_path):
    c=client(tmp_path)
    invoice=c.get('/api/v1/invoices/INV-2409').json()
    assert invoice['iban']=='•••• 9077'
    assert 'SYNTHETIC-CY-9077' not in str(invoice)
