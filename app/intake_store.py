"""Tenant-scoped, encrypted invoice intake persistence."""

import json
import os
import re
from hashlib import sha256
from decimal import Decimal
from uuid import UUID, uuid4

from .documents import PrivateInvoiceStorage, validate_invoice_document
from .invoice_ai import InvoiceProvider, ProviderUnavailable, ReviewedInvoice, extract_invoice
from .postgres_store import PostgresStore, Principal

from .security import AccountProtector


class DraftCipher:
    def __init__(self, protector: AccountProtector):
        self.cipher = protector.cipher

    @staticmethod
    def _aad(organization_id: UUID, intake_id: UUID) -> bytes:
        return f"trustpay-intake:{organization_id}:{intake_id}".encode("ascii")

    def seal(self, fields: dict, organization_id: UUID, intake_id: UUID) -> bytes:
        nonce = os.urandom(12)
        plain = json.dumps(fields, sort_keys=True, separators=(",", ":")).encode("utf-8")
        return nonce + self.cipher.encrypt(nonce, plain, self._aad(organization_id, intake_id))

    def open(self, encrypted: bytes, organization_id: UUID, intake_id: UUID) -> dict:
        return json.loads(self.cipher.decrypt(encrypted[:12], encrypted[12:],
                                              self._aad(organization_id, intake_id)))


