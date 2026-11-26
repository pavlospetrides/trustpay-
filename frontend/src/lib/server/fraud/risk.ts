export interface RiskSignal {
  code: string;
  weight: number;
  explanation: string;
  severity: "critical" | "review";
}

export interface Assessment {
  score: number;
  level: "critical" | "review" | "low";
  recommended_status: "blocked" | "needs_review" | "ready";
  signals: RiskSignal[];
  reason: string;
  kind: "duplicate" | "iban" | "amount" | "new" | "normal";
}

export interface RiskInput {
  invoiceNumber: string;
  currentAccount: string;
  amountCents: number;
  previousAccounts: Iterable<string>;
  previousPaidAmountsCents: Iterable<number>;
  previouslyPaidInvoices: Iterable<string>;
  /** Invoice numbers of this supplier's other invoices that are not rejected (open, held, blocked or approved). */
  otherOpenInvoices?: Iterable<string>;
  /** Invoice numbers of this supplier's rejected invoices. A resubmission needs independent verification. */
  rejectedInvoices?: Iterable<string>;
  /** When the destination account was last independently verified on a non-rejected invoice within the trust window (ISO date). */
  accountVerifiedOn?: string | null;
  /** Identity fields that differ between the uploaded invoice and the supplier record. */
  identityMismatches?: IdentityField[];
}

export type IdentityField = "vat_number" | "registration_number" | "supplier_name";
export interface IdentityValues { vat_number?: string | null; registration_number?: string | null; supplier_name?: string | null; country?: string | null }

/** How long an independent account verification lowers the changed-account signal. */
export const VERIFIED_ACCOUNT_TRUST_DAYS = 90;

// Only a trailing legal form is dropped from names ("Aegean Co Supplies" keeps its "Co").
const TRAILING_LEGAL_FORM = /(\s+(limited|ltd|llc|plc|inc|s\.?a|gmbh|co|company|corp|corporation)\.?)+$/u;
// Compatibility-decompose and drop accents (Greek tonos, Latin diacritics), then case-fold and keep letters and digits.
const plain = (value: string) => casefold(value.normalize("NFKD").replace(/\p{M}/gu, "")).replace(/[^\p{L}\p{N}]/gu, "");
// Prefixes that may be left out: a VAT number's country code, or "HE" for a company in the Cyprus registry.
const omissiblePrefix = (field: IdentityField, value: string, country: string) => (field === "vat_number" ? /^[a-z]{2}(?=\d)/ : country === "CY" ? /^he(?=\d)/ : /$^/).exec(value)?.[0] ?? "";
function sameIdentity(field: IdentityField, left: string, right: string, country: string): boolean {
  if (field === "supplier_name") return plain(casefold(left.normalize("NFKC")).replace(TRAILING_LEGAL_FORM, "")) === plain(casefold(right.normalize("NFKC")).replace(TRAILING_LEGAL_FORM, ""));
  const [a, b] = [plain(left), plain(right)];
  if (a === b) return true;
  // A prefix written on one side only may be omitted (CY10012345A vs 10012345A, HE12345 vs 12345); two different prefixes never match (CY vs GB).
  const [pa, pb] = [omissiblePrefix(field, a, country), omissiblePrefix(field, b, country)];
  return !(pa && pb) && a.slice(pa.length) === b.slice(pb.length);
}

/** Fields present on both sides that do not match after normalisation. Missing values are never compared. */
export function identityMismatches(invoice: IdentityValues, supplier: IdentityValues): IdentityField[] {
  return (["vat_number", "registration_number", "supplier_name"] as const).filter((field) => {
    const left = invoice[field]?.trim(), right = supplier[field]?.trim();
    return Boolean(left && right) && !sameIdentity(field, left!, right!, (supplier.country ?? "").trim().toUpperCase());
  });
}

