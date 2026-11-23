"""FastAPI app for local demo. Never exposes a bank-payment endpoint."""
import os
from datetime import date
from pathlib import Path
from uuid import UUID, uuid4
import psycopg
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse, Response
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool
from .auth import SupabaseAuth
from .database import Store
from .documents import MAX_DOCUMENT_BYTES, PrivateInvoiceStorage, validate_invoice_document
from .intake_store import IntakeStore
from .invoice_ai import OpenAIInvoiceProvider, ReviewedInvoice
from .postgres_store import PostgresStore, Principal
from .security import AccountProtector

PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env", override=False)

class AssessmentInput(BaseModel):
    id: str = Field(min_length=3, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
    supplier_id: str = Field(min_length=3, max_length=32)
    invoice_number: str = Field(min_length=2, max_length=70)
    amount_cents: int = Field(gt=0, le=100_000_000_000)
    creditor_account: str = Field(min_length=4, max_length=64)
    invoice_date: date

class VerificationInput(BaseModel):
    evidence_note: str = Field(min_length=12, max_length=500)

class IntakeReviewInput(BaseModel):
    fields: ReviewedInvoice
    supplier_id: str | None = None
    create_new_supplier: bool = False

def create_app(database_path: str | None = None) -> FastAPI:
    mode = "sqlite" if database_path is not None else os.environ.get("TRUSTPAY_BACKEND", "sqlite")
    if mode == "postgres":
        dsn = os.environ.get("TRUSTPAY_DATABASE_URL", "")
        if not dsn:
            raise RuntimeError("TRUSTPAY_DATABASE_URL is required in PostgreSQL mode")
        store = PostgresStore(dsn, AccountProtector.from_environment())
        auth = SupabaseAuth(os.environ.get("SUPABASE_URL", ""), os.environ.get("SUPABASE_PUBLISHABLE_KEY", ""))
    elif mode == "sqlite":
        if database_path is None and os.environ.get("TRUSTPAY_DATABASE_URL"):
            raise RuntimeError("Set TRUSTPAY_BACKEND=postgres to use TRUSTPAY_DATABASE_URL")
        path = database_path or os.environ.get("TRUSTPAY_DB_PATH",str(PROJECT_ROOT / "data" / "trustpay.sqlite3"))
        store = Store(path)
        auth = None
    else:
        raise RuntimeError("TRUSTPAY_BACKEND must be sqlite or postgres")
    app = FastAPI(title="TrustPay AI API", version="0.2.0", description="TrustPay review API — does NOT move money")
    app.state.store = store
    storage = PrivateInvoiceStorage(os.environ.get("SUPABASE_URL", "")) if mode == "postgres" else None
    provider_enabled = (mode == "postgres" and bool(os.environ.get("OPENAI_API_KEY")) and
                        os.environ.get("TRUSTPAY_AI_EXTERNAL_DOCUMENTS") == "development" and
                        os.environ.get("TRUSTPAY_ENVIRONMENT") == "development")
    provider = OpenAIInvoiceProvider(model=os.environ.get("TRUSTPAY_AI_MODEL", "gpt-4o-mini")) if provider_enabled else None
    intake = IntakeStore(store, storage, provider) if mode == "postgres" else None

    def principal(authorization: str | None = Header(default=None),
                  x_organization_id: str | None = Header(default=None)) -> Principal | None:
        if mode == "sqlite":
            return None
        token = authorization.removeprefix("Bearer ").strip() if authorization and authorization.startswith("Bearer ") else ""
        user_id = auth.user_id(token)
        try:
            return store.principal(user_id, x_organization_id)
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        except PermissionError as exc:
            raise HTTPException(403, str(exc)) from exc

    @app.middleware("http")
    async def no_store(request, call_next):
        try:
            response = await call_next(request)
        except psycopg.Error:
            response = JSONResponse({"detail": "Database unavailable"}, status_code=503)
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    @app.get("/")
    def index():
        if mode == "postgres":
            raise HTTPException(404, "Use the authenticated Next.js frontend")
        return FileResponse(PROJECT_ROOT / "web" / "index.html")

    @app.get("/app.js")
    def javascript():
        if mode == "postgres":
            raise HTTPException(404, "Legacy UI unavailable in PostgreSQL mode")
        return FileResponse(PROJECT_ROOT / "web" / "app.js", media_type="application/javascript")

    @app.get("/api/health")
    def health():
        if mode == "postgres":
            with store.connect() as con:
                con.execute("select 1")
        return {"status":"ok", "mode":"supabase-postgres" if mode == "postgres" else "synthetic-local-demo",
                "payment_initiation":False, "jinius_connection":"disconnected" if mode == "postgres" else "mock",
                "risk_model":"auditable-rules-v1",
                "invoice_reader":"openai_vision" if provider_enabled else "local_pdf_text"}

    @app.get("/api/v1/invoices")
    def invoices(user: Principal | None = Depends(principal)):
        return store.invoices(user) if mode == "postgres" else store.invoices()

    @app.post("/api/v1/invoice-intakes", status_code=201)
    async def create_intake(file: UploadFile = File(...),
                            idempotency_key: str | None = Header(default=None),
                            user: Principal | None = Depends(principal)):
        if mode != "postgres":
            raise HTTPException(403, "Invoice intake requires PostgreSQL mode")
        data = await file.read(MAX_DOCUMENT_BYTES + 1)
        try:
            return await run_in_threadpool(intake.create, data, file.content_type or "", user, idempotency_key)
        except PermissionError as exc:
            raise HTTPException(429 if "limit" in str(exc) else 403, str(exc)) from exc
        except FileExistsError as exc:
            raise HTTPException(409, str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc

    @app.get("/api/v1/invoice-intakes/{intake_id}")
    def get_intake(intake_id: UUID, user: Principal | None = Depends(principal)):
        if mode != "postgres":
            raise HTTPException(404, "Invoice intake not found")
        try: return intake.get(intake_id, user)
        except LookupError as exc: raise HTTPException(404, str(exc)) from exc

    @app.patch("/api/v1/invoice-intakes/{intake_id}")
    def review_intake(intake_id: UUID, payload: IntakeReviewInput,
                      user: Principal | None = Depends(principal)):
        if mode != "postgres":
            raise HTTPException(403, "Invoice intake requires PostgreSQL mode")
        try: return intake.review(intake_id, payload.fields, payload.supplier_id,
                                  payload.create_new_supplier, user)
        except LookupError as exc: raise HTTPException(404, str(exc)) from exc
        except PermissionError as exc: raise HTTPException(403, str(exc)) from exc
        except ValueError as exc: raise HTTPException(422, str(exc)) from exc

    @app.post("/api/v1/invoice-intakes/{intake_id}/extract")
    async def retry_intake(intake_id: UUID, user: Principal | None = Depends(principal)):
        if mode != "postgres":
            raise HTTPException(403, "Invoice intake requires PostgreSQL mode")
        try: return await run_in_threadpool(intake.retry, intake_id, user)
        except LookupError as exc: raise HTTPException(404, str(exc)) from exc
        except PermissionError as exc: raise HTTPException(429 if "limit" in str(exc) else 403, str(exc)) from exc
        except ValueError as exc: raise HTTPException(422, str(exc)) from exc

    @app.post("/api/v1/invoice-intakes/{intake_id}/analyze")
    def analyze_intake(intake_id: UUID, user: Principal | None = Depends(principal)):
        if mode != "postgres":
            raise HTTPException(403, "Invoice intake requires PostgreSQL mode")
        try: return intake.analyze(intake_id, user)
        except LookupError as exc: raise HTTPException(404, str(exc)) from exc
        except PermissionError as exc: raise HTTPException(403, str(exc)) from exc
        except ValueError as exc: raise HTTPException(422, str(exc)) from exc

    @app.get("/api/v1/invoice-intakes/{intake_id}/document")
    def intake_document(intake_id: UUID, user: Principal | None = Depends(principal)):
        if mode != "postgres":
            raise HTTPException(404, "Invoice intake not found")
        try:
            data, content_type = intake.document(intake_id, user)
        except LookupError as exc:
            raise HTTPException(404, str(exc)) from exc
        return Response(data, media_type=content_type, headers={"Content-Disposition": "attachment"})

    @app.get("/api/v1/me/organizations")
    def organizations(authorization: str | None = Header(default=None)):
        if mode == "sqlite":
            return [{"id": "asteria-demo", "name": "Asteria synthetic demo", "role": "demo"}]
        token = authorization.removeprefix("Bearer ").strip() if authorization and authorization.startswith("Bearer ") else ""
        return store.memberships(auth.user_id(token))

    @app.get("/api/v1/invoices/{invoice_id}")
    def invoice(invoice_id: str, user: Principal | None = Depends(principal)):
        try: return store.invoice(invoice_id, user) if mode == "postgres" else store.invoice(invoice_id)
        except LookupError as e: raise HTTPException(404,str(e)) from e

    @app.get("/api/v1/invoices/{invoice_id}/assessments")
    def assessment_history(invoice_id: str, user: Principal | None = Depends(principal)):
        if mode != "postgres":
            raise HTTPException(404, "Assessment history requires PostgreSQL mode")
        try: return store.assessment_history(invoice_id, user)
        except LookupError as exc: raise HTTPException(404, str(exc)) from exc

    @app.get("/api/v1/invoices/{invoice_id}/assessments/{assessment_id}")
    def assessment_detail(invoice_id: str, assessment_id: UUID,
                          user: Principal | None = Depends(principal)):
        if mode != "postgres":
            raise HTTPException(404, "Assessment history requires PostgreSQL mode")
        try:
            return next(item for item in store.assessment_history(invoice_id, user)
                        if item["id"] == str(assessment_id))
        except (LookupError, StopIteration) as exc:
            raise HTTPException(404, "Assessment not found") from exc

    @app.get("/api/v1/invoices/{invoice_id}/documents")
    def documents(invoice_id: str, user: Principal | None = Depends(principal)):
        if mode != "postgres":
            return []
        try:
            return store.document_list(invoice_id, user)
        except LookupError as exc:
            raise HTTPException(404, str(exc)) from exc

    @app.post("/api/v1/invoices/{invoice_id}/documents", status_code=201)
    async def upload_document(invoice_id: str, file: UploadFile = File(...),
                              user: Principal | None = Depends(principal)):
        if mode != "postgres":
            raise HTTPException(403, "Private document storage requires PostgreSQL mode")
        if user.role not in {"owner", "admin", "analyst"}:
            raise HTTPException(403, "Role cannot upload invoice documents")
        try:
            store.invoice(invoice_id, user)
        except LookupError as exc:
            raise HTTPException(404, str(exc)) from exc
        data = await file.read(MAX_DOCUMENT_BYTES + 1)
        try:
            extension = validate_invoice_document(file.content_type or "", data)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        document_id = uuid4()
        path = f"{user.organization_id}/{uuid4()}/{document_id}{extension}"
        storage.upload(path, file.content_type, data)
        store.record_document(invoice_id, document_id, path, file.content_type, len(data), user)
        return {"id": str(document_id), "content_type": file.content_type, "size_bytes": len(data)}

    @app.get("/api/v1/invoices/{invoice_id}/documents/{document_id}")
    def download_document(invoice_id: str, document_id: UUID,
                          user: Principal | None = Depends(principal)):
        if mode != "postgres":
            raise HTTPException(404, "Document not found")
        try:
            document = store.document_path(invoice_id, document_id, user)
        except LookupError as exc:
            raise HTTPException(404, str(exc)) from exc
        return Response(storage.download(document["storage_path"]), media_type=document["content_type"],
                        headers={"Content-Disposition": "attachment"})

    @app.get("/api/v1/suppliers")
    def suppliers(user: Principal | None = Depends(principal)):
        return store.suppliers(user) if mode == "postgres" else store.suppliers()

    @app.get("/api/v1/audit")
    def audit(user: Principal | None = Depends(principal)):
        return store.audit(user) if mode == "postgres" else store.audit()

    @app.get("/api/v1/integrations")
    def integrations(user: Principal | None = Depends(principal)):
        if mode == "postgres":
            return store.integrations(user)
        return {"jinius":{"status":"mock", "adapter":"DemoJiniusAdapter", "live_connected":False,
                 "next_step":"Request authorized sandbox documentation and scopes from organizers"},
                "bank_payment":{"status":"disabled", "payment_initiation":False}}

    @app.post("/api/v1/invoices/assess", status_code=201)
    def assess(payload: AssessmentInput, user: Principal | None = Depends(principal)):
        try:
            item = {**payload.model_dump(),"invoice_date":str(payload.invoice_date)}
            return store.create_assessment(item, user) if mode == "postgres" else store.create_assessment(item)
        except LookupError as e: raise HTTPException(404,str(e)) from e
        except FileExistsError as e: raise HTTPException(409,str(e)) from e
        except ValueError as e: raise HTTPException(422,str(e)) from e
        except PermissionError as e: raise HTTPException(403,str(e)) from e
        except psycopg.errors.UniqueViolation as e: raise HTTPException(409,"Assessment already exists") from e

    @app.post("/api/v1/invoices/{invoice_id}/verify")
    def verify(invoice_id: str, payload: VerificationInput, user: Principal | None = Depends(principal)):
        return transition(invoice_id,"verify",payload.evidence_note,user)

    @app.post("/api/v1/invoices/{invoice_id}/approve")
    def approve(invoice_id: str, user: Principal | None = Depends(principal)):
        return transition(invoice_id,"approve","",user)

    @app.post("/api/v1/invoices/{invoice_id}/hold")
    def hold(invoice_id: str, user: Principal | None = Depends(principal)):
        return transition(invoice_id,"hold","",user)

    def transition(invoice_id,action,note,user):
        try: return store.transition(invoice_id,action,note,user) if mode == "postgres" else store.transition(invoice_id,action,note)
        except LookupError as e: raise HTTPException(404,str(e)) from e
        except PermissionError as e: raise HTTPException(403 if mode == "postgres" else 409,str(e)) from e
        except ValueError as e: raise HTTPException(422,str(e)) from e

    @app.post("/api/v1/demo/reset")
    def reset():
        if mode == "postgres":
            raise HTTPException(403, "Demo reset is unavailable in PostgreSQL mode")
        store.reset_demo()
        return {"reset":True,"warning":"Synthetic local demo only"}

    return app

app = create_app()
