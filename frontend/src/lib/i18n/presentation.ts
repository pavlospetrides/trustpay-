import english from "./messages/en.json";
import { type Localizer, type MessageKey } from "./core";

const statusKeys: Readonly<Record<string, MessageKey>> = {
  "ready": "ready-for-approval",
  "needs_review": "needs-review",
  "blocked": "blocked",
  "hold": "on-hold",
  "approved": "internally-approved",
  "rejected": "rejected",
};

const levelKeys: Readonly<Record<string, MessageKey>> = {
  "low": "low",
  "review": "review",
  "critical": "critical",
};

const connectionKeys: Readonly<Record<string, MessageKey>> = {
  "mock": "mock",
  "disconnected": "disconnected",
  "sandbox": "sandbox",
  "connected": "connected",
  "error": "error",
  "disabled": "disabled",
};

const modeKeys: Readonly<Record<string, MessageKey>> = {
  "synthetic-local-demo": "local-demo",
  "supabase-postgres": "supabase-postgresql",
  "auditable-rules-v1": "auditable-rules-v1",
};

const signalKeys: Readonly<Record<string, MessageKey>> = {
  "DUPLICATE_PAID_INVOICE": "duplicate-paid-invoice",
  "DUPLICATE_OPEN_INVOICE": "duplicate-open-invoice",
  "PREVIOUSLY_REJECTED_INVOICE": "previously-rejected-invoice",
  "BANK_ACCOUNT_CHANGED": "bank-account-changed",
  "BANK_ACCOUNT_VERIFIED_CHANGE": "bank-account-verified-change",
  "NEW_SUPPLIER_OR_NO_HISTORY": "new-supplier-or-no-history",
  "LARGE_AMOUNT_DEVIATION": "large-amount-deviation",
  "ELEVATED_AMOUNT": "elevated-amount",
  "SUPPLIER_IDENTITY_MISMATCH": "supplier-identity-mismatch",
  "SUPPLIER_NAME_MISMATCH": "supplier-name-mismatch",
};

const auditKeys: Readonly<Record<string, MessageKey>> = {
  "DEMO_IMPORT": "imported-demo-batch",
  "ASSESSED": "assess",
  "VERIFY": "verify",
  "APPROVE": "approve",
  "HOLD": "hold",
  "RELEASE": "release",
  "REJECT": "reject",
  "DOCUMENT_UPLOADED": "upload",
  "INTAKE_UPLOADED": "intake-uploaded",
  "INTAKE_REVIEWED": "intake-reviewed",
  "INTAKE_REEXTRACTED": "intake-reextracted",
  "INTAKE_ANALYZED": "intake-analyzed",
  "INTEGRATION_SYNC": "integration-sync",
  "IMPORT_NEEDS_REVIEW": "import-needs-review",
  "IMPORT_RESOLVED": "import-resolved",
};

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function template(key: MessageKey) {
  const parts = english[key].split(/(\{p\d+\})/g);
  const pattern = new RegExp(`^${parts.map((part, index) => index % 2 ? "([\\s\\S]+?)" : escape(part)).join("")}$`);
  return (value: string) => pattern.exec(value)?.slice(1);
}
const templates = Object.fromEntries([
  "risk.account-verified", "risk.account-changed", "risk.large-amount", "risk.elevated-amount", "risk.identity-mismatch",
  "payment-risk-assessed",
  "audit.assessment-detail",
  "analyst-supplied-evidence",
  "finance-manager-approved-demo-decision-no-bank-payment",
  "returned-to-the-review-queue",
  "reason",
  "further-investigation-required",
  "policy-score-100",
  "audit.document-detail",
  "supplier-assigned-assessed-as",
  "synthetic-jinius-demo-seen-assessed-need-review-already",
  "sync-finished-assessed-sent-to-human-review-already",
  "request-failed",
].map(key => [key, template(key as MessageKey)]));

