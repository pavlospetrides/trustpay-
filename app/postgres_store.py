"""Tenant-scoped PostgreSQL persistence. Never falls back to demo SQLite."""

import json
from collections import Counter
from dataclasses import dataclass
from decimal import Decimal
from statistics import median
from uuid import UUID

import psycopg
from psycopg.rows import dict_row

from .risk import assess_payment
from .security import AccountProtector


@dataclass(frozen=True)
class Principal:
    user_id: UUID
    organization_id: UUID
    role: str


def authorize_transition(principal: Principal, action: str, row: dict) -> None:
    roles = {
        "verify": {"owner", "admin", "analyst"},
        "approve": {"owner", "admin", "approver"},
        "hold": {"owner", "admin", "analyst"},
    }
    if action not in roles or principal.role not in roles[action]:
        raise PermissionError("Role is not authorized for this action")
    status = row["status"]
    if action == "verify":
        if status in {"approved", "blocked"} or row.get("verified_by"):
            raise PermissionError("Invoice cannot be verified in its current state")
        if row.get("created_by") == principal.user_id:
            raise PermissionError("Invoice creator cannot independently verify it")
    elif action == "approve":
        if status != "ready":
            raise PermissionError("Invoice is not ready for approval")
        if row["score"] >= 40 and not row.get("verified_by"):
            raise PermissionError("Risky invoice needs independent verification")
        if row.get("verified_by") == principal.user_id or row.get("created_by") == principal.user_id:
            raise PermissionError("Maker-checker separation failed")
    elif status in {"approved", "blocked"}:
        raise PermissionError("Invoice cannot be placed on hold")


def cents(amount: Decimal) -> int:
    return int(amount * 100)


