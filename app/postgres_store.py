"""Tenant-scoped PostgreSQL persistence. Never falls back to demo SQLite."""

import json
import logging
import os
import re
import threading
from collections import Counter
from dataclasses import dataclass
from decimal import Decimal
from datetime import date
from statistics import median
from uuid import UUID, uuid4

import psycopg
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from .jinius import InvoiceSource
from .risk import assess_payment
from .security import AccountProtector, normalize_iban

logger = logging.getLogger(__name__)
SOURCE_LABELS = {"synthetic_seed": "Synthetic development seed", "uploaded": "Uploaded invoice",
                 "jinius_demo_adapter": "Synthetic Jinius demo"}
_PROVIDER_REFERENCE = re.compile(r"[A-Za-z0-9._-]{1,64}")
UNKNOWN_SUPPLIER = "Supplier is not known in this organization"


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
        self._pool: ConnectionPool | None = None
        self._pool_lock = threading.Lock()

    def connect(self):
        """One transaction on a reused connection: commits on success, rolls back on error.

        The pool opens lazily, so constructing a store never touches the network. Idle connections
        are recycled after 60s instead of being checked on every checkout, which would add a
        round trip to the remote database (measured: a burst of 50 drops from ~5.2s to ~2.1s median).
        prepare_threshold=None keeps Supabase's transaction pooler (port 6543) usable too.
        Each pooled connection holds one session-pooler slot, so keep TRUSTPAY_DB_POOL_SIZE small
        when several teammates run against the same project.
        """
        if self._pool is None:
            with self._pool_lock:
                if self._pool is None:
                    self._pool = ConnectionPool(
                        self.dsn, min_size=1, max_size=int(os.environ.get("TRUSTPAY_DB_POOL_SIZE", "5")),
                        timeout=10, max_idle=60, max_lifetime=600, open=True,
                        kwargs={"row_factory": dict_row, "connect_timeout": 5, "prepare_threshold": None})
        return self._pool.connection()

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
            "ai_explanation": row["ai_explanation"],
            "ai_explanation_method": row["ai_explanation_method"],
            "notes": [s["explanation"] for s in signal_list] or [row["explanation"]],
            "status": row["status"], "verified": bool(row["verified_by"]),
            "verified_by": str(row["verified_by"]) if row["verified_by"] else None,
            "approved_by": str(row["approved_by"]) if row["approved_by"] else None,
            "reference": SOURCE_LABELS.get(row["external_source"], "Manual assessment"),
            "source": row["external_source"],
        }

    _INVOICE_QUERY = """select i.*, s.public_id as supplier_public_id, s.name as supplier_name,
        b.iban_last4, a.id as assessment_id, a.score, a.severity, a.kind, a.explanation,
        t.explanation as ai_explanation, t.explanation_method as ai_explanation_method
        from public.invoices i
        join public.suppliers s on s.organization_id=i.organization_id and s.id=i.supplier_id
        join public.supplier_bank_accounts b on b.organization_id=i.organization_id and b.id=i.bank_account_id
        join lateral (select * from public.risk_assessments a
          where a.organization_id=i.organization_id and a.invoice_id=i.id
          order by a.assessed_at desc, a.id desc limit 1) a on true
        left join public.invoice_intakes t on t.organization_id=i.organization_id and t.invoice_id=i.id
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

    def _audit(self, con, principal: Principal, invoice_id: str, action: str, title: str, detail: str,
               target_type: str = "invoice"):
        con.execute("""insert into public.audit_logs
            (organization_id,actor_id,action,target_type,target_id,title,detail)
            values (%s,%s,%s,%s,%s,%s,%s)""",
            (principal.organization_id, principal.user_id, action, target_type, invoice_id, title, detail))

    def create_assessment(self, item: dict, principal: Principal):
        if principal.role not in {"owner", "admin", "analyst"}:
            raise PermissionError("Role cannot assess invoices")
        source = item.get("source", "manual")
        if source not in {"manual", "synthetic_seed", "uploaded"}:
            raise ValueError("Unknown assessment source")
        if item.get("currency", "EUR") != "EUR":
            raise ValueError("Only EUR assessments are supported by the current risk engine")
        org = principal.organization_id
        with self.connect() as con:
            supplier = None
            if item.get("supplier_id"):
                supplier = con.execute("""select id from public.suppliers
                    where organization_id=%s and public_id=%s""", (org, item["supplier_id"])).fetchone()
            elif source == "uploaded" and item.get("supplier_name"):
                supplier = con.execute("""select id from public.suppliers
                    where organization_id=%s and lower(name)=lower(%s)
                    order by created_at limit 1""", (org, item["supplier_name"])).fetchone()
                if supplier is None and item.get("create_new_supplier"):
                    supplier = con.execute("""insert into public.suppliers
                        (organization_id,public_id,name,registration_number,vat_number,status)
                        values (%s,%s,%s,%s,%s,'review') returning id""",
                        (org, f"NEW-{uuid4().hex[:12].upper()}", item["supplier_name"],
                         item.get("registration_number"), item.get("vat_number"))).fetchone()
            if supplier is None:
                raise LookupError("Supplier not found")
            self._record_assessment(con, item, principal, supplier["id"], source)
        return self.invoice(item["id"], principal)

    def _record_assessment(self, con, item: dict, principal: Principal, supplier_id: UUID, source: str) -> UUID:
        """The one deterministic assessment write path shared by manual, uploaded, seeded and synced invoices."""
        org = principal.organization_id
        ciphertext, fingerprint, last4 = self.protector.protect(item["creditor_account"])
        if con.execute("select 1 from public.invoices where organization_id=%s and public_id=%s",
                       (org, item["id"])).fetchone():
            raise FileExistsError("Assessment ID already exists")
        history = self._history(con, org, supplier_id)
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
            (org, supplier_id, ciphertext, fingerprint, last4)).fetchone()
        invoice = con.execute("""insert into public.invoices
            (organization_id,public_id,supplier_id,external_source,external_invoice_id,
             invoice_number,issue_date,due_date,currency,total_amount,bank_account_id,status,created_by)
            values (%s,%s,%s,%s,%s,%s,%s,%s,'EUR',%s,%s,%s,%s) returning id""",
            (org, item["id"], supplier_id, source, item.get("external_invoice_id", item["id"]), item["invoice_number"],
             item["invoice_date"], item.get("due_date"), Decimal(item["amount_cents"]) / 100,
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
        return invoice["id"]

    def assessment_history(self, invoice_id: str, principal: Principal):
        with self.connect() as con:
            internal_id = self._internal_invoice_id(con, invoice_id, principal)
            rows = con.execute("""select id,score,severity,kind,recommended_status,engine_version,
                explanation,evidence,assessed_at from public.risk_assessments
                where organization_id=%s and invoice_id=%s order by assessed_at desc,id desc""",
                (principal.organization_id, internal_id)).fetchall()
            return [{**row, "id": str(row["id"]), "assessed_at": row["assessed_at"].isoformat(),
                     "signals": [dict(signal) for signal in con.execute("""select code,severity,weight,
                        explanation,evidence from public.risk_signals where organization_id=%s and assessment_id=%s
                        order by weight desc,code""", (principal.organization_id, row["id"])).fetchall()]}
                    for row in rows]

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
        org = principal.organization_id
        with self.connect() as con:
            row = con.execute("""select status from public.integration_connections
                where organization_id=%s and provider='jinius'""", (org,)).fetchone()
        jinius = {"status": row["status"] if row else "disconnected", "adapter": "DemoJiniusAdapter",
                  "source_label": SOURCE_LABELS["jinius_demo_adapter"], "live_connected": False,
                  "sync_available": True,
                  "next_step": "Live sync needs the official Jinius sandbox contract and access (issue #2)"}
        try:
            with self.connect() as con:
                last_run = con.execute("""select r.id,r.status,r.started_at,r.finished_at,r.records_seen,
                    r.records_created,r.records_needs_review,r.records_skipped,r.safe_error from public.sync_runs r
                    join public.integration_connections c on c.organization_id=r.organization_id and c.id=r.connection_id
                    where r.organization_id=%s and c.provider='jinius' order by r.started_at desc, r.id desc limit 1""",
                    (org,)).fetchone()
                last_success = con.execute("""select max(r.finished_at) as at from public.sync_runs r
                    join public.integration_connections c on c.organization_id=r.organization_id and c.id=r.connection_id
                    where r.organization_id=%s and c.provider='jinius' and r.status='success'""", (org,)).fetchone()
                imported = con.execute("""select count(*) filter (where status='assessed') as assessed,
                    count(*) filter (where status='needs_review') as needs_review from public.integration_imports
                    where organization_id=%s and provider='jinius'""", (org,)).fetchone()
                review = con.execute("""select external_id,revision,review_reason,created_at,
                    evidence->>'supplier_reference' as supplier_reference from public.integration_imports
                    where organization_id=%s and provider='jinius' and status='needs_review'
                    order by created_at desc, external_id limit 50""", (org,)).fetchall()
        except (psycopg.errors.UndefinedTable, psycopg.errors.UndefinedColumn):
            # shortcut: hosted dev gets migrations by hand; until 20261124000100 is applied, report sync as unavailable
            logger.warning("integration_imports migration is not applied; Jinius sync is unavailable")
            jinius.update(sync_available=False,
                          next_step="Apply migration 20261124000100_integration_imports.sql to enable sync")
        else:
            jinius.update(
                last_run=self._sync_run(last_run) if last_run else None,
                last_success_at=last_success["at"].isoformat() if last_success["at"] else None,
                imported_count=imported["assessed"], needs_review_count=imported["needs_review"],
                needs_review=[{"external_id": r["external_id"], "revision": r["revision"],
                               "reason": r["review_reason"], "supplier_reference": r["supplier_reference"],
                               "resolvable": r["review_reason"] == UNKNOWN_SUPPLIER,
                               "created_at": r["created_at"].isoformat()}
                              for r in review])
        return {"jinius": jinius, "bank_payment": {"status": "disabled", "payment_initiation": False}}

    @staticmethod
    def _sync_run(row) -> dict:
        return {"id": str(row["id"]), "status": row["status"], "started_at": row["started_at"].isoformat(),
                "finished_at": row["finished_at"].isoformat() if row["finished_at"] else None,
                "records_seen": row["records_seen"], "records_created": row["records_created"],
                "records_needs_review": row["records_needs_review"], "records_skipped": row["records_skipped"],
                "safe_error": row["safe_error"]}

    def sync_invoices(self, adapter: InvoiceSource, principal: Principal, provider: str = "jinius") -> dict:
        """Pull provider invoices and assess each one once per (organization, provider, external id, revision).

        Never approves, never initiates payment: imported invoices enter the normal maker-checker queue with
        the person who ran the sync as maker. Unresolvable records are kept for human review, not assessed.
        """
        if principal.role not in {"owner", "admin"}:
            raise PermissionError("Only organization owners and admins can run an integration sync")
        org = principal.organization_id
        with self.connect() as con:
            connection = con.execute("""insert into public.integration_connections(organization_id,provider,configuration)
                values (%s,%s,%s) on conflict (organization_id,provider) do update set updated_at=now() returning id""",
                (org, provider, json.dumps({"adapter": type(adapter).__name__}))).fetchone()
            run = con.execute("""insert into public.sync_runs(organization_id,connection_id,status)
                values (%s,%s,'running') returning id""", (org, connection["id"])).fetchone()
        counts = Counter()
        safe_error = None
        try:
            for record in adapter.list_invoices():
                counts["seen"] += 1
                counts[self._import_invoice(record, getattr(adapter, "source", provider), provider,
                                            connection["id"], run["id"], principal)] += 1
        except Exception:  # the provider or one record failed: keep what committed, report a safe message only
            logger.exception("Integration sync %s failed", run["id"])
            safe_error = "Sync stopped before finishing. Imported records are kept and running the sync again is safe."
        status = "failed" if safe_error else "success"
        with self.connect() as con:
            row = con.execute("""update public.sync_runs set status=%s,finished_at=now(),records_seen=%s,
                records_created=%s,records_needs_review=%s,records_skipped=%s,safe_error=%s
                where organization_id=%s and id=%s returning *""",
                (status, counts["seen"], counts["assessed"], counts["needs_review"], counts["skipped"],
                 safe_error, org, run["id"])).fetchone()
            self._audit(con, principal, str(run["id"]), "INTEGRATION_SYNC",
                        "Jinius sync failed" if safe_error else "Jinius sync completed",
                        f"{SOURCE_LABELS.get(getattr(adapter, 'source', ''), provider)} · {counts['seen']} seen · "
                        f"{counts['assessed']} assessed · {counts['needs_review']} need review · "
                        f"{counts['skipped']} already imported", target_type="sync_run")
        return self._sync_run(row)

    @staticmethod
    def _import_problem(record) -> str | None:
        if not (_PROVIDER_REFERENCE.fullmatch(record.id or "") and _PROVIDER_REFERENCE.fullmatch(record.revision or "")):
            return "Provider invoice reference is missing or malformed"
        if not (record.number or "").strip() or not isinstance(record.amount_cents, int) or record.amount_cents <= 0:
            return "Invoice number or amount is missing"
        try:
            date.fromisoformat(record.date)
        except (TypeError, ValueError):
            return "Invoice date is missing or invalid"
        if not (record.creditor_account or "").strip():
            return "Invoice has no payment account"
        try:
            normalize_iban(record.creditor_account)
        except ValueError:
            return "Payment account is not a valid IBAN"
        return None

    @staticmethod
    def _import_item(record) -> dict:
        return {"id": f"JIN-{record.id}-r{record.revision}", "external_invoice_id": record.id,
                "invoice_number": record.number, "amount_cents": record.amount_cents,
                "creditor_account": record.creditor_account, "invoice_date": record.date}

    def resolve_import(self, external_id: str, revision: str, supplier_public_id: str,
                       adapter: InvoiceSource, principal: Principal, provider: str = "jinius") -> dict:
        """Human review: assign an existing supplier to an unknown-supplier import, then assess it once."""
        if principal.role not in {"owner", "admin", "analyst"}:
            raise PermissionError("Role cannot resolve imported invoices")
        org = principal.organization_id
        with self.connect() as con:
            row = con.execute("""select id,status,review_reason,source from public.integration_imports
                where organization_id=%s and provider=%s and external_id=%s and revision=%s for update""",
                (org, provider, external_id, revision)).fetchone()
            if row is None:
                raise LookupError("Imported invoice not found")
            if row["status"] != "needs_review" or row["review_reason"] != UNKNOWN_SUPPLIER:
                raise ValueError("Only imports waiting for an unknown supplier can be resolved here")
            supplier = con.execute("""select id from public.suppliers where organization_id=%s and public_id=%s""",
                                   (org, supplier_public_id)).fetchone()
            if supplier is None:
                raise LookupError("Supplier not found")
            # The full IBAN is never stored with the import, so the provider stays the source of truth.
            record = next((r for r in adapter.list_invoices() if r.id == external_id and r.revision == revision), None)
            if record is None:
                raise ValueError("The provider no longer returns this invoice revision")
            if (problem := self._import_problem(record)) is not None:
                raise ValueError(problem)
            invoice_id = self._record_assessment(con, self._import_item(record), principal, supplier["id"],
                                                 row["source"])
            con.execute("""update public.integration_imports set status='assessed',invoice_id=%s,review_reason=null,
                updated_at=now() where organization_id=%s and id=%s""", (invoice_id, org, row["id"]))
            item_id = self._import_item(record)["id"]
            self._audit(con, principal, f"{external_id}@{revision}", "IMPORT_RESOLVED",
                        "Imported invoice resolved by human review",
                        f"Supplier {supplier_public_id} assigned · assessed as {item_id}",
                        target_type="integration_import")
        return self.invoice(item_id, principal)

    def _import_invoice(self, record, source: str, provider: str, connection_id: UUID, run_id: UUID,
                        principal: Principal) -> str:
        org = principal.organization_id
        evidence = {"supplier_reference": record.supplier_id, "invoice_number": record.number,
                    "amount_cents": record.amount_cents, "issue_date": record.date,
                    "account_last4": (record.creditor_account or "")[-4:] or None}
        with self.connect() as con:
            # The claim row makes re-syncs and concurrent syncs idempotent; it rolls back with any failure below.
            claim = con.execute("""insert into public.integration_imports
                (organization_id,connection_id,sync_run_id,provider,external_id,revision,source,status,evidence)
                values (%s,%s,%s,%s,%s,%s,%s,'needs_review',%s)
                on conflict (organization_id,provider,external_id,revision) do nothing returning id""",
                (org, connection_id, run_id, provider, (record.id or "")[:200], (record.revision or "")[:200], source,
                 json.dumps(evidence))).fetchone()
            if claim is None:
                return "skipped"
            reason = self._import_problem(record)
            supplier = None
            if reason is None:
                supplier = con.execute("""select id from public.suppliers where organization_id=%s and public_id=%s""",
                                       (org, record.supplier_id)).fetchone()
                if supplier is None:
                    reason = UNKNOWN_SUPPLIER
            invoice_id = None
            if reason is None:
                try:
                    invoice_id = self._record_assessment(con, self._import_item(record), principal,
                                                         supplier["id"], source)
                except FileExistsError:
                    reason = "An invoice with this provider reference already exists"
            if invoice_id:
                con.execute("""update public.integration_imports set status='assessed',invoice_id=%s,updated_at=now()
                    where organization_id=%s and id=%s""", (invoice_id, org, claim["id"]))
                return "assessed"
            con.execute("""update public.integration_imports set review_reason=%s,updated_at=now()
                where organization_id=%s and id=%s""", (reason, org, claim["id"]))
            self._audit(con, principal, f"{record.id}@{record.revision}", "IMPORT_NEEDS_REVIEW",
                        "Imported invoice needs human review", reason, target_type="integration_import")
            return "needs_review"

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
