"""SQLite persistence for the local hackathon demo.

This is not multi-tenant production infrastructure. All records belong to a fixed
fictional demo tenant, and server binds to localhost by default.
"""
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from statistics import median
from .fixtures import SUPPLIERS
from .jinius import DemoJiniusAdapter
from .risk import assess_payment

TENANT = "asteria-demo"


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class Store:
    def __init__(self, db_path: str):
        self.path = db_path
        if db_path != ":memory:":
            Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        self.initialize()

    def connect(self) -> sqlite3.Connection:
        con = sqlite3.connect(self.path, timeout=10)
        con.row_factory = sqlite3.Row
        con.execute("PRAGMA foreign_keys=ON")
        return con

    def initialize(self) -> None:
        with self.connect() as con:
            con.executescript("""
                CREATE TABLE IF NOT EXISTS suppliers (
                    id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
                    name TEXT NOT NULL, short_name TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS payments_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    supplier_id TEXT NOT NULL REFERENCES suppliers(id),
                    invoice_number TEXT NOT NULL, amount_cents INTEGER NOT NULL,
                    creditor_account TEXT NOT NULL, paid_at TEXT NOT NULL);
                CREATE INDEX IF NOT EXISTS idx_history_supplier ON payments_history(supplier_id);
                CREATE TABLE IF NOT EXISTS invoices (
                    id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
                    supplier_id TEXT NOT NULL REFERENCES suppliers(id),
                    invoice_number TEXT NOT NULL, amount_cents INTEGER NOT NULL,
                    creditor_account TEXT NOT NULL, invoice_date TEXT NOT NULL,
                    source TEXT NOT NULL, risk_score INTEGER NOT NULL,
                    risk_level TEXT NOT NULL, risk_kind TEXT NOT NULL,
                    reason TEXT NOT NULL, signals_json TEXT NOT NULL,
                    status TEXT NOT NULL, verified_by TEXT, verified_note TEXT,
                    approved_by TEXT, updated_at TEXT NOT NULL);
                CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON invoices(tenant_id);
                CREATE TABLE IF NOT EXISTS audit_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT NOT NULL,
                    invoice_id TEXT, actor TEXT NOT NULL, action TEXT NOT NULL,
                    title TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL);
            """)
            exists = con.execute("SELECT 1 FROM suppliers LIMIT 1").fetchone()
            if not exists:
                self._seed(con)

    def _audit(self, con, *, invoice_id: str | None, actor: str, action: str, title: str, detail: str):
        con.execute("""INSERT INTO audit_events
            (tenant_id, invoice_id, actor, action, title, detail, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (TENANT, invoice_id, actor, action, title, detail, utcnow()))

    def _seed(self, con):
        for s in SUPPLIERS:
            con.execute("INSERT INTO suppliers VALUES (?,?,?,?)", (s["id"], TENANT, s["name"], s["short"]))
            for j in range(s["count"]):
                number = "MO-2128" if s["id"] == "SUP-002" and j == 2 else f'{s["prefix"]}-{j+1:03d}'
                con.execute("""INSERT INTO payments_history
                    (supplier_id, invoice_number, amount_cents, creditor_account, paid_at)
                    VALUES (?,?,?,?,?)""",
                    (s["id"], number, s["typical_cents"] + (j % 3 - 1) * 12000, s["account"], f"2026-09-{j % 27 + 1:02d}"))
        for item in DemoJiniusAdapter().list_invoices():
            self._insert_assessment(con, item.id, item.supplier_id, item.number,
                item.amount_cents, item.creditor_account, item.date, item.source)
        self._audit(con, invoice_id=None, actor="demo-seed", action="DEMO_IMPORT",
            title="Synthetic Jinius invoice batch imported",
            detail="4 synthetic invoices assessed using local rule engine; no Jinius API call")

    def reset_demo(self):
        with self.connect() as con:
            con.execute("DELETE FROM audit_events")
            con.execute("DELETE FROM invoices")
            con.execute("DELETE FROM payments_history")
            con.execute("DELETE FROM suppliers")
            self._seed(con)

    def _historical(self, con, supplier_id):
        rows = con.execute("SELECT * FROM payments_history WHERE supplier_id=?", (supplier_id,)).fetchall()
        return rows

    def _insert_assessment(self, con, invoice_id, supplier_id, invoice_number, amount_cents, creditor_account, invoice_date, source):
        history = self._historical(con, supplier_id)
        assessment = assess_payment(
            invoice_number=invoice_number, current_account=creditor_account,
            amount_cents=amount_cents,
            previous_accounts=(h["creditor_account"] for h in history),
            previous_paid_amounts_cents=(h["amount_cents"] for h in history),
            previously_paid_invoices=(h["invoice_number"] for h in history))
        con.execute("""INSERT INTO invoices
            (id,tenant_id,supplier_id,invoice_number,amount_cents,creditor_account,
             invoice_date,source,risk_score,risk_level,risk_kind,reason,signals_json,
             status,verified_by,verified_note,approved_by,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (invoice_id,TENANT,supplier_id,invoice_number,amount_cents,creditor_account,
             invoice_date,source,assessment.score,assessment.level,assessment.kind,
             assessment.reason,json.dumps(assessment.as_dict()["signals"]),
             assessment.recommended_status,None,None,None,utcnow()))
        self._audit(con, invoice_id=invoice_id, actor="trustpay-risk-engine", action="ASSESSED",
            title=f"Payment risk assessed · {assessment.level}",
            detail=f"{invoice_id} · {assessment.score}/100 · {assessment.reason}")
        return assessment

    def create_assessment(self, item: dict):
        with self.connect() as con:
            if not con.execute("SELECT 1 FROM suppliers WHERE id=? AND tenant_id=?", (item["supplier_id"], TENANT)).fetchone():
                raise LookupError("Unknown demo supplier")
            if con.execute("SELECT 1 FROM invoices WHERE id=?", (item["id"],)).fetchone():
                raise FileExistsError("An assessment with this ID already exists")
            self._insert_assessment(con, item["id"], item["supplier_id"],
                item["invoice_number"], item["amount_cents"],
                item["creditor_account"], item["invoice_date"], "manual_demo_submission")
        return self.invoice(item["id"])

    @staticmethod
    def mask(account: str) -> str:
        return "•••• " + account[-4:] if len(account) >= 4 else "••••"

    def _as_invoice(self, con, r):
        history = self._historical(con, r["supplier_id"])
        accounts = [h["creditor_account"] for h in history]
        canonical = max(sorted(set(accounts)), key=accounts.count) if accounts else ""
        signals = json.loads(r["signals_json"])
        return {
            "id":r["id"], "supplier_id":r["supplier_id"],
            "supplier":r["name"], "short":r["short_name"],
            "invoice":r["invoice_number"], "amount_cents":r["amount_cents"],
            "amount":r["amount_cents"] / 100,
            "iban":self.mask(r["creditor_account"]),
            "previous":self.mask(canonical) if canonical else "New supplier",
            "history":len(history), "date":r["invoice_date"],
            "risk":r["risk_score"], "level":r["risk_level"],
            "kind":r["risk_kind"], "reason":r["reason"],
            "signals":signals, "notes":[s["explanation"] for s in signals] or [r["reason"]],
            "status":r["status"], "verified":bool(r["verified_by"]),
            "verified_by":r["verified_by"], "approved_by":r["approved_by"],
            "reference":"Synthetic Jinius demo" if r["source"] == "jinius_demo_adapter" else "Manual demo assessment",
            "source":r["source"]}

    def invoices(self):
        with self.connect() as con:
            rows = con.execute("""SELECT i.*,s.name,s.short_name FROM invoices i
                JOIN suppliers s ON s.id=i.supplier_id
                WHERE i.tenant_id=? ORDER BY i.invoice_date DESC, i.id DESC""", (TENANT,)).fetchall()
            return [self._as_invoice(con,r) for r in rows]

    def invoice(self, invoice_id):
        with self.connect() as con:
            row = con.execute("""SELECT i.*,s.name,s.short_name FROM invoices i
                JOIN suppliers s ON s.id=i.supplier_id
                WHERE i.id=? AND i.tenant_id=?""", (invoice_id,TENANT)).fetchone()
            if row is None: raise LookupError("Invoice not found")
            return self._as_invoice(con, row)

    def suppliers(self):
        with self.connect() as con:
            result = []
            for s in con.execute("SELECT * FROM suppliers WHERE tenant_id=? ORDER BY name",(TENANT,)):
                history = self._historical(con,s["id"])
                accounts = [h["creditor_account"] for h in history]
                canonical = max(sorted(set(accounts)),key=accounts.count) if accounts else ""
                result.append({"id":s["id"],"name":s["name"],"short":s["short_name"],
                    "payment_count":len(history),"last4":self.mask(canonical),
                    "historical_median_eur":round(median([h["amount_cents"] for h in history])/100,2) if history else None})
            return result

    def audit(self):
        with self.connect() as con:
            events = con.execute("SELECT * FROM audit_events WHERE tenant_id=? ORDER BY id DESC LIMIT 200",(TENANT,)).fetchall()
            return [dict(e) for e in events]

    def transition(self, invoice_id: str, action: str, note: str = ""):
        with self.connect() as con:
            row = con.execute("SELECT * FROM invoices WHERE id=? AND tenant_id=?",(invoice_id,TENANT)).fetchone()
            if row is None: raise LookupError("Invoice not found")
            status, kind, score = row["status"], row["risk_kind"], row["risk_score"]
            if action == "verify":
                if kind == "duplicate" or status in {"approved", "blocked"}:
                    raise PermissionError("Blocked or already approved payments cannot be verified")
                if row["verified_by"]:
                    raise PermissionError("Independent verification has already been recorded")
                if len(note.strip()) < 12:
                    raise ValueError("Independent verification must include an evidence note (12+ characters)")
                actor = "risk.analyst@demo.local"
                con.execute("UPDATE invoices SET verified_by=?,verified_note=?,status='ready',updated_at=? WHERE id=?",
                    (actor,note.strip(),utcnow(),invoice_id))
                title,detail = "Independent callback recorded · simulated", f"{invoice_id} · analyst supplied evidence: {note.strip()}"
            elif action == "approve":
                if status != "ready":
                    raise PermissionError("Payment cannot be approved unless ready for review")
                if score >= 40 and not row["verified_by"]:
                    raise PermissionError("Risky payment requires independent verification before approval")
                actor = "finance.manager@demo.local"
                if row["verified_by"] == actor:
                    raise PermissionError("Maker-checker separation failed")
                con.execute("UPDATE invoices SET status='approved',approved_by=?,updated_at=? WHERE id=?",
                    (actor,utcnow(),invoice_id))
                title,detail = "Internal approval recorded — NO TRANSFER", f"{invoice_id} · finance manager approved demo decision; no bank payment initiated"
            elif action == "hold":
                if status in {"approved", "blocked"}:
                    raise PermissionError("This invoice cannot be placed on hold")
                actor = "risk.analyst@demo.local"
                con.execute("UPDATE invoices SET status='hold',updated_at=? WHERE id=?",(utcnow(),invoice_id))
                title,detail = "Invoice manually placed on hold", f"{invoice_id} · further investigation required"
            else:
                raise ValueError("Unknown action")
            self._audit(con,invoice_id=invoice_id,actor=actor,action=action.upper(),title=title,detail=detail)
        return self.invoice(invoice_id)