export function presentation(i18n: Localizer) {
  const { t, text, locale, date, list, number, euro, hasTranslation } = i18n;
  const label = (map: Readonly<Record<string, MessageKey>>, code: string) => Object.hasOwn(map, code) ? t(map[code]) : code;
  const localizedNumber = (value: string, fractionDigits?: number) => number(Number(value), { minimumFractionDigits: fractionDigits });
  const currency = (value: string) => euro(Math.round(Number(value.replaceAll(",", "")) * 100));
  const render = (key: MessageKey, values: string[]) => t(key, Object.fromEntries(values.map((value, index) => [`p${index}`, value])));

  function riskText(value: string) {
    if (locale === "en") return value;
    const amount = templates["risk.large-amount"](value);
    if (amount) return hasTranslation("risk.large-amount") ? render("risk.large-amount", [localizedNumber(amount[0], 1), localizedNumber(amount[1]), currency(amount[2])]) : value;
    const elevated = templates["risk.elevated-amount"](value);
    if (elevated) return hasTranslation("risk.elevated-amount") ? render("risk.elevated-amount", [localizedNumber(elevated[0], 1), currency(elevated[1])]) : value;
    const verified = templates["risk.account-verified"](value);
    if (verified) return render("risk.account-verified", [localizedNumber(verified[0]), localizedNumber(verified[1]), date(verified[2])]);
    const changed = templates["risk.account-changed"](value);
    if (changed) return render("risk.account-changed", changed.map(item => localizedNumber(item)));
    const identity = templates["risk.identity-mismatch"](value);
    if (identity) return render("risk.identity-mismatch", [
      list(identity[0].split(" and ").map(field => field === "vat number" ? t("vat-number") : t("registration-number"))),
    ]);
    return text(value);
  }

  function auditTitle(event: { title: string; action: string }) {
    if (locale === "en") return event.title;
    const assessedKey = "payment-risk-assessed";
    const assessed = templates[assessedKey](event.title);
    if (assessed) return render(assessedKey, [label(levelKeys, assessed[0])]);
    if (event.action.startsWith("INTAKE_")) return label(auditKeys, event.action);
    return text(event.title);
  }

  function auditDetail(value: string) {
    if (locale === "en") return value;
    const assessed = templates["audit.assessment-detail"](value);
    if (assessed) return render("audit.assessment-detail", [assessed[0], localizedNumber(assessed[1]), riskText(assessed[2])]);
    const doc = templates["audit.document-detail"](value);
    if (doc) return render("audit.document-detail", [doc[0], doc[1], localizedNumber(doc[2])]);
    for (const key of ["analyst-supplied-evidence", "finance-manager-approved-demo-decision-no-bank-payment", "returned-to-the-review-queue", "reason", "further-investigation-required", "policy-score-100", "supplier-assigned-assessed-as", "synthetic-jinius-demo-seen-assessed-need-review-already"] as const) {
      const values = templates[key](value);
      if (values) return render(key, values);
    }
    return text(value);
  }

  function message(value: string | null | undefined) {
    if (!value || locale === "en") return value ?? "";
    const exact = text(value);
    if (value !== exact) return exact;
    for (const key of ["request-failed", "sync-finished-assessed-sent-to-human-review-already"] as const) {
      const values = templates[key](value);
      if (values) return render(key, values.map(item => /^\d+$/.test(item) ? localizedNumber(item) : item));
    }
    if (value.includes("; ") && value.startsWith("Invalid ")) return value.split("; ").map(validationMessage).join(" · ");
    return validationMessage(value);
  }

  function validationMessage(value: string) {
    const known = text(value);
    if (known !== value) return known;
    if (/^Too small: expected string to have >=\d+ characters/.test(value)) {
      const limit = value.match(/>=(\d+)/)?.[1];
      return t("use-at-least-characters", { p0: Number(limit) });
    }
    if (/^(Invalid input:|Invalid string:|Invalid UUID|Invalid option:|Too small:|Too big:|Unrecognized key)/.test(value)) {
      return t("check-the-value-in-this-field");
    }
    return value;
  }

  return {
    riskText, auditTitle, auditDetail, message,
    statusLabel: (status: string) => label(statusKeys, status),
    levelLabel: (level: string) => label(levelKeys, level),
    connectionLabel: (status: string) => label(connectionKeys, status),
    modeLabel: (mode: string) => label(modeKeys, mode),
    signalLabel: (code: string) => locale === "en" ? code.replaceAll("_", " ") : label(signalKeys, code),
    auditAction: (action: string) => locale === "en" ? action : label(auditKeys, action),
    supplierDestination: (value: string) => value === "New supplier" ? t("new-supplier") : value,
  };
}
