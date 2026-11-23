"""FastAPI app for local demo. Never exposes a bank-payment endpoint."""
import os
from datetime import date
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field
from .database import Store

PROJECT_ROOT = Path(__file__).resolve().parent.parent

class AssessmentInput(BaseModel):
    id: str = Field(min_length=3, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
    supplier_id: str = Field(min_length=3, max_length=32)
    invoice_number: str = Field(min_length=2, max_length=70)
    amount_cents: int = Field(gt=0, le=100_000_000_000)
    creditor_account: str = Field(min_length=4, max_length=64)
    invoice_date: date

class VerificationInput(BaseModel):
    evidence_note: str = Field(min_length=12, max_length=500)

def create_app(database_path: str | None = None) -> FastAPI:
    path = database_path or os.environ.get("TRUSTPAY_DB_PATH",str(PROJECT_ROOT / "data" / "trustpay.sqlite3"))
    store = Store(path)
    app = FastAPI(title="TrustPay AI API", version="0.1.0", description="Local synthetic-data MVP — does NOT move money")
    app.state.store = store

    @app.middleware("http")
    async def no_store(request, call_next):
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    @app.get("/")
    def index():
        return FileResponse(PROJECT_ROOT / "web" / "index.html")

    @app.get("/app.js")
    def javascript():
        return FileResponse(PROJECT_ROOT / "web" / "app.js", media_type="application/javascript")

    @app.get("/api/health")
    def health():
        return {"status":"ok", "mode":"synthetic-local-demo", "payment_initiation":False,
                "jinius_connection":"mock", "risk_model":"auditable-rules-v1"}

    @app.get("/api/v1/invoices")
    def invoices():
        return store.invoices()

    @app.get("/api/v1/invoices/{invoice_id}")
    def invoice(invoice_id: str):
        try: return store.invoice(invoice_id)
        except LookupError as e: raise HTTPException(404,str(e)) from e

    @app.get("/api/v1/suppliers")
    def suppliers():
        return store.suppliers()

    @app.get("/api/v1/audit")
    def audit():
        return store.audit()

    @app.get("/api/v1/integrations")
    def integrations():
        return {"jinius":{"status":"mock", "adapter":"DemoJiniusAdapter", "live_connected":False,
                 "next_step":"Request authorized sandbox documentation and scopes from organizers"},
                "bank_payment":{"status":"disabled", "payment_initiation":False}}

    @app.post("/api/v1/invoices/assess", status_code=201)
    def assess(payload: AssessmentInput):
        try:
            return store.create_assessment({**payload.model_dump(),"invoice_date":str(payload.invoice_date)})
        except LookupError as e: raise HTTPException(404,str(e)) from e
        except FileExistsError as e: raise HTTPException(409,str(e)) from e
        except ValueError as e: raise HTTPException(422,str(e)) from e

    @app.post("/api/v1/invoices/{invoice_id}/verify")
    def verify(invoice_id: str, payload: VerificationInput):
        return transition(invoice_id,"verify",payload.evidence_note)

    @app.post("/api/v1/invoices/{invoice_id}/approve")
    def approve(invoice_id: str):
        return transition(invoice_id,"approve")

    @app.post("/api/v1/invoices/{invoice_id}/hold")
    def hold(invoice_id: str):
        return transition(invoice_id,"hold")

    def transition(invoice_id,action,note=""):
        try: return store.transition(invoice_id,action,note)
        except LookupError as e: raise HTTPException(404,str(e)) from e
        except PermissionError as e: raise HTTPException(409,str(e)) from e
        except ValueError as e: raise HTTPException(422,str(e)) from e

    @app.post("/api/v1/demo/reset")
    def reset():
        store.reset_demo()
        return {"reset":True,"warning":"Synthetic local demo only"}

    return app

app = create_app()