class PostgresStore:
    is_postgres = True

    def __init__(self, dsn: str, protector: AccountProtector):
        if not dsn:
            raise RuntimeError("TRUSTPAY_DATABASE_URL is required in PostgreSQL mode")
        self.dsn = dsn
        self.protector = protector

    def connect(self):
        return psycopg.connect(self.dsn, row_factory=dict_row, connect_timeout=5)

    def principal(self, user_id: UUID, requested_org: str | None) -> Principal:
        if requested_org:
            try:
                requested = UUID(requested_org)
            except ValueError as exc:
                raise ValueError("Invalid organization ID") from exc
        else:
            requested = None
        with self.connect() as con:
            rows = con.execute("""select m.organization_id, m.role from public.organization_memberships m
                join public.organizations o on o.id=m.organization_id and o.status='active'
                where m.user_id = %s order by m.created_at, m.organization_id""", (user_id,)).fetchall()
        if not rows:
            raise PermissionError("No organization membership")
        if requested is None and len(rows) != 1:
            raise ValueError("X-Organization-Id is required for users in multiple organizations")
        row = next((item for item in rows if item["organization_id"] == (requested or rows[0]["organization_id"])), None)
        if row is None:
            raise PermissionError("No membership in requested organization")
        return Principal(user_id, row["organization_id"], row["role"])

    def memberships(self, user_id: UUID):
        with self.connect() as con:
            rows = con.execute("""select o.id, o.name, m.role from public.organization_memberships m
                join public.organizations o on o.id=m.organization_id
                where m.user_id=%s and o.status='active' order by o.name""", (user_id,)).fetchall()
        return [{"id": str(row["id"]), "name": row["name"], "role": row["role"]} for row in rows]

    @staticmethod
    def _invoice_key(invoice_id: str):
        try:
            return UUID(invoice_id), invoice_id
        except ValueError:
            return None, invoice_id

    def _history(self, con, org: UUID, supplier_id: UUID):
        return con.execute("""select p.amount, coalesce(p.historical_invoice_number,i.invoice_number) as historical_invoice_number,
              b.iban_fingerprint, b.iban_last4
            from public.payment_records p join public.supplier_bank_accounts b
              on b.organization_id=p.organization_id and b.id=p.bank_account_id
            left join public.invoices i on i.organization_id=p.organization_id and i.id=p.invoice_id
            where p.organization_id=%s and p.supplier_id=%s and p.status='paid'
            order by p.paid_at, p.id""", (org, supplier_id)).fetchall()

    @staticmethod
    def _mask(last4: str | None) -> str:
        return "•••• " + last4 if last4 else "••••"

    def _present(self, con, row):
        history = self._history(con, row["organization_id"], row["supplier_id"])
        account_counts = Counter(h["iban_fingerprint"] for h in history)
        canonical = max(sorted(account_counts), key=account_counts.get) if account_counts else None
        previous = next((h["iban_last4"] for h in history if h["iban_fingerprint"] == canonical), None)
        signals = con.execute("""select code, weight, explanation, severity from public.risk_signals
            where organization_id=%s and assessment_id=%s order by weight desc, code""",
            (row["organization_id"], row["assessment_id"])).fetchall()
        signal_list = [dict(s) for s in signals]
        return {
            "id": row["public_id"], "supplier_id": row["supplier_public_id"],
            "supplier": row["supplier_name"], "short": row["supplier_name"],
            "invoice": row["invoice_number"], "amount_cents": cents(row["total_amount"]),
            "amount": float(row["total_amount"]), "iban": self._mask(row["iban_last4"]),
            "previous": self._mask(previous) if previous else "New supplier",
            "history": len(history), "date": row["issue_date"].isoformat(),
            "risk": row["score"], "level": row["severity"], "kind": row["kind"],
            "reason": row["explanation"], "signals": signal_list,
            "notes": [s["explanation"] for s in signal_list] or [row["explanation"]],
            "status": row["status"], "verified": bool(row["verified_by"]),
            "verified_by": str(row["verified_by"]) if row["verified_by"] else None,
            "approved_by": str(row["approved_by"]) if row["approved_by"] else None,
            "reference": "Synthetic development seed" if row["external_source"] == "synthetic_seed" else "Manual assessment",
            "source": row["external_source"],
        }

    _INVOICE_QUERY = """select i.*, s.public_id as supplier_public_id, s.name as supplier_name,
        b.iban_last4, a.id as assessment_id, a.score, a.severity, a.kind, a.explanation
        from public.invoices i
        join public.suppliers s on s.organization_id=i.organization_id and s.id=i.supplier_id
        join public.supplier_bank_accounts b on b.organization_id=i.organization_id and b.id=i.bank_account_id
        join lateral (select * from public.risk_assessments a
          where a.organization_id=i.organization_id and a.invoice_id=i.id
          order by a.assessed_at desc, a.id desc limit 1) a on true
        where i.organization_id=%s"""

    def invoices(self, principal: Principal):
        with self.connect() as con:
            rows = con.execute(self._INVOICE_QUERY + " order by i.issue_date desc, i.public_id desc",
                               (principal.organization_id,)).fetchall()
            return [self._present(con, row) for row in rows]

    def invoice(self, invoice_id: str, principal: Principal):
        uuid_id, public_id = self._invoice_key(invoice_id)
        with self.connect() as con:
            row = con.execute(self._INVOICE_QUERY + " and (i.id=%s or i.public_id=%s)",
                              (principal.organization_id, uuid_id, public_id)).fetchone()
            if row is None:
                raise LookupError("Invoice not found")
            return self._present(con, row)

    def suppliers(self, principal: Principal):
        with self.connect() as con:
            rows = con.execute("""select id, public_id, name from public.suppliers
                where organization_id=%s order by name""", (principal.organization_id,)).fetchall()
            result = []
            for row in rows:
                history = self._history(con, principal.organization_id, row["id"])
                account_counts = Counter(h["iban_fingerprint"] for h in history)
                canonical = max(sorted(account_counts), key=account_counts.get) if account_counts else None
                last4 = next((h["iban_last4"] for h in history if h["iban_fingerprint"] == canonical), None)
                amounts = [cents(h["amount"]) for h in history]
                result.append({"id": row["public_id"], "name": row["name"], "short": row["name"],
                               "payment_count": len(history), "last4": self._mask(last4),
                               "historical_median_eur": float(Decimal(median(amounts)) / 100) if amounts else None})
            return result

    def audit(self, principal: Principal):
        with self.connect() as con:
            rows = con.execute("""select id, actor_id, action, title, detail, target_id as invoice_id, created_at
                from public.audit_logs where organization_id=%s order by created_at desc, id desc limit 200""",
                (principal.organization_id,)).fetchall()
            return [{"id": str(row["id"]), "actor": str(row["actor_id"] or "system"),
                     "action": row["action"], "title": row["title"], "detail": row["detail"],
                     "invoice_id": row["invoice_id"], "created_at": row["created_at"].isoformat()}
                    for row in rows]

    def _audit(self, con, principal: Principal, invoice_id: str, action: str, title: str, detail: str):
        con.execute("""insert into public.audit_logs
            (organization_id,actor_id,action,target_type,target_id,title,detail)
            values (%s,%s,%s,'invoice',%s,%s,%s)""",
            (principal.organization_id, principal.user_id, action, invoice_id, title, detail))

    def create_assessment(self, item: dict, principal: Principal):
        if principal.role not in {"owner", "admin", "analyst"}:
            raise PermissionError("Role cannot assess invoices")
        source = item.get("source", "manual")
        if source not in {"manual", "synthetic_seed"}:
            raise ValueError("Unknown assessment source")
        org = principal.organization_id
        ciphertext, fingerprint, last4 = self.protector.protect(item["creditor_account"])
        with self.connect() as con:
            supplier = con.execute("""select id from public.suppliers
                where organization_id=%s and public_id=%s""", (org, item["supplier_id"])).fetchone()
            if supplier is None:
                raise LookupError("Supplier not found")
            if con.execute("select 1 from public.invoices where organization_id=%s and public_id=%s",
                           (org, item["id"])).fetchone():
                raise FileExistsError("Assessment ID already exists")
            history = self._history(con, org, supplier["id"])
            assessment = assess_payment(
                invoice_number=item["invoice_number"], current_account=fingerprint,
                amount_cents=item["amount_cents"],
                previous_accounts=[h["iban_fingerprint"] for h in history],
                previous_paid_amounts_cents=[cents(h["amount"]) for h in history],
                previously_paid_invoices=[h["historical_invoice_number"] for h in history if h["historical_invoice_number"]],
            )
            account = con.execute("""insert into public.supplier_bank_accounts
                (organization_id,supplier_id,encrypted_iban,iban_fingerprint,iban_last4)
                values (%s,%s,%s,%s,%s) on conflict (organization_id,supplier_id,iban_fingerprint)
                do update set updated_at=now() returning id""",
                (org, supplier["id"], ciphertext, fingerprint, last4)).fetchone()
            invoice = con.execute("""insert into public.invoices
                (organization_id,public_id,supplier_id,external_source,external_invoice_id,
                 invoice_number,issue_date,currency,total_amount,bank_account_id,status,created_by)
                values (%s,%s,%s,%s,%s,%s,%s,'EUR',%s,%s,%s,%s) returning id""",
                (org, item["id"], supplier["id"], source, item["id"], item["invoice_number"],
                 item["invoice_date"], Decimal(item["amount_cents"]) / 100,
                 account["id"], assessment.recommended_status,
                 None if source == "synthetic_seed" else principal.user_id)).fetchone()
            saved = con.execute("""insert into public.risk_assessments
                (organization_id,invoice_id,score,severity,kind,recommended_status,engine_version,explanation,evidence)
                values (%s,%s,%s,%s,%s,%s,'auditable-rules-v1',%s,%s) returning id""",
                (org, invoice["id"], assessment.score, assessment.level, assessment.kind,
                 assessment.recommended_status, assessment.reason,
                 json.dumps({"historical_payment_count": len(history), "policy_score_not_probability": True}))).fetchone()
            for signal in assessment.signals:
                con.execute("""insert into public.risk_signals
                    (organization_id,assessment_id,code,severity,weight,explanation,evidence)
                    values (%s,%s,%s,%s,%s,%s,%s)""",
                    (org, saved["id"], signal.code, signal.severity, signal.weight,
                     signal.explanation, json.dumps({"historical_payment_count": len(history)})))
            self._audit(con, principal, item["id"], "ASSESSED", "Payment risk assessed",
                        f"{item['id']} · policy score {assessment.score}/100")
        return self.invoice(item["id"], principal)

    def transition(self, invoice_id: str, action: str, note: str, principal: Principal):
        org = principal.organization_id
        uuid_id, public_id = self._invoice_key(invoice_id)
        with self.connect() as con:
            row = con.execute("""select i.*, a.score from public.invoices i
                join lateral (select score from public.risk_assessments a
                  where a.organization_id=i.organization_id and a.invoice_id=i.id
                  order by a.assessed_at desc, a.id desc limit 1) a on true
                where i.organization_id=%s and (i.id=%s or i.public_id=%s) for update of i""",
                (org, uuid_id, public_id)).fetchone()
            if row is None:
                raise LookupError("Invoice not found")
            authorize_transition(principal, action, row)
            if action == "verify":
                if len(note.strip()) < 12:
                    raise ValueError("Independent verification needs an evidence reference (12+ characters)")
                con.execute("""insert into public.verification_requests
                    (organization_id,invoice_id,bank_account_id,verification_type,status,
                     initiated_by,completed_by,verified_at,evidence_reference)
                    values (%s,%s,%s,'independent_callback','verified',%s,%s,now(),%s)""",
                    (org, row["id"], row["bank_account_id"], principal.user_id, principal.user_id, note.strip()))
                con.execute("""update public.supplier_bank_accounts set verification_status='verified',
                    last_verified_at=now(),updated_at=now() where organization_id=%s and id=%s""",
                    (org, row["bank_account_id"]))
                con.execute("""update public.invoices set verified_by=%s,status='ready',updated_at=now()
                    where organization_id=%s and id=%s""", (principal.user_id, org, row["id"]))
                title = "Independent verification recorded"
            elif action == "approve":
                con.execute("""insert into public.payment_approvals
                    (organization_id,invoice_id,actor_id,decision,reason)
                    values (%s,%s,%s,'approved','Internal review only; no payment initiation')""",
                    (org, row["id"], principal.user_id))
                con.execute("""update public.invoices set approved_by=%s,status='approved',updated_at=now()
                    where organization_id=%s and id=%s""", (principal.user_id, org, row["id"]))
                title = "Internal approval recorded — no transfer"
            else:
                con.execute("""update public.invoices set status='hold',updated_at=now()
                    where organization_id=%s and id=%s""", (org, row["id"]))
                title = "Invoice placed on hold"
            self._audit(con, principal, row["public_id"], action.upper(), title,
                        "Decision recorded with authorized actor; no payment initiated")
        return self.invoice(row["public_id"], principal)

    def integrations(self, principal: Principal):
        with self.connect() as con:
            row = con.execute("""select status from public.integration_connections
                where organization_id=%s and provider='jinius'""", (principal.organization_id,)).fetchone()
        status = row["status"] if row else "disconnected"
        return {"jinius": {"status": status, "adapter": "none", "live_connected": False,
                           "next_step": "Configure an authorized sandbox after API documentation is available"},
                "bank_payment": {"status": "disabled", "payment_initiation": False}}

    def _internal_invoice_id(self, con, public_id: str, principal: Principal):
        uuid_id, label = self._invoice_key(public_id)
        row = con.execute("""select id from public.invoices where organization_id=%s
            and (id=%s or public_id=%s)""", (principal.organization_id, uuid_id, label)).fetchone()
        if row is None:
            raise LookupError("Invoice not found")
        return row["id"]

    def document_list(self, public_id: str, principal: Principal):
        with self.connect() as con:
            invoice_id = self._internal_invoice_id(con, public_id, principal)
            rows = con.execute("""select id,content_type,size_bytes,created_at from public.invoice_documents
                where organization_id=%s and invoice_id=%s order by created_at desc""",
                (principal.organization_id, invoice_id)).fetchall()
        return [{**row, "id": str(row["id"]), "created_at": row["created_at"].isoformat()} for row in rows]

    def document_path(self, public_id: str, document_id: UUID, principal: Principal):
        with self.connect() as con:
            invoice_id = self._internal_invoice_id(con, public_id, principal)
            row = con.execute("""select storage_path,content_type from public.invoice_documents
                where organization_id=%s and invoice_id=%s and id=%s""",
                (principal.organization_id, invoice_id, document_id)).fetchone()
        if row is None:
            raise LookupError("Document not found")
        return row

    def record_document(self, public_id: str, document_id: UUID, path: str,
                        content_type: str, size: int, principal: Principal):
        if principal.role not in {"owner", "admin", "analyst"}:
            raise PermissionError("Role cannot upload invoice documents")
        with self.connect() as con:
            invoice_id = self._internal_invoice_id(con, public_id, principal)
            con.execute("""insert into public.invoice_documents
                (id,organization_id,invoice_id,storage_path,content_type,size_bytes,uploaded_by)
                values (%s,%s,%s,%s,%s,%s,%s)""",
                (document_id, principal.organization_id, invoice_id, path, content_type, size, principal.user_id))
            self._audit(con, principal, public_id, "DOCUMENT_UPLOADED", "Private invoice evidence uploaded",
                        f"{public_id} · {content_type} · {size} bytes")