// Python's str.isspace() set: unlike JavaScript's \s it includes U+001C–U+001F and U+0085 and excludes U+FEFF.
const PY_SPACE = "\\t\\n\\v\\f\\r\\x1c-\\x20\\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";
const PY_EDGES = new RegExp(`^[${PY_SPACE}]+|[${PY_SPACE}]+$`, "g"), PY_SPACES = new RegExp(`[${PY_SPACE}]+`, "g");
const pyStrip = (value: string) => value.replace(PY_EDGES, "");
// Dashes are ignored like spaces, matching normalizeIban, so "CY17-0020…" and "CY170020…" are one account in both stores.
export const normalizedAccount = (value: string) => value.toUpperCase().replace(PY_SPACES, "").replaceAll("-", "");
// Python's str.casefold, checked against every code point: upper-then-lower per character gives the same matches
// (Cherokee folds the other way round but groups the same letters), except ẞ/ß, which casefold turns into "ss",
// and Unicode 16 letters that Python 3.13 does not know.
// Dotless ı stays as it is, as casefold keeps it.
const casefold = (value: string) => [...value].map((char) => char === "ı" ? char : char.toUpperCase().toLowerCase()).join("").replace(/ß/g, "ss");

/** Python's f"{x:.2f}": exact binary value, ties (x*8 odd) round half to even, where toFixed rounds up. */
export function pythonFixed2(value: number): string {
  if (value >= 0 && Number.isInteger(value * 8) && (value * 8) % 2 === 1) {
    const cents = Math.floor(value * 100);
    return ((cents % 2 === 0 ? cents : cents + 1) / 100).toFixed(2);
  }
  return value.toFixed(2);
}
const pythonGrouped2 = (value: number) => pythonFixed2(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const medianTwice = (amounts: number[]): number => {
  const sorted = [...amounts].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] * 2 : sorted[middle - 1] + sorted[middle];
};

function ratioOneDecimal(amount: number, typicalTwice: number): string {
  const numerator = BigInt(amount) * 20n;
  const denominator = BigInt(typicalTwice);
  const whole = numerator / denominator;
  const remainder = numerator % denominator;
  const rounded = whole + (remainder * 2n > denominator || (remainder * 2n === denominator && whole % 2n !== 0n) ? 1n : 0n);
  return `${rounded / 10n}.${rounded % 10n}`;
}