class IntakeStore:
    def __init__(self, store: PostgresStore, storage: PrivateInvoiceStorage,
                 provider: InvoiceProvider | None = None):
        self.store = store
        self.storage = storage
        self.provider = provider
        self.cipher = DraftCipher(store.protector)

    @staticmethod
    def _write_role(principal: Principal) -> None:
        if principal.role not in {"owner", "admin", "analyst"}:
            raise PermissionError("Role cannot review invoice intakes")

    @staticmethod
    def _audit(con, principal: Principal, intake_id: UUID, action: str, detail: str) -> None:
        con.execute("""insert into public.audit_logs
            (organization_id,actor_id,action,target_type,target_id,title,detail)
            values (%s,%s,%s,'invoice_intake',%s,%s,%s)""",
            (principal.organization_id, principal.user_id, action, str(intake_id),
             action.replace("_", " ").title(), detail))

    @staticmethod
    def _row(con, intake_id: UUID, principal: Principal, *, lock: bool = False):
        query = """select t.*, i.public_id as invoice_public_id from public.invoice_intakes t
            left join public.invoices i on i.organization_id=t.organization_id and i.id=t.invoice_id
            where t.organization_id=%s and t.id=%s"""
        if lock:
            query += " for update of t"
        row = con.execute(query, (principal.organization_id, intake_id)).fetchone()
        if row is None:
            raise LookupError("Invoice intake not found")
        return row

    def _present(self, row: dict) -> dict:
        encrypted = row["fields_encrypted"]
        payload = self.cipher.open(encrypted, row["organization_id"], row["id"]) if encrypted else {}
        return {"id": str(row["id"]), "status": row["status"],
                "fields": payload.get("fields", {}),
                "supplier_id": payload.get("supplier_id"),
                "create_new_supplier": payload.get("create_new_supplier", False),
                "uncertain_fields": row["uncertain_fields"],
                "method": row["extraction_method"], "error_code": row["error_code"],
                "explanation": row["explanation"], "explanation_method": row["explanation_method"],
                "invoice_id": row["invoice_public_id"],
                "content_type": row["content_type"], "size_bytes": row["size_bytes"],
                "created_at": row["created_at"].isoformat()}

    def get(self, intake_id: UUID, principal: Principal) -> dict:
        with self.store.connect() as con:
            return self._present(self._row(con, intake_id, principal))

    def create(self, data: bytes, content_type: str, principal: Principal,
               idempotency_key: str | None = None) -> dict:
        self._write_role(principal)
        extension = validate_invoice_document(content_type, data)
        if idempotency_key and not re.fullmatch(r"[A-Za-z0-9._-]{8,128}", idempotency_key):
            raise ValueError("Idempotency-Key must be 8–128 safe characters")
        digest = sha256(data).hexdigest()
        if idempotency_key:
            with self.store.connect() as con:
                existing = con.execute("""select id,sha256 from public.invoice_intakes
                    where organization_id=%s and uploaded_by=%s and idempotency_key=%s""",
                    (principal.organization_id, principal.user_id, idempotency_key)).fetchone()
            if existing:
                if existing["sha256"].strip() != digest:
                    raise FileExistsError("Idempotency key already used for a different document")
                return self.get(existing["id"], principal)
        result = extract_invoice(data, content_type, self.provider)
        intake_id, document_id = uuid4(), uuid4()
        path = f"{principal.organization_id}/{intake_id}/{document_id}{extension}"
        encrypted = self.cipher.seal({"fields": result.fields.model_dump()}, principal.organization_id, intake_id)
        with self.store.connect() as con:
            recent = con.execute("""select count(*) as total from public.invoice_intakes
                where organization_id=%s and uploaded_by=%s and created_at > now() - interval '1 hour'""",
                (principal.organization_id, principal.user_id)).fetchone()["total"]
            if recent >= 20:
                raise PermissionError("Hourly invoice intake limit reached")
            con.execute("""insert into public.invoice_intakes
                (id,organization_id,uploaded_by,storage_path,content_type,size_bytes,sha256,
                 idempotency_key,status,fields_encrypted,uncertain_fields,extraction_method,error_code)
                values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                (intake_id, principal.organization_id, principal.user_id, path, content_type,
                 len(data), digest, idempotency_key, result.status, encrypted,
                 json.dumps(result.uncertain_fields), result.method, result.error_code))
            self.storage.upload(path, content_type, data)
            self._audit(con, principal, intake_id, "INTAKE_UPLOADED", "Private invoice uploaded for human review")
        return self.get(intake_id, principal)

    def retry(self, intake_id: UUID, principal: Principal) -> dict:
        self._write_role(principal)
        with self.store.connect() as con:
            row = self._row(con, intake_id, principal)
        if row["status"] not in {"provider_unavailable", "needs_review"}:
            raise ValueError("This intake cannot be re-extracted")
        data = self.storage.download(row["storage_path"])
        result = extract_invoice(data, row["content_type"], self.provider)
        encrypted = self.cipher.seal({"fields": result.fields.model_dump()}, principal.organization_id, intake_id)
        with self.store.connect() as con:
            current = self._row(con, intake_id, principal, lock=True)
            if current["status"] not in {"provider_unavailable", "needs_review"}:
                raise ValueError("This intake has already been reviewed")
            con.execute("""update public.invoice_intakes set status=%s,fields_encrypted=%s,
                uncertain_fields=%s,extraction_method=%s,error_code=%s,updated_at=now()
                where organization_id=%s and id=%s""",
                (result.status, encrypted, json.dumps(result.uncertain_fields), result.method,
                 result.error_code, principal.organization_id, intake_id))
            self._audit(con, principal, intake_id, "INTAKE_REEXTRACTED", "Invoice extraction retried")
        return self.get(intake_id, principal)

    def review(self, intake_id: UUID, fields: ReviewedInvoice, supplier_id: str | None,
               create_new_supplier: bool, principal: Principal) -> dict:
        self._write_role(principal)
        if supplier_id and create_new_supplier:
            raise ValueError("Select an existing supplier or confirm a new one")
        if not supplier_id and not create_new_supplier:
            raise ValueError("Select a supplier or confirm a new supplier")
        payload = {"fields": fields.model_dump(), "supplier_id": supplier_id or None,
                   "create_new_supplier": create_new_supplier}
        encrypted = self.cipher.seal(payload, principal.organization_id, intake_id)
        with self.store.connect() as con:
            row = self._row(con, intake_id, principal, lock=True)
            if row["status"] == "analyzed":
                raise ValueError("Analyzed intake cannot be changed")
            if supplier_id and not con.execute("""select 1 from public.suppliers
                where organization_id=%s and public_id=%s""",
                (principal.organization_id, supplier_id)).fetchone():
                raise LookupError("Supplier not found")
            con.execute("""update public.invoice_intakes set status='reviewed',fields_encrypted=%s,
                uncertain_fields='[]'::jsonb,error_code=null,updated_at=now()
                where organization_id=%s and id=%s""", (encrypted, principal.organization_id, intake_id))
            self._audit(con, principal, intake_id, "INTAKE_REVIEWED", "Extracted fields confirmed by reviewer")
        return self.get(intake_id, principal)

    def analyze(self, intake_id: UUID, principal: Principal) -> dict:
        self._write_role(principal)
        with self.store.connect() as con:
            row = self._row(con, intake_id, principal)
        public_id = f"UPL-{intake_id.hex[:16].upper()}"
        if row["status"] == "analyzed":
            return self.store.invoice(public_id, principal)
        if row["status"] != "reviewed" or not row["fields_encrypted"]:
            raise ValueError("Review all required invoice fields before analysis")
        payload = self.cipher.open(row["fields_encrypted"], principal.organization_id, intake_id)
        fields = ReviewedInvoice.model_validate(payload["fields"])
        if fields.currency != "EUR":
            raise ValueError("Only EUR assessments are supported")
        item = {"id": public_id, "supplier_id": payload.get("supplier_id"),
                "supplier_name": fields.supplier_name,
                "registration_number": fields.registration_number, "vat_number": fields.vat_number,
                "create_new_supplier": payload.get("create_new_supplier", False),
                "invoice_number": fields.invoice_number,
                "amount_cents": int(Decimal(fields.total_amount) * 100),
                "creditor_account": fields.iban, "invoice_date": fields.invoice_date,
                "due_date": fields.due_date, "currency": fields.currency, "source": "uploaded"}
        try:
            invoice = self.store.create_assessment(item, principal)
        except FileExistsError:
            invoice = self.store.invoice(public_id, principal)
        explanation, explanation_method = invoice["reason"], "verified_policy"
        if self.provider is not None and hasattr(self.provider, "explain"):
            evidence = {"risk_score": invoice["risk"], "risk_level": invoice["level"],
                        "historical_payment_count": invoice["history"],
                        "current_account": invoice["iban"], "previous_account": invoice["previous"],
                        "signals": [signal["code"] for signal in invoice["signals"]]}
            try:
                explanation = self.provider.explain(evidence)
                explanation_method = "openai_summary"
            except ProviderUnavailable:
                pass
        with self.store.connect() as con:
            current = self._row(con, intake_id, principal, lock=True)
            if current["status"] != "analyzed":
                internal = con.execute("""select id from public.invoices
                    where organization_id=%s and public_id=%s and external_source='uploaded'""",
                    (principal.organization_id, public_id)).fetchone()
                if internal is None:
                    raise LookupError("Uploaded assessment not found")
                document_id = UUID(row["storage_path"].split("/")[-1].split(".")[0])
                con.execute("""insert into public.invoice_documents
                    (id,organization_id,invoice_id,storage_path,content_type,size_bytes,uploaded_by)
                    values (%s,%s,%s,%s,%s,%s,%s) on conflict (storage_path) do nothing""",
                    (document_id, principal.organization_id, internal["id"], row["storage_path"],
                     row["content_type"], row["size_bytes"], row["uploaded_by"]))
                con.execute("""update public.invoice_intakes set status='analyzed',invoice_id=%s,
                    explanation=%s,explanation_method=%s,updated_at=now()
                    where organization_id=%s and id=%s""",
                    (internal["id"], explanation, explanation_method, principal.organization_id, intake_id))
                self._audit(con, principal, intake_id, "INTAKE_ANALYZED", "Reviewed invoice analyzed by policy engine")
        return invoice

    def document(self, intake_id: UUID, principal: Principal) -> tuple[bytes, str]:
        with self.store.connect() as con:
            row = self._row(con, intake_id, principal)
        return self.storage.download(row["storage_path"]), row["content_type"]