export function assessPayment(input: RiskInput): Assessment {
  const { invoiceNumber, currentAccount, amountCents } = input;
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) throw new Error("amount_cents must be positive");
  if (!pyStrip(invoiceNumber) || !pyStrip(currentAccount)) throw new Error("invoice_number and current_account are required");

  const accounts = [...input.previousAccounts].filter((account) => pyStrip(account)).map(normalizedAccount);
  const amounts = [...input.previousPaidAmountsCents].filter((amount) => amount > 0);
  const paid = new Set([...input.previouslyPaidInvoices].map((value) => casefold(pyStrip(value))));
  const open = new Set([...(input.otherOpenInvoices ?? [])].map((value) => casefold(pyStrip(value))));
  const rejected = new Set([...(input.rejectedInvoices ?? [])].map((value) => casefold(pyStrip(value))));
  const signals: RiskSignal[] = [];

  if (paid.has(casefold(pyStrip(invoiceNumber)))) {
    signals.push({ code: "DUPLICATE_PAID_INVOICE", weight: 100, explanation: "This supplier's invoice number matches a previously paid invoice. A second payment must be blocked.", severity: "critical" });
  } else if (open.has(casefold(pyStrip(invoiceNumber)))) {
    signals.push({ code: "DUPLICATE_OPEN_INVOICE", weight: 100, explanation: "This supplier's invoice number matches another invoice that is already open or approved. Only one copy may be approved; reject one before continuing.", severity: "critical" });
  } else if (rejected.has(casefold(pyStrip(invoiceNumber)))) {
    signals.push({ code: "PREVIOUSLY_REJECTED_INVOICE", weight: 40, explanation: "A copy of this supplier invoice number was rejected before. Independently verify this resubmission before approval.", severity: "review" });
  }
  if (accounts.length) {
    const counts = new Map<string, number>();
    for (const account of accounts) counts.set(account, (counts.get(account) ?? 0) + 1);
    const canonical = [...counts.keys()].sort().reduce((best, account) => (counts.get(account)! > counts.get(best)! ? account : best));
    if (normalizedAccount(currentAccount) !== canonical && input.accountVerifiedOn) {
      signals.push({ code: "BANK_ACCOUNT_VERIFIED_CHANGE", weight: 25, explanation: `The payment destination differs from the account used in ${counts.get(canonical)} of ${accounts.length} prior supplier payments, but it was independently verified on ${input.accountVerifiedOn}. Check that evidence before approval.`, severity: "review" });
    } else if (normalizedAccount(currentAccount) !== canonical) {
      signals.push({ code: "BANK_ACCOUNT_CHANGED", weight: 75, explanation: `The payment destination differs from the account used in ${counts.get(canonical)} of ${accounts.length} prior supplier payments. Independently verify the new account.`, severity: "critical" });
    }
  } else {
    signals.push({ code: "NEW_SUPPLIER_OR_NO_HISTORY", weight: 45, explanation: "No historical payments were found for this supplier. Confirm identity and payment instructions before approval.", severity: "review" });
  }
  if (amounts.length >= 3) {
    const typicalTwice = medianTwice(amounts);
    const ratio = ratioOneDecimal(amountCents, typicalTwice);
    const typical = pythonGrouped2(typicalTwice / 2 / 100);
    if (BigInt(amountCents) * 4n >= BigInt(typicalTwice) * 5n) {
      signals.push({ code: "LARGE_AMOUNT_DEVIATION", weight: 65, explanation: `Amount is ${ratio}× the median of ${amounts.length} historical payments (€${typical}).`, severity: "review" });
    } else if (BigInt(amountCents) * 8n >= BigInt(typicalTwice) * 7n) {
      signals.push({ code: "ELEVATED_AMOUNT", weight: 40, explanation: `Amount is ${ratio}× the historical median (€${typical}).`, severity: "review" });
    }
  }
  const mismatches = input.identityMismatches ?? [];
  const strong = mismatches.filter((field) => field !== "supplier_name");
  if (strong.length) {
    signals.push({ code: "SUPPLIER_IDENTITY_MISMATCH", weight: 50, explanation: `The invoice's ${strong.map((field) => field.replace("_", " ")).join(" and ")} does not match the selected supplier record. Confirm who issued this invoice before approval.`, severity: "review" });
  }
  if (mismatches.includes("supplier_name")) {
    signals.push({ code: "SUPPLIER_NAME_MISMATCH", weight: 20, explanation: "The supplier name on the invoice differs from the selected supplier record.", severity: "review" });
  }
  const score = Math.min(100, signals.reduce((sum, signal) => sum + signal.weight, 0));
  const duplicate = signals.some((signal) => signal.code === "DUPLICATE_PAID_INVOICE" || signal.code === "DUPLICATE_OPEN_INVOICE");
  return {
    score,
    level: score >= 75 ? "critical" : score >= 40 ? "review" : "low",
    recommended_status: duplicate ? "blocked" : score >= 40 ? "needs_review" : "ready",
    signals,
    reason: signals[0]?.explanation ?? "Account, invoice reference and amount are consistent with the available historical data.",
    kind: duplicate ? "duplicate" : signals.some((signal) => signal.code === "BANK_ACCOUNT_CHANGED" || signal.code === "BANK_ACCOUNT_VERIFIED_CHANGE") ? "iban" : signals.some((signal) => signal.code === "LARGE_AMOUNT_DEVIATION" || signal.code === "ELEVATED_AMOUNT") ? "amount" : signals.length ? "new" : "normal",
  };
}
